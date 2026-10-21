import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from '../../apps/web/core/harness.js';
import {openStore} from '../../apps/web/core/store.js';
const call=(id,name,arguments_={})=>({text:'',toolCalls:[{id,name,arguments:arguments_}]});
const lastFrame=request=>JSON.parse(request.messages.findLast(message=>message.toolName==='phone_observe').text).frames[0].frameId;
const report=(id,frame)=>call(id,'task_report',{status:'completed',summary:'Alarm saved and verified.',evidenceFrameIds:[frame]});
async function fixture({returnToHarness=true}={}){
 const store=await openStore({memory:true});await store.saveSettings({providers:[{id:'fixture',protocol:'openai',baseUrl:'https://fixture.invalid',model:'fixture'}],activeProviderId:'fixture',returnToHarness});
 const session=await store.createSession({mode:'auto'}),state={visible:false,current:session.id,physical:0,turns:0};let listener;
 const capture={active:true,orientationEpoch:1,subscribe(fn){listener=fn;return()=>listener=null;},grab:async()=>({frameId:crypto.randomUUID(),dataUrl:'data:image/jpeg;base64,YQ==',width:100,height:200,orientationEpoch:1,requestedAtMs:performance.now(),readyAtMs:performance.now()}),stop(){this.active=false;listener?.({type:'stopped'});}};
 const context=()=>({identityVerified:true,bindingVerified:true,leaseVerified:true,executionEnabled:true,inputState:'released',targetId:'phone',clientId:'client',leaseId:'lease',boardId:'board',bootId:'boot',orientationEpoch:1,capabilities:{operations:['home']},knownFrames:new Map([['before',{targetId:'phone',orientationEpoch:1}]])});
 const plan={version:1,planId:'initial-goal',sessionId:session.id,boardId:'board',targetId:'phone',basedOnFrameId:'before',orientationEpoch:1,ttlMs:15000,maxExecutionMs:15000,steps:[{id:'home',op:'home',settleMs:0}]};
 const options={store,capture,getContext:context,getHarnessState:()=>({visible:state.visible,sessionId:state.current,origin:'https://igent.cc',url:'https://igent.cc/'}),executePlan:async()=>{state.physical++;return {status:'completed',frames:[],steps:[]};}};
 const prefix=request=>{state.turns++;if(state.turns===1)return call('goal-action','phone_execute_plan',{plan});if(state.turns===2)return call('goal-observe','phone_observe');if(state.turns===3)return report('goal-completed',lastFrame(request));};
 const events=()=>store.getEvents(session.id,{limit:2000});
 return {store,session,state,capture,options,prefix,events};
}

test('goal completion starts a separate return phase and only a new visible same-session frame can finish it',async()=>{
 const f=await fixture();await createHarness({...f.options,invoke:async request=>{
  const initial=f.prefix(request);if(initial)return initial;
  if(f.state.turns===4){assert.ok(request.messages.some(message=>message.text.includes('"phase":"return_to_harness"')));f.state.visible=true;return call('return-observe','phone_observe');}
  return report('return-confirmed',lastFrame(request));
 }}).run({sessionId:f.session.id,text:'Set the alarm.'});
 assert.equal(f.state.turns,5);assert.equal(f.state.physical,1);
 const events=await f.events();assert.ok(events.some(event=>event.type==='task.goal_completed'));assert.ok(events.some(event=>event.type==='task.returned_to_harness'));assert.equal(events.at(-1).payload.status,'completed');assert.equal(events.at(-1).payload.returnStatus,'returned');assert.equal((await f.store.getSession(f.session.id)).promptState.runResume,null);f.store.close();
});

test('an old goal frame and a visible different session cannot establish a successful return without reopening the completed task',async()=>{
 const f=await fixture();await createHarness({...f.options,invoke:async request=>{
  const initial=f.prefix(request);if(initial)return initial;
  if(f.state.turns===4){f.state.visible=true;f.state.current='other-session';return call('wrong-session-observe','phone_observe');}
  if(f.state.turns===5)return report('wrong-session-report',lastFrame(request));
  assert.ok(request.messages.some(message=>message.toolName==='task_report'&&message.text.includes('HARNESS_RETURN_UNCONFIRMED')));return call('return-blocked','task_report',{status:'blocked',summary:'Need the original Harness tab.'});
 }}).run({sessionId:f.session.id,text:'Set the alarm.'});
 const saved=await f.store.getSession(f.session.id);
 assert.equal(saved.promptState.runResume,null);assert.equal((await f.events()).at(-1).payload.status,'completed');assert.ok((await f.events()).some(event=>event.type==='task.return_pending'));assert.ok((await f.store.getMessages(f.session.id)).at(-1).text.includes('Harness'));f.store.close();
});

test('disabling return leaves the target app in place and completes immediately after goal evidence',async()=>{
 const f=await fixture({returnToHarness:false});await createHarness({...f.options,invoke:async request=>f.prefix(request)}).run({sessionId:f.session.id,text:'Set the alarm.'});
 assert.equal(f.state.turns,3);assert.equal(f.state.visible,false);assert.equal((await f.events()).at(-1).payload.status,'completed');assert.equal((await f.events()).some(event=>event.type==='task.goal_completed'),false);f.store.close();
});

test('a failed return preserves goal success without reopening the completed task',async()=>{
 const f=await fixture();await createHarness({...f.options,invoke:async request=>f.prefix(request)||call('blocked','task_report',{status:'blocked',summary:'Safari is not visible.'})}).run({sessionId:f.session.id,text:'Set the alarm.'});
 assert.equal(f.state.physical,1);assert.equal((await f.events()).at(-1).payload.status,'completed');assert.equal((await f.store.getSession(f.session.id)).promptState.runResume,null);f.store.close();
});

test('becoming visible only after capture does not mislabel an earlier target-app image as Harness proof',async()=>{
 const f=await fixture(),original=f.capture.grab;let switchAfterGrab=false;
 f.capture.grab=async()=>{const value=await original();if(switchAfterGrab){f.state.visible=true;switchAfterGrab=false;}return value;};
 await createHarness({...f.options,invoke:async request=>{
  const initial=f.prefix(request);if(initial)return initial;
  if(f.state.turns===4){switchAfterGrab=true;return call('transition-observe','phone_observe');}
  if(f.state.turns===5)return report('stale-report',lastFrame(request));
  if(f.state.turns===6){assert.ok(request.messages.some(message=>message.text.includes('HARNESS_RETURN_UNCONFIRMED')));return call('fresh-return-observe','phone_observe');}
  return report('fresh-return-report',lastFrame(request));
 }}).run({sessionId:f.session.id,text:'Set the alarm.'});
 assert.equal(f.state.turns,7);assert.equal((await f.events()).at(-1).payload.returnStatus,'returned');f.store.close();
});

test('capture stop during return pauses with the completed goal and return-only checkpoint intact',async()=>{
 const f=await fixture();const result=await createHarness({...f.options,invoke:async request=>{
  const initial=f.prefix(request);if(initial)return initial;f.capture.stop();return new Promise(()=>{});
 }}).run({sessionId:f.session.id,text:'Set the alarm.'});
 assert.equal(result.status,'paused');const checkpoint=(await f.store.getSession(f.session.id)).promptState.runResume;assert.equal(checkpoint.state,'paused');assert.equal(checkpoint.taskCompletion.phase,'return_to_harness');assert.equal(checkpoint.taskCompletion.goalSummary,'Alarm saved and verified.');assert.equal(f.state.physical,1);f.store.close();
});
