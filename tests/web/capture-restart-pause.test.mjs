import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from '../../apps/web/core/harness.js';
import {openStore} from '../../apps/web/core/store.js';
const frame=()=>({frameId:'frame',targetId:'phone',orientationEpoch:1,requestedAtMs:0,readyAtMs:1,mediaTimeMs:null,width:100,height:200,dataUrl:'data:image/jpeg;base64,aGk='});
const ctx=()=>({boardId:'board',bootId:'boot',clientId:'client',targetId:'phone',leaseId:'lease',orientationEpoch:1,identityVerified:true,bindingVerified:true,leaseVerified:true,executionEnabled:true,inputState:'released',capabilities:{operations:['home','capture']}});
async function setup(){const store=await openStore({memory:true}),session=await store.createSession({mode:'auto'});await store.saveSettings({providers:[{id:'p',protocol:'openai',baseUrl:'https://example.invalid/v1',model:'fake'}],activeProviderId:'p'});return {store,session};}
const call=(id,name,args={})=>({id,name,arguments:args});
test('a stuck explicit observation pauses durably and settles later input calls without execution',async()=>{
 const {store,session}=await setup(),events=[];let models=0,executions=0;
 const capture={active:true,needsRestart:false,orientationEpoch:1,async grab(){this.needsRestart=true;throw Object.assign(Error('timed out'),{code:'CAPTURE_TIMEOUT',captureStage:'native_frame'});}};
 const harness=createHarness({store,capture,getContext:ctx,getHarnessState:async()=>({visible:false,sessionId:session.id}),executePlan:async()=>{executions++;},onEvent:e=>events.push(e),invoke:async()=>{models++;return {text:'',toolCalls:[call('read','phone_observe'),call('later','phone_execute_plan',{plan:{}})]};}});
 const result=await harness.run({sessionId:session.id,text:'Observe the current screen.'});assert.equal(result.status,'paused');assert.equal(result.reason,'capture_restart_required');assert.equal(models,1);assert.equal(executions,0);assert.equal(capture.active,true);
 const saved=await store.getSession(session.id);assert.equal(saved.promptState.runResume.state,'paused');assert.equal(saved.promptState.runResume.reason,'capture_restart_required');const messages=await store.getMessages(session.id);assert.equal(JSON.parse(messages.find(m=>m.toolCallId==='later').text).status,'not_executed');assert.equal(events.filter(e=>e.type==='status'&&e.status==='returning_to_harness').length,0);
});
test('a submitted input with a failed review capture preserves its restart checkpoint without replay or return navigation',async()=>{
 const {store,session}=await setup();let models=0,executions=0;
 const capture={active:true,needsRestart:false,orientationEpoch:1,grab:async()=>frame()};
 const plan={version:1,planId:'p',sessionId:session.id,boardId:'board',targetId:'phone',basedOnFrameId:'frame',orientationEpoch:1,ttlMs:15000,maxExecutionMs:15000,steps:[{id:'home',op:'home'}]};
 const harness=createHarness({store,capture,getContext:ctx,getHarnessState:async()=>({visible:false,sessionId:session.id}),executePlan:async()=>{executions++;capture.needsRestart=true;return {status:'failed',inputState:'released',code:'CAPTURE_TIMEOUT',captureNeedsRestart:true,steps:[{id:'home',status:'hid_submitted'}],frames:[],recovery:{action:'resume_sharing',automatic:false}};},invoke:async()=>{models++;if(models===1)return {text:'',toolCalls:[call('frame','phone_observe')]};if(models===2)return {text:'',toolCalls:[call('input','phone_execute_plan',{plan})]};throw Error('must pause before another model call');}});
 const result=await harness.run({sessionId:session.id,text:'Check the result after one input.'});assert.equal(result.status,'paused');assert.equal(executions,1);assert.equal(models,2);const saved=await store.getSession(session.id);assert.equal(saved.promptState.runResume.reason,'capture_restart_required');const tool=(await store.getMessages(session.id)).find(m=>m.toolCallId==='input');assert.equal(JSON.parse(tool.text).recovery.action,'resume_sharing');assert.equal(JSON.parse(tool.text).recovery.automatic,false);
});
