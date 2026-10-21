import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from '../../apps/web/core/harness.js';
import {openStore} from '../../apps/web/core/store.js';
import {HARNESS_RETURN_ERRORS} from '../../apps/web/core/harness-return-errors.js';

const call=(id,name,args={})=>({text:'',toolCalls:[{id,name,arguments:args}]});
const question=()=>call('question','user_request_input',{question:'Which contact should I choose?'});
const lastFrame=request=>JSON.parse(request.messages.findLast(m=>m.toolName==='phone_observe').text).frames[0].frameId;
const report=(id,frame)=>call(id,'task_report',{status:'completed',summary:'Returned to Harness.',evidenceFrameIds:[frame]});
async function fixture({returnOnAttention,mode='auto',visible=false,...settings}={}){
 const store=await openStore({memory:true});await store.saveSettings({providers:[{id:'fixture',protocol:'openai',baseUrl:'https://fixture.invalid',model:'fixture'}],activeProviderId:'fixture',returnToHarness:false,...(returnOnAttention===undefined?{}:{returnOnAttention}),...settings});
 const session=await store.createSession({mode}),state={visible,current:session.id,turns:0,physical:0,grabs:0,connected:true};let listener;
 const capture={active:true,orientationEpoch:1,subscribe(fn){listener=fn;return()=>listener=null;},grab:async()=>{state.grabs++;return {frameId:crypto.randomUUID(),dataUrl:'data:image/jpeg;base64,YQ==',width:100,height:200,orientationEpoch:1,requestedAtMs:performance.now(),readyAtMs:performance.now()};},stop(){this.active=false;listener?.({type:'stopped'});}};
 const context=()=>({identityVerified:state.connected,bindingVerified:true,leaseVerified:true,executionEnabled:true,inputState:'released',bridgeConnection:state.connected?'connected':'disconnected',bluetoothConnection:'connected',targetId:'phone',clientId:'client',leaseId:'lease',boardId:'board',bootId:'boot',orientationEpoch:1,capabilities:{operations:['home']},knownFrames:new Map([['before',{targetId:'phone',orientationEpoch:1}]])});
 const plan={version:1,planId:'navigate',sessionId:session.id,boardId:'board',targetId:'phone',basedOnFrameId:'before',orientationEpoch:1,ttlMs:15000,maxExecutionMs:15000,steps:[{id:'home',op:'home',settleMs:0}]};
 const options={store,capture,getContext:context,getHarnessState:()=>({visible:state.visible,sessionId:state.current,origin:'https://igent.cc'}),executePlan:async()=>{state.physical++;return {status:'completed',frames:[],steps:[]};}};
 const events=()=>store.getEvents(session.id,{limit:2000});
 const run=invoke=>createHarness({...options,invoke:async request=>{state.turns++;return invoke(request,state.turns);}}).run({sessionId:session.id,text:'Send a message.'});
 return {store,session,state,capture,options,context,plan,events,run};
}

test('attention return defaults on independently of completion; fresh same-session proof preserves the question',async()=>{
 const f=await fixture();await f.run((request,n)=>{
  if(n===1)return question();
  if(n===2){assert.ok(request.messages.some(m=>m.text.includes('"phase":"return_for_attention"')));assert.ok(request.tools.some(t=>t.name==='phone_execute_plan'));assert.ok(!request.tools.some(t=>['mcp_call','phone_prepare_clipboard','skills_create','phone_get_location'].includes(t.name)));f.state.visible=true;return call('observe','phone_observe');}
  return report('returned',lastFrame(request));
 });
 assert.equal(f.state.turns,3);const events=await f.events(),ended=events.at(-1).payload;assert.equal(ended.status,'needs_user');assert.equal(ended.attentionReturnStatus,'returned');assert.equal(ended.goalStatus,undefined);assert.ok(events.some(e=>e.type==='task.attention_returned'));assert.ok(!events.some(e=>e.type==='task.goal_completed'));assert.equal((await f.store.getSession(f.session.id)).promptState.runResume,null);assert.equal((await f.store.getMessages(f.session.id)).at(-1).text,'Which contact should I choose?');f.store.close();
});

test('terminal question settles later calls without executing the original task',async()=>{
 const f=await fixture({visible:true});await f.run(()=>({text:'',toolCalls:[...question().toolCalls,{id:'late-action',name:'phone_execute_plan',arguments:{plan:f.plan}}]}));
 assert.equal(f.state.physical,0);assert.equal(f.state.turns,1);const result=(await f.store.getMessages(f.session.id)).find(m=>m.toolCallId==='late-action');assert.equal(JSON.parse(result.text).status,'not_executed');assert.equal(JSON.parse(result.text).code,'task_needs_user');f.store.close();
});

test('a blocked reason survives navigation model narration and never becomes task success',async()=>{
 const f=await fixture();await f.run((r,n)=>{if(n===1)return call('blocked','task_report',{status:'blocked',summary:'The app requires your confirmation.'});if(n===2){f.state.visible=true;return call('observe','phone_observe');}return {...report('returned',lastFrame(r)),text:'I brought Safari forward.'};});
 assert.equal((await f.store.getMessages(f.session.id)).at(-1).text,'The app requires your confirmation.');assert.equal((await f.events()).at(-1).payload.status,'needs_user');f.store.close();
});

test('an auto-mode plan proposal can return for a decision without claiming execution',async()=>{
 const f=await fixture();await f.run((r,n)=>{if(n===1)return call('proposal','task_plan',{goal:'Review these steps.',steps:['Open the app.']});if(n===2){f.state.visible=true;return call('observe','phone_observe');}return report('returned',lastFrame(r));});
 assert.equal(f.state.physical,0);const ended=(await f.events()).at(-1).payload;assert.equal(ended.status,'needs_user');assert.equal(ended.goalStatus,undefined);assert.equal((await f.store.getMessages(f.session.id)).at(-1).text,'Review these steps.');f.store.close();
});

for(const variant of ['visible','disabled','disconnected','input-held','capture-inactive','chat','plan'])test(`attention does not navigate when ${variant}`,async()=>{
 const f=await fixture({visible:variant==='visible',returnOnAttention:variant!=='disabled',mode:['chat','plan'].includes(variant)?variant:'auto'});
 if(variant==='disconnected')f.state.connected=false;
 if(variant==='capture-inactive')f.capture.active=false;
 if(variant==='input-held')f.options.getContext=()=>({...f.context(),inputState:'held'});
 await f.run(()=>question());assert.equal(f.state.turns,1);assert.equal(f.state.grabs,0);assert.equal(f.state.physical,0);assert.ok(!(await f.events()).some(e=>e.type==='task.attention_return_started'));f.store.close();
});

test('blocked return ends once, retains original question, and Continue resumes only attention return',async()=>{
 const f=await fixture();await f.run((r,n)=>n===1?question():call('return-blocked','task_report',{status:'blocked',summary:'Cannot find Safari.'}));
 let checkpoint=(await f.store.getSession(f.session.id)).promptState.runResume;assert.equal(checkpoint.reason,'return_for_attention');assert.equal(checkpoint.attentionReturn.terminal.question,'Which contact should I choose?');assert.equal(checkpoint.taskCompletion,undefined);assert.equal(f.state.turns,2);
 let turns=0;await createHarness({...f.options,executePlan:()=>{throw Error('Do not replay original work');},invoke:async request=>{if(++turns===1){assert.ok(request.messages.some(m=>m.text.includes('return_for_attention')));f.state.visible=true;return call('resume-observe','phone_observe');}return report('resume-returned',lastFrame(request));}}).resume({sessionId:f.session.id});
 assert.equal(turns,2);assert.equal((await f.events()).at(-1).payload.status,'needs_user');assert.equal((await f.store.getSession(f.session.id)).promptState.runResume,null);assert.equal((await f.store.getMessages(f.session.id)).at(-1).text,'Which contact should I choose?');f.store.close();
});

test('disabling attention return before Continue surfaces original question with no model call',async()=>{
 const f=await fixture();await f.run((r,n)=>n===1?question():call('blocked','task_report',{status:'blocked',summary:'Need help.'}));await f.store.saveSettings({returnOnAttention:false});
 await createHarness({...f.options,invoke:()=>{throw Error('No model call needed');}}).resume({sessionId:f.session.id});assert.equal((await f.store.getSession(f.session.id)).promptState.runResume,null);assert.equal((await f.events()).at(-1).payload.attentionReturnStatus,'not_required');f.store.close();
});

test('old and different-session images cannot acknowledge attention return',async()=>{
 const f=await fixture();let old;
 await f.run((request,n)=>{
  if(n===1)return call('before','phone_observe');if(n===2){old=lastFrame(request);return question();}
  if(n===3){f.state.visible=true;return report('stale',old);}
  if(n===4){assert.ok(request.messages.some(m=>m.text.includes('HARNESS_ATTENTION_UNCONFIRMED')));f.state.current='different';return call('wrong-session','phone_observe');}
  if(n===5)return report('wrong-proof',lastFrame(request));
  return call('cannot-return','task_report',{status:'blocked',summary:'Wrong tab.'});
 });assert.equal((await f.events()).at(-1).payload.attentionReturnStatus,'return_for_attention');assert.equal((await f.events()).filter(e=>e.type==='task.attention_return_started').length,1);f.store.close();
});

test('capture stopping during return preserves a separate return-only checkpoint',async()=>{
 const f=await fixture();const value=await f.run((r,n)=>{if(n===1)return question();f.capture.stop();return new Promise(()=>{});});assert.equal(value.status,'paused');const cp=(await f.store.getSession(f.session.id)).promptState.runResume;assert.equal(cp.reason,'capture_stopped');assert.equal(cp.attentionReturn.phase,'return_for_attention');assert.equal(cp.taskCompletion,undefined);f.store.close();
});

test('model failure never starts attention navigation',async()=>{
 const f=await fixture();await assert.rejects(f.run(()=>{throw Error('API offline');}),/API offline/);assert.equal(f.state.turns,1);assert.ok(!(await f.events()).some(e=>e.type==='task.attention_return_started'));f.store.close();
});

test('an explicit stop cannot initiate attention navigation',async()=>{
 const f=await fixture();let h;h=createHarness({...f.options,invoke:async()=>{h.stop();return question();}});await assert.rejects(h.run({sessionId:f.session.id,text:'Send a message.'}));assert.equal(f.state.grabs,0);assert.ok(!(await f.events()).some(e=>e.type==='task.attention_return_started'));f.store.close();
});

test('a blocked completion return never nests an attention return',async()=>{
 const f=await fixture({returnToHarness:true});await f.run((r,n)=>{if(n===1)return call('goal-observe','phone_observe');if(n===2)return report('goal-complete',lastFrame(r));return call('blocked-return','task_report',{status:'blocked',summary:'Safari is unavailable.'});});
 assert.equal(f.state.turns,3);const events=await f.events();assert.ok(!(events.some(e=>e.type==='task.attention_return_started')));assert.ok(events.some(e=>e.type==='task.return_pending'));assert.equal(events.at(-1).payload.status,'completed');assert.equal((await f.store.getSession(f.session.id)).promptState.runResume,null);f.store.close();
});

test('cancelled physical input does not initiate more navigation',async()=>{
 const f=await fixture();f.options.executePlan=async()=>({status:'cancelled',frames:[],steps:[]});await f.run(()=>call('cancelled','phone_execute_plan',{plan:f.plan}));assert.equal(f.state.turns,1);assert.ok(!(await f.events()).some(e=>e.type==='task.attention_return_started'));f.store.close();
});

test('explicit step/tool budgets never initiate attention return or grant extra calls',async()=>{
 for(const limit of [{maxSteps:1},{maxToolCalls:1}]){const f=await fixture();await createHarness({...f.options,...limit,invoke:async()=>{f.state.turns++;return question();}}).run({sessionId:f.session.id,text:'Send a message.'});assert.equal(f.state.turns,1);assert.ok(!(await f.events()).some(e=>e.type==='task.attention_return_started'));f.store.close();}
 const f=await fixture();await createHarness({...f.options,maxSteps:1,invoke:async()=>call('list','skills_list')}).run({sessionId:f.session.id,text:'Send a message.'});assert.equal((await f.events()).at(-1).payload.status,'budget_exhausted');assert.ok(!(await f.events()).some(e=>e.type==='task.attention_return_started'));f.store.close();
});

test('clipboard/manual-location attention uses the same return stage, without repeating the tool',async()=>{
 for(const kind of ['clipboard','location']){const f=await fixture();let count=0;
  if(kind==='clipboard')f.options.clipboard={prepare:async()=>{count++;return {status:'awaiting_user_action'};}};
  else f.options.locationAccess={isEnabled:async()=>true,read:async()=>{count++;throw Object.assign(Error('Location needs permission'),{code:'LOCATION_PERMISSION_REQUIRED'});}};
  await f.run((r,n)=>{if(n===1)return kind==='clipboard'?call('copy','phone_prepare_clipboard',{text:'Some text'}):call('location','phone_get_location');if(n===2){f.state.visible=true;return call('observe','phone_observe');}return report('returned',lastFrame(r));});
  assert.equal(count,1);assert.equal((await f.events()).at(-1).payload.status,'needs_user');assert.equal((await f.events()).at(-1).payload.attentionReturnStatus,'returned');f.store.close();
 }
});

test('attention messages cover all eight languages without claiming task completion',()=>{
 for(const code of ['HARNESS_ATTENTION_UNCONFIRMED','HARNESS_ATTENTION_REQUIRED','HARNESS_ATTENTION_RETURN_PENDING']){assert.equal(Object.keys(HARNESS_RETURN_ERRORS[code]).length,8);for(const text of Object.values(HARNESS_RETURN_ERRORS[code]))assert.ok(text.trim().length>0);}
});

for(const phase of ['attention','completion'])test(`${phase} return prose recovery never reopens completed work`,async()=>{
 const f=await fixture({returnToHarness:phase==='completion'});let recovering=false;
 await f.run((request,n)=>{
  if(phase==='attention'&&n===1)return question();
  if(phase==='completion'&&n===1)return call('goal-observe','phone_observe');
  if(phase==='completion'&&n===2)return report('goal-complete',lastFrame(request));
  if(!recovering){recovering=true;return {text:'I will return.',toolCalls:[]};}
  const retry=request.messages.findLast(m=>m.internal&&m.text.includes('A prose-only response'));
  assert.ok(retry);assert.ok(retry.text.includes('Do not continue, repeat, or modify the original task.'));assert.ok(retry.text.includes('Only return to the existing Harness conversation'));
  assert.ok(!retry.text.includes('The authorized phone task is still active'));assert.ok(!retry.text.includes('if the goal is verified'));
  return call('blocked-return','task_report',{status:'blocked',summary:'Need help returning.'});
 });
 const saved=await f.store.getSession(f.session.id);if(phase==='completion'){assert.equal(saved.promptState.runResume,null);assert.equal((await f.events()).at(-1).payload.status,'completed');}else{assert.ok(saved.promptState.runResume);}assert.equal(f.state.physical,0);f.store.close();
});
