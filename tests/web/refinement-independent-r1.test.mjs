import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {openStore} from '../../apps/web/core/store.js';
import {createHarness} from '../../apps/web/core/harness.js';
import {messagePresentation,createConversationFollow} from '../../apps/web/ui/message-presentation.js';
import {createHistoryWindow} from '../../apps/web/core/history-window.js';

const source=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');
function section(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);}
function controlsContext(){
 const nodes=new Map(),$=key=>{if(!nodes.has(key))nodes.set(key,{value:'p::model',textContent:'',hidden:false,disabled:false});return nodes.get(key);};
 const actions=[{disabled:true}];
 const state={running:false,submitting:false,current:{id:'session'},runGeneration:0,drafts:new Map()};
 const context=vm.createContext({state,$,$$:selector=>selector==='[data-execute-plan]'?actions:[],capture:{active:false},t:key=>key,renderReasoningOptions(){},updateModeDescription(){}});
 vm.runInContext(section('function renderRunControls()', '\nfunction setRunning('),context);
 return {state,$,context,actions};
}
test('a paused send finishes with an enabled Continue button',async()=>{
 const {state,$,context}=controlsContext();context.capture.active=true;
 Object.assign(context,{
  conversationFollow:()=>({follow(){}}),getBrowserCompatibility:()=>({supportedForHarness:true}),deviceSessionAvailable:()=>true,selectedProvider:()=>({id:'p'}),
  AbortController,report:error=>{throw error;},resizeInput(){},refreshSessions:async()=>{},
  historyWindow:()=>({load:async()=>({messages:[],hasOlder:false,hasNewer:false,busy:false}),snapshot:()=>({messages:[],hasOlder:false,hasNewer:false,busy:false})}),applyHistory(){},
  renderMessages:()=>context.renderRunControls(),setRunning:value=>{state.running=value;context.renderRunControls();},
 });
 state.devicePanel={ensureReady:async()=>true};
 const saved={id:'session',title:'Test',promptState:{runResume:{state:'paused'}}};
 state.store={updateSession:async()=>{},getSession:async()=>saved};
 state.harness={run:async()=>{state.capturePaused=true;return {status:'paused'};}};
 $('#message-input').value='Set my alarm.';
 vm.runInContext(section('function selectionParts(', '\nfunction profileModels('),context);
 vm.runInContext(section('async function sendMessage(', '\nfunction renderClipboard('),context);
 await context.sendMessage({preventDefault(){}});
 assert.equal(state.submitting,false);
 assert.equal($('#resume-run').hidden,false);
 assert.equal($('#resume-run').disabled,false,'Continue must not stay disabled after the submit promise settles');
});

test('a pause from a different session does not create an unusable Continue button',()=>{
 const {state,$,context}=controlsContext();state.capturePaused='session';state.current={id:'other',promptState:{}};
 context.renderRunControls();assert.equal($('#resume-run').hidden,true);
});

test('fresh startup without a current session is not shown as paused',()=>{
 const {state,$,context}=controlsContext();state.current=null;
 context.renderRunControls();assert.equal($('#resume-run').hidden,true);assert.equal($('#run-status').hidden,true);
});

test('a proposed plan becomes executable once its response finishes, and is disabled during another run',()=>{
 const {state,context,actions}=controlsContext();
 state.running=true;context.renderRunControls();assert.equal(actions[0].disabled,true);
 state.running=false;state.submitting=true;context.renderRunControls();assert.equal(actions[0].disabled,true);
 state.submitting=false;context.renderRunControls();assert.equal(actions[0].disabled,false);
 state.running=true;context.renderRunControls();assert.equal(actions[0].disabled,true);
});

test('a retired session model falls back to a real available option, while valid selection remains selected',()=>{
 let options=[],value='';const modelSelect={set innerHTML(html){options=[...html.matchAll(/<option value="([^"]*)"/g)].map(match=>({value:match[1]}));value=options[0]?.value||'';},get options(){return options;},set value(next){value=options.some(option=>option.value===next)?next:'';},get value(){return value;},setAttribute(){}};
 const state={current:{modelId:'p::retired'},settings:{activeProviderId:'p',providers:[{id:'p',name:'Test API',model:'one',models:[{id:'one'},{id:'two'}]}]}};
 const context=vm.createContext({state,$:()=>modelSelect,providers:()=>state.settings.providers,modelContextMetadata:()=>({}),modelReasoningMetadata:()=>({}),renderReasoningOptions(){},t:key=>key,escapeHTML:value=>String(value||'')});
 vm.runInContext(section('function selectionParts(', '\nfunction dateLabel(')+'\n'+section('function renderModelOptions()', '\nfunction renderReasoningOptions('),context);
 context.renderModelOptions();assert.equal(modelSelect.value,'p::one');assert.match(modelSelect.title,/one/);assert.equal(options.some(option=>option.value===''),false);
 state.current.modelId='p::two';context.renderModelOptions();assert.equal(modelSelect.value,'p::two');assert.match(modelSelect.title,/two/);
});

test('plan proposal terminates a mixed tool batch before physical input',async()=>{
 const store=await openStore({memory:true}),session=await store.createSession({mode:'auto'});
 await store.saveSettings({providers:[{id:'p',protocol:'openai',baseUrl:'https://example.invalid/v1',model:'test'}],activeProviderId:'p'});
 let physical=0;
 const ctx={identityVerified:true,bindingVerified:true,leaseVerified:true,executionEnabled:true,inputState:'released',targetId:'phone',clientId:'client',leaseId:'lease',boardId:'board',bootId:'boot',orientationEpoch:1,capabilities:{operations:['home']},knownFrames:new Map([['before',{targetId:'phone',orientationEpoch:1}]])};
 const plan={version:1,planId:'p',sessionId:session.id,boardId:'board',targetId:'phone',basedOnFrameId:'before',orientationEpoch:1,ttlMs:15000,maxExecutionMs:15000,steps:[{id:'home',op:'home'}]};
 await createHarness({store,capture:{active:true,orientationEpoch:1},getContext:()=>ctx,executePlan:async()=>{physical++;return {status:'completed'};},invoke:async()=>({text:'Proposed plan',toolCalls:[{id:'proposal',name:'task_plan',arguments:{goal:'Go home',steps:['Press Home']}},{id:'must-not-run',name:'phone_execute_plan',arguments:{plan}}]})}).run({sessionId:session.id,text:'Explain the plan first.'});
 assert.equal(physical,0);assert.equal((await store.getMessages(session.id)).filter(m=>m.taskPlan).length,1);
});

test('normal conversation never prints physical execution JSON while developer view retains it',()=>{
 const record={role:'tool',toolName:'phone_execute_plan',text:JSON.stringify({status:'failed',code:'DEVICE_TIMING_MISS',steps:[{status:'skipped',detail:'Stopped after prior failure or cancellation.'}]})};
 const normal=messagePresentation(record);assert.equal(normal.text,'interaction.actionAdjust');assert.equal(normal.detail,'');
 const developer=messagePresentation(record,{developerMode:true});assert.match(developer.detail,/DEVICE_TIMING_MISS/);
});

test('stream growth follows the bottom until the user scrolls up, then resumes at the bottom',()=>{
 const events={},queue=[];const region={scrollHeight:1000,scrollTop:500,clientHeight:500,addEventListener:(name,fn)=>events[name]=fn,removeEventListener(){}};
 const follow=createConversationFollow({region,requestFrame:fn=>{queue.push(fn);return queue.length;}});
 follow.beforeRender();region.scrollHeight=1300;follow.afterRender();queue.shift()();assert.equal(region.scrollTop,1300);
 region.scrollTop=500;events.wheel({type:'wheel',deltaY:-200});follow.beforeRender();region.scrollHeight=1500;follow.afterRender();assert.equal(queue.length,0);
 region.scrollTop=1000;events.scroll();assert.equal(follow.following,false);events.wheel({type:'wheel',deltaY:200});events.scroll();assert.equal(follow.following,true);queue.shift()();assert.equal(region.scrollTop,1500);follow.destroy();
});

test('two growing renders before the next animation frame still follow the latest message',()=>{
 const queue=[];const region={scrollHeight:1000,scrollTop:500,clientHeight:500,addEventListener(){},removeEventListener(){}};
 const follow=createConversationFollow({region,requestFrame:fn=>{queue.push(fn);return queue.length;}});
 follow.beforeRender();region.scrollHeight=1300;follow.afterRender();
 follow.beforeRender();region.scrollHeight=1600;follow.afterRender();
 while(queue.length)queue.shift()();assert.equal(region.scrollTop,1600);assert.equal(follow.following,true);follow.destroy();
});

test('proposal steps and diagnostic visibility survive independent history reloads',async()=>{
 const store=await openStore({memory:true}),session=await store.createSession({mode:'auto'});
 await store.addMessage(session.id,{role:'user',text:'Runtime details',internal:true});
 const proposal={goal:'Alarm at seven',steps:['Open Clock','Enter 07:00','Verify the saved alarm'],status:'proposed'};
 await store.addMessage(session.id,{role:'assistant',text:proposal.goal,taskPlan:proposal});
 const normal=await createHistoryWindow(store).load(session.id);assert.equal(normal.messages.length,1);assert.deepEqual(messagePresentation(normal.messages[0]).plan,proposal);
 const debug=await createHistoryWindow(store,{includeInternal:true}).load(session.id);assert.equal(debug.messages.length,2);assert.equal(messagePresentation(debug.messages[0]),null);assert.equal(messagePresentation(debug.messages[0],{developerMode:true}).text,'Runtime details');
});

test('developer history arguments participate in its bounded resident window',async()=>{
 const store=await openStore({memory:true}),session=await store.createSession({mode:'auto'});
 for(let i=0;i<12;i++)await store.addMessage(session.id,{role:'assistant',text:'',toolCalls:[{id:String(i),name:'skills_create',arguments:{content:'x'.repeat(400)}}]});
 const page=await createHistoryWindow(store,{includeInternal:true,pageSize:12,maxMessages:12,maxTextBytes:2500}).load(session.id);
 const resident=page.messages.reduce((sum,m)=>sum+2*(m.text.length+JSON.stringify(m.toolCalls||[]).length),0);
 assert.ok(resident<=2500||page.messages.length===1,`Diagnostic arguments must be budgeted; resident bytes ${resident}`);
});
