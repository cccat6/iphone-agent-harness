import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from '../../apps/web/core/harness.js';
import {openStore} from '../../apps/web/core/store.js';
const call=(id,name,args)=>({text:'',toolCalls:[{id,name,arguments:args}]});
test('a valid nine-frame plan stores references and emits no duplicate image payloads',async()=>{
 const store=await openStore({memory:true});await store.saveSettings({providers:[{id:'fixture',protocol:'openai',baseUrl:'https://fixture.invalid',model:'fixture'}],activeProviderId:'fixture',returnToHarness:false});
 const session=await store.createSession({mode:'task'}),events=[];let turn=0,executions=0;
 const capture={active:true,orientationEpoch:1,grab:async()=>({frameId:crypto.randomUUID(),blob:new Blob(['fixture'],{type:'image/jpeg'}),width:100,height:200,orientationEpoch:1,requestedAtMs:performance.now(),readyAtMs:performance.now()})};
 const context=()=>({identityVerified:true,bindingVerified:true,leaseVerified:true,executionEnabled:true,inputState:'released',targetId:'phone',clientId:'client',leaseId:'lease',boardId:'board',bootId:'boot',orientationEpoch:1,capabilities:{operations:['capture']}});
 const h=createHarness({store,capture,getContext:context,onEvent:event=>events.push(event),executePlan:async(plan,{capture})=>{
  executions++;const frames=[];for(let i=0;i<9;i++){const raw=await capture.grab({targetId:'phone'}),saved=await capture.save(raw,{targetId:'phone',orientationEpoch:1});frames.push({frameId:saved.frameId,assetRef:saved.assetRef});}return {status:'completed',inputState:'released',steps:[],frames};
 },invoke:async request=>{
  turn++;if(turn===1)return call('observe','phone_observe',{});
  if(turn===2)return call('many-frames','phone_execute_plan',{plan:{version:1,planId:'nine-frames',sessionId:session.id,boardId:'board',targetId:'phone',basedOnFrameId:'latest',orientationEpoch:1,steps:Array.from({length:3},(_,i)=>({id:'capture-'+i,op:'capture',frames:{count:3,intervalMs:1,timeoutMs:1000},review:i===2,label:'sample-'+i}))}});
  const result=JSON.parse(request.messages.find(m=>m.toolCallId==='many-frames').text);assert.equal(result.status,'completed');assert.equal(result.frames.length,9);
  return call('done','task_report',{status:'completed',summary:'fixture frames observed',evidenceFrameIds:[result.frames.at(-1).frameId]});
 }});
 await h.run({sessionId:session.id,text:'exercise the allowed multi-frame plan'});
 assert.equal(executions,1);assert.equal(turn,3);assert.equal((await store.getEvents(session.id)).at(-1).payload.status,'completed');
 const emitted=events.filter(e=>e.type==='message'&&['observe','many-frames'].includes(e.message.toolCallId));assert.equal(emitted.length,2);
 for(const e of emitted){assert.equal(e.message.images,undefined,'UI events keep asset references, not duplicate Base64');assert.ok(e.message.frameRefs.length);}
 const rows=await store.getMessages(session.id,{includeImages:false}),result=rows.find(m=>m.toolCallId==='many-frames');assert.equal(result.frameRefs.length,9);
 for(const ref of result.frameRefs)assert.ok((await store.getFrame(ref)).blob);
 store.close();
});


test('opted-in phone runs provide fresh current-run evidence before the first model request',async()=>{
 const store=await openStore({memory:true});await store.saveSettings({providers:[{id:'fixture',protocol:'openai',baseUrl:'https://fixture.invalid',model:'fixture'}],activeProviderId:'fixture',returnToHarness:false});const session=await store.createSession({mode:'task'});let calls=0,grabs=0;
 const capture={active:true,orientationEpoch:1,grab:async()=>{grabs++;return {frameId:crypto.randomUUID(),blob:new Blob(['fixture'],{type:'image/jpeg'}),width:100,height:200,orientationEpoch:1,requestedAtMs:performance.now(),readyAtMs:performance.now()};}};
 const context=()=>({identityVerified:true,bindingVerified:true,leaseVerified:true,executionEnabled:true,inputState:'released',targetId:'phone',clientId:'client',leaseId:'lease',boardId:'board',bootId:'boot',orientationEpoch:1,capabilities:{operations:['capture']}});
 await createHarness({store,capture,initialObservation:true,getContext:context,invoke:async request=>{calls++;const current=request.messages.findLast(m=>m.frameRefs?.length);assert.match(current.text,/Current phone screen at the start of this run/);assert.equal(current.frameRefs.length,1);return {text:'Current screen inspected.',toolCalls:[]};}}).run({sessionId:session.id,text:'Inspect current phone'});
 assert.equal(calls,1);assert.equal(grabs,1);store.close();
});
