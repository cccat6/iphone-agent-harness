import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from '../../apps/web/core/harness.js';
import {openStore} from '../../apps/web/core/store.js';
import {executePhonePlan} from '../../apps/web/core/plan.js';

const call=(id,name,args={})=>({id,name,arguments:args});
const frame=()=>({frameId:crypto.randomUUID(),dataUrl:'data:image/jpeg;base64,YQ==',width:100,height:200,orientationEpoch:1,mediaTimeMs:null,requestedAtMs:performance.now(),readyAtMs:performance.now()});
const context=()=>({mode:'auto',identityVerified:true,bindingVerified:true,leaseVerified:true,executionEnabled:true,inputState:'released',targetId:'phone',clientId:'client',leaseId:'lease',boardId:'board',bootId:'boot',orientationEpoch:1,capabilities:{operations:['home','tap','capture']},knownFrames:new Map([['before',{targetId:'phone',orientationEpoch:1}]])});
const plan=(session,id='p')=>({version:1,planId:id,sessionId:session.id,boardId:'board',targetId:'phone',basedOnFrameId:'before',orientationEpoch:1,ttlMs:15000,maxExecutionMs:15000,steps:[{id:'home',op:'home',settleMs:0}]});
async function setup(){const store=await openStore({memory:true});await store.saveSettings({providers:[{id:'fixture',protocol:'openai',baseUrl:'https://fixture.invalid/v1',model:'fixture'}],activeProviderId:'fixture'});return {store,session:await store.createSession({mode:'auto'})};}

// These adapters never contact a device or model service.
test('independent: a phone task continues across 26 successful action plans and ends only after observed completion',async()=>{
 const {store,session}=await setup();let actions=0,turns=0;
 await createHarness({store,capture:{active:true,grab:async()=>frame()},getContext:context,executePlan:async()=>{actions++;return {status:'completed',frames:[],steps:[]};},invoke:async request=>{
  turns++;
  if(actions<26)return {text:'',toolCalls:[call('action-'+turns,'phone_execute_plan',{plan:plan(session,'plan-'+turns)})]};
  const observed=request.messages.findLast(message=>message.toolName==='phone_observe');
  if(!observed)return {text:'',toolCalls:[call('final-observation','phone_observe')]};
  return {text:'',toolCalls:[call('verified-report','task_report',{status:'completed',summary:'The target outcome is visible.',evidenceFrameIds:[JSON.parse(observed.text).frames[0].frameId]})]};
 }}).run({sessionId:session.id,text:'Complete the phone task.'});
 assert.equal(actions,26);assert.equal(turns,28);assert.equal((await store.getEvents(session.id,{limit:2000})).at(-1).payload.status,'completed');
 assert.equal((await store.getMessages(session.id)).some(message=>message.text.includes('达到本轮步骤预算')),false);store.close();
});

test('independent: uncertain action evidence survives run completion and cannot be blindly replayed by a later request',async()=>{
 const {store,session}=await setup();let physical=0;
 const executePlan=async()=>{physical++;return {status:'unknown',code:'unknown',steps:[]};};
 for(let run=0;run<2;run++){
  let turn=0;
  await createHarness({store,capture:{active:true,grab:async()=>frame()},getContext:context,executePlan,invoke:async()=>++turn===1?{text:'',toolCalls:[call('action','phone_execute_plan',{plan:plan(session,'request-'+run)})]}:{text:'Pause for reconciliation.',toolCalls:[]}}).run({sessionId:session.id,text:'Go Home.'});
 }
 assert.equal(physical,1);assert.ok((await store.getMessages(session.id)).some(message=>message.toolName==='phone_execute_plan'&&message.text.includes('UNCERTAIN_ACTION_REPLAY')));store.close();
});

test('independent: user Stop during unlimited model wait cancels the run and releases its writer',async()=>{
 const {store,session}=await setup();let entered,ended=0;const started=new Promise(resolve=>entered=resolve);
 const harness=createHarness({store,capture:{active:true},device:{endRun:async()=>{ended++;}},invoke:async()=>{entered();return new Promise(()=>{});}});
 const running=harness.run({sessionId:session.id,text:'Work until done.'});await started;harness.stop();
 await assert.rejects(running,error=>error.status==='cancelled');assert.equal(ended,1);assert.equal(harness.running,false);assert.equal((await store.getSession(session.id)).activeRun,undefined);store.close();
});

test('independent: explicit zero settle preserves intentional two-tap sequencing while normal taps settle before capture',async()=>{
 const session={id:'s'},timeline=[];const input={...plan(session),steps:[{id:'first',op:'tap',point:{x:5000,y:5000},holdMs:60,settleMs:0},{id:'second',op:'tap',point:{x:5000,y:5000},holdMs:60,settleMs:120},{id:'screen',op:'capture',frames:{count:1,intervalMs:0,timeoutMs:1000},review:true,label:'after animation'}]};
 const result=await executePhonePlan(input,{context:context(),onEvent:event=>{if(event.phase==='settling')timeline.push({type:'settling',step:event.stepId});},device:{submitSegment:async segment=>{timeline.push({type:'submitted',at:performance.now()});return {...segment,status:'hid_submitted',releaseSubmitted:true};},getResult:async()=>{},release:async()=>{}},capture:{grab:async()=>{timeline.push({type:'capture',at:performance.now()});return {...frame(),targetId:'phone',assetRef:'local-asset:test'};}}});
 assert.equal(result.status,'completed',JSON.stringify(result));assert.deepEqual(timeline.filter(event=>event.type==='settling').map(event=>event.step),['second']);
 const submitted=timeline.filter(event=>event.type==='submitted');assert.ok(timeline.find(event=>event.type==='capture').at-submitted[1].at>=100);
});
