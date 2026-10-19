import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from '../../apps/web/core/harness.js';
import {openStore} from '../../apps/web/core/store.js';

test('an observation-only phone task also returns to its original Harness session by default',async t=>{
 const store=await openStore({memory:true});t.after(()=>store.close());
 await store.saveSettings({providers:[{id:'fixture',protocol:'openai',baseUrl:'https://fixture.invalid',model:'fixture'}],activeProviderId:'fixture'});
 const session=await store.createSession({mode:'task'});let visible=false,turn=0;
 const capture={active:true,orientationEpoch:1,grab:async()=>({frameId:crypto.randomUUID(),dataUrl:'data:image/jpeg;base64,YQ==',width:100,height:200,orientationEpoch:1,requestedAtMs:performance.now(),readyAtMs:performance.now()})};
 const frame=request=>JSON.parse(request.messages.findLast(message=>message.toolName==='phone_observe').text).frames[0].frameId;
 const call=(id,name,args={})=>({text:'',toolCalls:[{id,name,arguments:args}]});
 const complete=(id,idFrame)=>call(id,'task_report',{status:'completed',summary:'The alarm is already enabled.',evidenceFrameIds:[idFrame]});
 await createHarness({store,capture,getContext:()=>({targetId:'phone',orientationEpoch:1}),getHarnessState:()=>({visible,sessionId:session.id}),invoke:async request=>{
  if(++turn===1)return call('inspect-goal','phone_observe');
  if(turn===2)return complete('goal-confirmed',frame(request));
  if(turn===3){visible=true;return call('inspect-return','phone_observe');}
  return complete('return-confirmed',frame(request));
 }}).run({sessionId:session.id,text:'Check whether the alarm is enabled.'});
 assert.equal(turn,4,'completion must include return verification even when no physical input was needed');
 const events=await store.getEvents(session.id,{limit:100});assert.ok(events.some(event=>event.type==='task.goal_completed'));assert.ok(events.some(event=>event.type==='task.returned_to_harness'));assert.equal(events.at(-1).payload.returnStatus,'returned');
});

test('goal evidence cannot be reused as return evidence even after the correct session becomes visible',async t=>{
 const store=await openStore({memory:true});t.after(()=>store.close());await store.saveSettings({providers:[{id:'fixture',protocol:'openai',baseUrl:'https://fixture.invalid',model:'fixture'}],activeProviderId:'fixture'});
 const session=await store.createSession({mode:'task'});let turn=0,visible=false,goalFrame;
 const call=(id,name,args={})=>({text:'',toolCalls:[{id,name,arguments:args}]});const frame=request=>JSON.parse(request.messages.findLast(message=>message.toolName==='phone_observe').text).frames[0].frameId;
 const complete=(id,idFrame)=>call(id,'task_report',{status:'completed',summary:'State checked.',evidenceFrameIds:[idFrame]});
 const capture={active:true,grab:async()=>({frameId:crypto.randomUUID(),dataUrl:'data:image/jpeg;base64,YQ==',width:100,height:200,orientationEpoch:1})};
 await createHarness({store,capture,getContext:()=>({targetId:'phone',orientationEpoch:1}),getHarnessState:()=>({visible,sessionId:session.id}),invoke:async request=>{
  if(++turn===1)return call('goal-observe','phone_observe');
  if(turn===2){goalFrame=frame(request);return complete('goal-report',goalFrame);}
  if(turn===3){visible=true;return complete('stale-return-report',goalFrame);}
  if(turn===4){assert.ok(request.messages.some(message=>message.toolName==='task_report'&&message.text.includes('HARNESS_RETURN_UNCONFIRMED')));return call('actual-return-observe','phone_observe');}
  return complete('actual-return-report',frame(request));
 }}).run({sessionId:session.id,text:'Check the current state.'});assert.equal(turn,5);
 const events=await store.getEvents(session.id,{limit:100});assert.equal(events.filter(event=>event.type==='task.returned_to_harness').length,1);assert.equal(events.at(-1).payload.returnStatus,'returned');
});

test('user cancellation preserves return-only progress and later opt-out completes without replaying the goal',async t=>{
 const store=await openStore({memory:true});t.after(()=>store.close());await store.saveSettings({providers:[{id:'fixture',protocol:'openai',baseUrl:'https://fixture.invalid',model:'fixture'}],activeProviderId:'fixture'});
 const session=await store.createSession({mode:'task'});let turn=0;
 const capture={active:true,grab:async()=>({frameId:crypto.randomUUID(),dataUrl:'data:image/jpeg;base64,YQ==',width:100,height:200,orientationEpoch:1})};
 const options={store,capture,getContext:()=>({targetId:'phone',orientationEpoch:1}),getHarnessState:()=>({visible:false,sessionId:session.id})};
 let harness;harness=createHarness({...options,invoke:async request=>{
  if(++turn===1)return {text:'',toolCalls:[{id:'inspect-goal',name:'phone_observe',arguments:{}}]};
  if(turn===2){const frame=JSON.parse(request.messages.findLast(message=>message.toolName==='phone_observe').text).frames[0].frameId;return {text:'',toolCalls:[{id:'goal-success',name:'task_report',arguments:{status:'completed',summary:'Goal already satisfied.',evidenceFrameIds:[frame]}}]};}
  harness.stop();return new Promise(()=>{});
 }});
 await assert.rejects(harness.run({sessionId:session.id,text:'Check the current state.'}),error=>error.status==='cancelled');
 const checkpoint=(await store.getSession(session.id)).promptState.runResume;assert.equal(checkpoint.taskCompletion.phase,'return_to_harness');assert.equal(checkpoint.taskCompletion.goalSummary,'Goal already satisfied.');
 await store.saveSettings({returnToHarness:false});let calls=0;
 await createHarness({...options,invoke:async()=>{calls++;throw Error('No original task or return action is required after opt-out');}}).resume({sessionId:session.id});
 assert.equal(calls,0);assert.equal((await store.getSession(session.id)).promptState.runResume,null);const events=await store.getEvents(session.id,{limit:100});assert.equal(events.at(-1).payload.status,'completed');assert.equal(events.at(-1).payload.returnStatus,'not_required');
});
