import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from '../../apps/web/core/store.js';
import {createHarness} from '../../apps/web/core/harness.js';
import {bridgeStatus,phoneInputError} from '../../apps/web/core/bridge-status.js';
import {executePhonePlan} from '../../apps/web/core/plan.js';
const done={text:'Understood.',toolCalls:[]};
const provider={id:'fixture',protocol:'openai',baseUrl:'https://fixture.invalid',model:'fixture'};
async function setup(mode='task'){const store=await openStore({memory:true});await store.saveSettings({providers:[provider],activeProviderId:'fixture'});return {store,session:await store.createSession({mode})};}
const runtime=request=>request.messages.filter(m=>m.text?.startsWith('Harness runtime context')).map(m=>JSON.parse(m.text.split('\n').slice(1).join('\n')));
const trusted={bridgeConnection:'connected',bluetoothConnection:'connected',inputVerified:true,identityVerified:true,bindingVerified:true,leaseVerified:true,executionEnabled:true,boardId:'board',bootId:'boot',targetId:'phone',clientId:'client',leaseId:'lease',orientationEpoch:0,inputState:'released',capabilities:{operations:['home']},knownFrames:new Map([['frame',{targetId:'phone',orientationEpoch:0}]])};
const plan=sessionId=>({version:1,planId:'test-plan',sessionId,boardId:'board',targetId:'phone',basedOnFrameId:'frame',orientationEpoch:0,ttlMs:15000,maxExecutionMs:15000,steps:[{id:'home',op:'home'}]});

test('chat receives passive bridge changes each model round without accessing phone adapters',async()=>{
 const {store,session}=await setup('chat');let status='connected',calls=0,reads=0;
 const forbidden=new Proxy({},{get(){throw new Error('Chat accessed a phone adapter');}});
 const h=createHarness({store,device:forbidden,capture:forbidden,getContext:()=>{throw new Error('Chat polled hardware');},getDeviceStatus:()=>{reads++;return {bridgeConnection:status};},invoke:async request=>{
  const snapshot=runtime(request).at(-1);assert.equal(snapshot.device.bridgeConnection,status);assert.equal(snapshot.device.executionEnabled,false);assert.ok(!request.tools.some(t=>t.name.startsWith('phone_')));
  if(calls++===0){status='disconnected';return {text:'',toolCalls:[{id:'local',name:'skills_list',arguments:{}}]};}return done;
 }});
 await h.run({sessionId:session.id,text:'Can you still help?'});assert.equal(calls,2);assert.equal(reads,2);assert.equal((await store.getMessages(session.id)).filter(m=>m.internal).length,2);
});

test('an offline tool call returns an explicit bridge error with no input or retry',async()=>{
 const {store,session}=await setup();let models=0,inputs=0;
 const h=createHarness({store,getContext:()=>({...trusted,bridgeConnection:'disconnected'}),executePlan:async()=>{inputs++;},invoke:async request=>{
  models++;assert.equal(runtime(request).at(-1).device.bridgeConnection,'disconnected');assert.equal(request.tools.some(t=>t.name==='phone_execute_plan'),false);
  return {text:'I will press Home.',toolCalls:[{id:'late-call',name:'phone_execute_plan',arguments:{plan:plan(session.id)}}]};
 }});
 await h.run({sessionId:session.id,text:'Press Home'});const messages=await store.getMessages(session.id),failure=JSON.parse(messages.find(m=>m.role==='tool').text);
 assert.equal(failure.code,'DEVICE_BRIDGE_UNAVAILABLE');assert.equal(failure.retryable,false);assert.equal(failure.reason,'bridge_unavailable');assert.equal(inputs,0);assert.equal(models,1);assert.match(messages.at(-1).text,/ESP32/);
});

test('disconnect during model latency prevents a previously advertised operation',async()=>{
 const {store,session}=await setup();let connected=true,inputs=0;
 const h=createHarness({store,getContext:()=>({...trusted,bridgeConnection:connected?'connected':'disconnected'}),executePlan:async()=>{inputs++;},invoke:async request=>{assert.ok(request.tools.some(t=>t.name==='phone_execute_plan'));connected=false;return {text:'',toolCalls:[{id:'late',name:'phone_execute_plan',arguments:{plan:plan(session.id)}}]};}});
 await h.run({sessionId:session.id,text:'Press Home'});assert.equal(inputs,0);assert.equal(JSON.parse((await store.getMessages(session.id)).find(m=>m.role==='tool').text).code,'DEVICE_BRIDGE_UNAVAILABLE');
});

test('network, Bluetooth and input-test failures retain distinct causes',()=>{
 assert.equal(phoneInputError({...trusted,bridgeConnection:'disconnected'}).code,'DEVICE_BRIDGE_UNAVAILABLE');
 assert.equal(phoneInputError({...trusted,bluetoothConnection:'disconnected'}).code,'DEVICE_BLUETOOTH_UNAVAILABLE');
 assert.equal(phoneInputError({...trusted,bindingVerified:false,inputVerified:false}).code,'DEVICE_INPUT_UNVERIFIED');
 assert.equal(phoneInputError({...trusted,inputVerified:false}).code,'DEVICE_INPUT_UNVERIFIED');
 assert.equal(phoneInputError(trusted),null);assert.equal(bridgeStatus({knownFrames:new Map([['f',{}]])}).bridgeConnection,'unknown');
});

test('a bridge loss immediately before a segment preserves its explicit failure cause',async()=>{
 let reads=0,inputs=0;const context={...trusted,sessionId:'session',mode:'task',getState:()=>({...trusted,mode:'task',bridgeConnection:++reads>=2?'disconnected':'connected'})};
 const result=await executePhonePlan(plan('session'),{context,device:{submitSegment:async()=>{inputs++;},getResult:async()=>{},release:async()=>{}}});
 assert.equal(result.code,'DEVICE_BRIDGE_UNAVAILABLE');assert.equal(result.status,'failed');assert.equal(inputs,0);
});

test('preparing clipboard text pauses after a local queue receipt and sends no phone input',async()=>{
 const {store,session}=await setup();let models=0,inputs=0;const prepared=[];
 const h=createHarness({store,getContext:()=>trusted,executePlan:async()=>{inputs++;},clipboard:{prepare:args=>{prepared.push(args);return {status:'awaiting_user_action',sessionId:args.sessionId,targetId:args.targetId,requestId:'copy',characters:args.text.length};}},invoke:async request=>{models++;assert.ok(request.tools.some(t=>t.name==='phone_prepare_clipboard'));return {text:'',toolCalls:[{id:'prepare',name:'phone_prepare_clipboard',arguments:{text:'中文 long text'}},{id:'must-not-paste',name:'phone_execute_plan',arguments:{plan:plan(session.id)}}]};}});
 await h.run({sessionId:session.id,text:'Type this text'});assert.deepEqual(prepared,[{text:'中文 long text',sessionId:session.id,targetId:'phone'}]);assert.equal(inputs,0);assert.equal(models,1);
 const messages=await store.getMessages(session.id);assert.equal(JSON.parse(messages.find(m=>m.toolCallId==='prepare').text).status,'awaiting_user_action');assert.equal(JSON.parse(messages.find(m=>m.toolCallId==='must-not-paste').text).status,'error');assert.equal((await store.getSession(session.id)).activeRun,undefined);
});

test('offline clipboard preparation fails as missing bridge without queuing text',async()=>{
 const {store,session}=await setup();let prepared=0;const h=createHarness({store,getContext:()=>({...trusted,bridgeConnection:'disconnected'}),clipboard:{prepare:()=>{prepared++;}},invoke:async()=>({text:'',toolCalls:[{id:'clipboard',name:'phone_prepare_clipboard',arguments:{text:'Must not queue'}}]})});
 await h.run({sessionId:session.id,text:'Type this'});assert.equal(prepared,0);assert.equal(JSON.parse((await store.getMessages(session.id)).find(m=>m.role==='tool').text).code,'DEVICE_BRIDGE_UNAVAILABLE');
});

test('bridge loss after submission keeps the input outcome unknown and does not retry',async()=>{
 let connected=true,inputs=0,polls=0;const context={...trusted,sessionId:'session',mode:'task',getState:()=>({...trusted,mode:'task',bridgeConnection:connected?'connected':'disconnected'})};
 const result=await executePhonePlan(plan('session'),{context,device:{submitSegment:async()=>{inputs++;connected=false;throw new Error('Disconnected after submit');},getResult:async()=>{polls++;},release:async()=>{throw new Error('offline');}}});
 assert.equal(result.code,'DEVICE_BRIDGE_UNAVAILABLE');assert.equal(result.status,'unknown');assert.equal(result.inputState,'unknown');assert.equal(inputs,1);assert.equal(polls,0);
});

test('matching clipboard metadata reaches each model round without text or unrelated-target receipts',async()=>{
 const {store,session}=await setup();let turns=0;
 let snapshot={requestId:'copy-1',sessionId:session.id,targetId:'phone',status:'awaiting_user_action',characters:5,text:'PRIVATE-TEXT'};
 const h=createHarness({store,getContext:()=>trusted,clipboard:{getSnapshot:()=>snapshot},invoke:async request=>{
  const value=runtime(request).at(-1).clipboard;assert.equal(value.status,turns?'copied':'awaiting_user_action');assert.equal(value.systemClipboardUnchanged,false);assert.equal(value.text,undefined);
  if(!turns++){snapshot={...snapshot,status:'copied',copiedAt:123};return {text:'',toolCalls:[{id:'local',name:'skills_list',arguments:{}}]};}return done;
 }});
 await h.run({sessionId:session.id,text:'Check clipboard status'});assert.equal((await store.getMessages(session.id)).filter(m=>m.internal).length,2);
 const other=createHarness({store,getContext:()=>({...trusted,targetId:'different-phone'}),clipboard:{getSnapshot:()=>snapshot},invoke:async request=>{assert.equal(runtime(request).at(-1).clipboard,undefined);return done;}});
 await other.run({sessionId:session.id,text:'Check another phone'});
});

test('pending, failed and cancelled copy requests block a later run from pasting old contents',async()=>{
 for(const status of ['awaiting_user_action','copying','failed','cancelled']){
  const {store,session}=await setup();let inputs=0;const paste={...plan(session.id),steps:[{id:'paste',op:'key',usage:25,modifiers:8,holdMs:80}]};
  const h=createHarness({store,getContext:()=>({...trusted,capabilities:{operations:['key']}}),clipboard:{getSnapshot:()=>({requestId:'pending',sessionId:session.id,targetId:'phone',status})},executePlan:async()=>{inputs++;return {status:'completed',frames:[]};},invoke:async()=>({text:'',toolCalls:[{id:'paste',name:'phone_execute_plan',arguments:{plan:paste}}]})});
  await h.run({sessionId:session.id,text:'Continue'});assert.equal(inputs,0,status);assert.equal(JSON.parse((await store.getMessages(session.id)).find(m=>m.role==='tool').text).code,'CLIPBOARD_COPY_REQUIRED');
 }
});

test('paste gate covers both modifier sides, Ctrl-V, Shift-Insert and compiled HID reports',async()=>{
 const {assertClipboardPasteReady,containsPasteInput}=await import('../../apps/web/core/clipboard-plan.js');
 const binding={sessionId:'session',targetId:'phone'},pending={...binding,status:'cancelled'};
 for(const [usage,modifiers] of [[25,8],[25,128],[25,1],[25,16],[73,2],[73,32]]){
  const p={steps:[{op:'key',usage,modifiers}]},segment={events:[{kind:'keyboard',usages:[usage],modifiers}]};
  assert.ok(containsPasteInput(p));assert.ok(containsPasteInput(segment));assert.throws(()=>assertClipboardPasteReady(pending,binding,p),e=>e.code==='CLIPBOARD_COPY_REQUIRED');assert.throws(()=>assertClipboardPasteReady(pending,binding,segment),e=>e.code==='CLIPBOARD_COPY_REQUIRED');
  assert.doesNotThrow(()=>assertClipboardPasteReady(null,binding,p));assert.doesNotThrow(()=>assertClipboardPasteReady({...pending,status:'copied'},binding,p));
  assert.throws(()=>assertClipboardPasteReady({...pending,status:'copied',targetId:'other'},binding,p),e=>e.code==='CLIPBOARD_COPY_REQUIRED');
 }
 assert.doesNotThrow(()=>assertClipboardPasteReady(pending,binding,{steps:[{op:'key',usage:25,modifiers:0}]}));
});

test('clipboard cancellation immediately before compiled submission fails without querying a nonexistent result',async()=>{
 const {assertClipboardPasteReady}=await import('../../apps/web/core/clipboard-plan.js');let inputs=0,polls=0;
 const binding={sessionId:'session',targetId:'phone'},pending={...binding,status:'cancelled'};
 const context={...trusted,...binding,mode:'task',capabilities:{operations:['key']},validateSegment:segment=>assertClipboardPasteReady(pending,binding,segment)};
 const p={...plan('session'),steps:[{id:'paste',op:'key',usage:25,modifiers:8,holdMs:80}]};
 const result=await executePhonePlan(p,{context,device:{submitSegment:async()=>{inputs++;},getResult:async()=>{polls++;},release:async()=>{}}});
 assert.equal(result.code,'CLIPBOARD_COPY_REQUIRED');assert.equal(result.status,'failed');assert.equal(inputs,0);assert.equal(polls,0);
});
