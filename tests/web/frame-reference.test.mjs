import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from '../../apps/web/core/harness.js';
import {openStore} from '../../apps/web/core/store.js';
const call=(id,name,args)=>({text:'',toolCalls:[{id,name,arguments:args}]});
test('short frame references resolve only at execution and preserve original tool history',async()=>{
 const store=await openStore({memory:true});await store.saveSettings({providers:[{id:'fixture',protocol:'openai',baseUrl:'https://fixture.invalid',model:'fixture'}],activeProviderId:'fixture',returnToHarness:false});
 const session=await store.createSession({mode:'task'});let turn=0,firstRef,secondRef,submitted;
 const capture={active:true,orientationEpoch:1,grab:async()=>({frameId:crypto.randomUUID(),dataUrl:'data:image/jpeg;base64,YQ==',width:100,height:200,orientationEpoch:1,requestedAtMs:performance.now(),readyAtMs:performance.now()})};
 const context=()=>({identityVerified:true,bindingVerified:true,leaseVerified:true,executionEnabled:true,inputState:'released',targetId:'phone',clientId:'client',leaseId:'lease',boardId:'board',bootId:'boot',orientationEpoch:1,capabilities:{operations:['home']}});
 const harness=createHarness({store,capture,getContext:context,executePlan:async(plan,{capture})=>{submitted=plan.basedOnFrameId;const raw=await capture.grab({targetId:'phone'}),saved=await capture.save(raw,{targetId:'phone',orientationEpoch:1});return {status:'completed',steps:[],frames:[{frameId:saved.frameId,assetRef:saved.assetRef}]};},invoke:async request=>{
  if(turn++===0)return call('observe','phone_observe',{});
  const value=JSON.parse(request.messages.findLast(m=>m.role==='tool').text),frame=value.frames[0];assert.match(frame.reference,/^f[0-9a-f]{8}-\d+$/);
  if(turn===2){firstRef=frame.reference;return call('act','phone_execute_plan',{plan:{version:1,planId:'p',sessionId:session.id,boardId:'board',targetId:'phone',basedOnFrameId:firstRef,orientationEpoch:1,ttlMs:15000,maxExecutionMs:15000,steps:[{id:'h',op:'home'}]}});}
  secondRef=frame.reference;return call('done','task_report',{status:'completed',summary:'verified',evidenceFrameIds:[secondRef]});
 }});
 await harness.run({sessionId:session.id,text:'test references'});const messages=await store.getMessages(session.id,{includeImages:false}),observed=JSON.parse(messages.find(m=>m.toolCallId==='observe').text);
 assert.equal(submitted,observed.frames[0].frameId);assert.notEqual(firstRef,secondRef);assert.equal(messages.find(m=>m.toolCalls?.[0]?.id==='act').toolCalls[0].arguments.plan.basedOnFrameId,firstRef);assert.deepEqual(messages.find(m=>m.toolCalls?.[0]?.id==='done').toolCalls[0].arguments.evidenceFrameIds,[secondRef]);assert.equal((await store.getEvents(session.id)).at(-1).payload.status,'completed');
});

test('latest evidence is invalidated by input, and host deadlines replace optional model timing hints',async()=>{
 const store=await openStore({memory:true});await store.saveSettings({providers:[{id:'p',protocol:'openai',baseUrl:'https://fixture.invalid',model:'fixture'}],activeProviderId:'p',returnToHarness:false});const session=await store.createSession({mode:'task'});let turn=0,executions=0;
 const capture={active:true,orientationEpoch:1,grab:async()=>({frameId:crypto.randomUUID(),dataUrl:'data:image/jpeg;base64,YQ==',width:100,height:200,orientationEpoch:1,requestedAtMs:performance.now(),readyAtMs:performance.now()})};
 const context=()=>({identityVerified:true,bindingVerified:true,leaseVerified:true,executionEnabled:true,inputState:'released',targetId:'phone',clientId:'client',leaseId:'lease',boardId:'board',bootId:'boot',orientationEpoch:1,capabilities:{operations:['home']}});
 const h=createHarness({store,capture,getContext:context,executePlan:async plan=>{executions++;assert.equal(plan.ttlMs,30000);assert.equal(plan.maxExecutionMs,15000);assert.notEqual(plan.basedOnFrameId,'latest');return {status:'completed',frames:[],steps:[]};},invoke:async request=>{
  turn++;if(turn===1||turn===4)return call('obs'+turn,'phone_observe',{});
  if(turn===2)return call('act','phone_execute_plan',{plan:{version:1,planId:'latest-action',sessionId:session.id,boardId:'board',targetId:'phone',basedOnFrameId:'latest',orientationEpoch:1,steps:[{id:'home',op:'home'}]}});
  if(turn===3)return call('stale-report','task_report',{status:'completed',summary:'must fail',evidenceFrameIds:['latest']});
  if(turn===5){const stale=JSON.parse(request.messages.find(m=>m.toolCallId==='stale-report').text);assert.equal(stale.status,'error');return call('remember','phone_remember_interaction',{component:'fixture',finding:'measured',evidenceFrameIds:['latest']});}
  return call('done','task_report',{status:'completed',summary:'fresh verified',evidenceFrameIds:['latest']});
 }});
 await h.run({sessionId:session.id,text:'validate latest'});assert.equal(executions,1);assert.equal(turn,6);const messages=await store.getMessages(session.id,{includeImages:false});assert.equal(messages.find(m=>m.toolCalls?.[0]?.id==='act').toolCalls[0].arguments.plan.ttlMs,undefined);const note=(await store.getSession(session.id)).promptState.interactionNotes[0];assert.notEqual(note.evidenceFrameIds[0],'latest');assert.ok(await store.hasRunFrame(session.id,(await store.getEvents(session.id)).at(-1).runId,note.evidenceFrameIds[0]));
});
