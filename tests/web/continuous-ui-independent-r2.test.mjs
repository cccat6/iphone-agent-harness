import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {openStore} from '../../apps/web/core/store.js';
import {createHistoryWindow} from '../../apps/web/core/history-window.js';
import {createConversationFollow} from '../../apps/web/ui/message-presentation.js';
const source=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');
function extract(start,end,context){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);vm.runInContext(source.slice(a,b),context);}

test('independent root: live frame messages do not replace a manually held history window and resume finalization preserves it',async()=>{
 const store=await openStore({memory:true}),session=await store.createSession({mode:'auto'});for(let i=0;i<160;i++)await store.addMessage(session.id,{role:'assistant',text:'history '+i});
 const history=createHistoryWindow(store),page=await history.load(session.id);await history.page('older');const held=history.snapshot().messages.map(m=>m.id),state={store,current:session,settings:{},messages:history.snapshot().messages,hasNewer:false,running:false,submitting:false,runGeneration:1,conversationFollow:{following:false,follow(){throw new Error('must retain manual reading');}},devicePanel:{ensureReady:async()=>true},harness:{resume:async()=>{}},capturePaused:session.id};
 let rendered=0,latest=0;const nodes=new Map(),node=s=>{if(!nodes.has(s))nodes.set(s,{value:'profile::model',textContent:''});return nodes.get(s);};
 const context=vm.createContext({state,deviceSessionAvailable:()=>true,capture:{active:true},AbortController,$:node,t:key=>key,historyWindow:()=>history,applyHistory:value=>{state.messages=value.messages;state.hasNewer=value.hasNewer;},conversationFollow:()=>state.conversationFollow,renderMessages:()=>{rendered++;},renderLatestControl:()=>{latest++;},renderRunControls(){},renderReasoningOptions(){},setRunning:value=>{state.running=value;},localizeError:e=>e});
 extract('function onHarnessEvent(event)', '\nasync function resumeRun()',context);extract('async function resumeRun()', '\nasync function sendMessage(',context);
 const fresh=await store.addMessage(session.id,{role:'tool',toolName:'phone_observe',text:'{"status":"captured"}',frameRefs:['local-asset:new']});context.onHarnessEvent({type:'message',message:fresh});
 assert.equal(rendered,0);assert.equal(latest,1);assert.equal(state.hasNewer,true);assert.deepEqual(state.messages.map(m=>m.id),held);await context.resumeRun();assert.equal(rendered,1);assert.deepEqual(state.messages.map(m=>m.id),held);assert.equal(state.hasNewer,true);assert.equal(state.running,false);store.close();
});

test('independent root: list rename preserves its list destination and never opens a different active session',async()=>{
 const selected={id:'active',title:'Active'},other={id:'archived',title:'Archived',archived:true},writes=[],navigation=[],nodes=new Map(),node=s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:'',value:'Renamed',focus(){},select(){},showModal(){},close(){}});return nodes.get(s);};
 const state={current:selected,navigation:{current:{screen:'list'},go:view=>navigation.push(['go',view]),back:async view=>navigation.push(['back',view])},store:{updateSession:async(id,patch)=>writes.push([id,patch])}};
 let refreshed=0,opened=0;const context=vm.createContext({state,$:node,t:key=>key,escapeHTML:x=>x,guard:f=>f,closeNavigationDialog(){},refreshSessions:async()=>{refreshed++;},openSession:async()=>{opened++;}});
 extract('function showRenameDialog(', '\nasync function showSettings(',context);context.showRenameDialog(other,{fromList:true});await node('#rename-form').onsubmit({preventDefault(){}});
 assert.equal(writes[0][0],'archived');assert.equal(writes[0][1].title,'Renamed');assert.equal(writes[0][1].titleState,'manual');assert.equal(refreshed,1);assert.equal(opened,0);assert.equal(state.current,selected);assert.equal(navigation[0][1].action.fromList,true);assert.equal(navigation[1][0],'back');
});

test('independent root: explicitly loading older messages pauses follow even when short history fits the viewport',async()=>{
 const listeners=new Map(),region={scrollTop:0,scrollHeight:100,clientHeight:100,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener(){},querySelectorAll:()=>[]};const follow=createConversationFollow({region,requestFrame:()=>1,cancelFrame(){}}),state={current:{id:'session'}};
 const context=vm.createContext({state,$:()=>region,historyWindow:()=>({page:async()=>({messages:[],hasOlder:false,hasNewer:false})}),conversationFollow:()=>follow,applyHistory(){},renderMessages(){follow.beforeRender();}});
 extract('async function pageHistory(', '\nfunction welcome()',context);await context.pageHistory('older');assert.equal(follow.following,false);follow.destroy();
});

test('independent root: association-ready bridge reaches execution context without mandatory optional input proof',async()=>{
 const device={getExecutionContext:async options=>{assert.equal(options.writerId,'run-a');return {identityVerified:true,bindingVerified:true,leaseVerified:true,executionEnabled:true,targetId:'phone-a'};}};
 const state={devicePanel:{getState:()=>({connected:true,bluetoothConnected:true,targetBound:true,inputVerified:false,ready:true,boardId:'board-a',targetId:'phone-a'}),getDevice:()=>device}},runDevices=new Map();
 const context=vm.createContext({state,runDevices,capture:{orientationEpoch:2},chatExecutionContext:()=>({mode:'chat'})});
 extract('function activeInputBridge()', '\nasync function creatorIdentity()',context);
 assert.equal(context.requireInputBridge(),device);const value=await context.deviceContext({runId:'run-a',mode:'auto',allowClaim:true});
 assert.equal(value.inputVerified,false);assert.equal(value.targetBound,true);assert.equal(value.bindingVerified,true);assert.equal(value.executionEnabled,true);assert.equal(runDevices.get('run-a'),device);
});

test('independent root: a reader who pauses during final session metadata storage keeps the current history snapshot',async()=>{
 let release,entered,loads=0;const reading=new Promise(resolve=>entered=resolve),old=[{id:'held-old',text:'old'}],latest=[{id:'newest',text:'new'}];let current=latest;
 const follow={following:true,follow(){this.following=true;},pause(){this.following=false;}},state={current:{id:'s',title:'Session'},settings:{},running:false,submitting:false,runGeneration:1,messages:latest,drafts:new Map(),store:{updateSession:async()=>{},getSession:()=>{entered();return new Promise(resolve=>release=resolve);}},devicePanel:{ensureReady:async()=>true},harness:{run:async()=>{}},conversationFollow:follow};
 const nodes=new Map(),node=s=>{if(!nodes.has(s))nodes.set(s,{value:s==='#message-input'?'Do the task':'profile::model',textContent:''});return nodes.get(s);},history={snapshot:()=>({messages:current,hasOlder:true,hasNewer:false}),load:async()=>{loads++;return {messages:latest};}};
 const context=vm.createContext({state,$:node,capture:{active:true},getBrowserCompatibility:()=>({supportedForHarness:true}),deviceSessionAvailable:()=>true,selectedProvider:()=>({id:'profile',name:'Profile'}),selectionParts:()=>({modelId:'model'}),conversationFollow:()=>follow,historyWindow:()=>history,applyHistory:page=>{state.messages=page.messages;},setRunning:value=>state.running=value,resizeInput(){},renderMessages(){},renderRunControls(){},renderReasoningOptions(){},refreshSessions:async()=>{},AbortController,report:error=>{throw error;},t:key=>key});
 extract('async function sendMessage(', '\nfunction renderClipboard()',context);
 const pending=context.sendMessage({preventDefault(){}});await reading;follow.pause();current=old;state.messages=old;release({id:'s',title:'Session'});await pending;assert.deepEqual(state.messages,old);assert.equal(loads,0);
});

test('independent root: resume finalization also respects history navigation during delayed metadata storage',async()=>{
 let release,entered,loads=0;const reading=new Promise(resolve=>entered=resolve),old=[{id:'read-earlier',text:'earlier'}],latest=[{id:'resumed',text:'new'}];let current=latest;
 const state={current:{id:'s'},runGeneration:1,conversationFollow:{following:true},store:{getSession:()=>{entered();return new Promise(resolve=>release=resolve);}},devicePanel:{ensureReady:async()=>true},harness:{resume:async()=>{}}},history={snapshot:()=>({messages:current,hasOlder:true,hasNewer:false}),load:async()=>{loads++;return {messages:latest};}};
 const context=vm.createContext({state,deviceSessionAvailable:()=>true,capture:{active:true},AbortController,$:()=>({value:'profile::model'}),historyWindow:()=>history,applyHistory:page=>state.messages=page.messages,renderMessages(){},renderRunControls(){},renderReasoningOptions(){},setRunning:value=>state.running=value});extract('async function resumeRun()', '\nasync function sendMessage(',context);
 const pending=context.resumeRun();await reading;state.conversationFollow.following=false;current=old;release({id:'s'});await pending;assert.deepEqual(state.messages,old);assert.equal(loads,0);assert.equal(state.running,false);
});
