import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {openStore} from '../../apps/web/core/store.js';
import {loadComposerDraft,saveComposerDraft,clearComposerDraft} from '../../apps/web/ui/composer-draft.js';
const source=fs.readFileSync(new URL('../../apps/web/app.js',import.meta.url),'utf8');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const segment=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
async function fixture(t){
 const previous=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage'),saved=new Map();Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)}});t.after(()=>previous?Object.defineProperty(globalThis,'sessionStorage',previous):delete globalThis.sessionStorage);
 const fields=new Map(),calls={bridge:0,devices:0,settings:0,created:0,run:[],reports:[],navigation:[]};
 const field=key=>{if(!fields.has(key)){const classes=new Set();fields.set(key,{value:'',textContent:'',hidden:false,style:{},classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v)},replaceChildren(){},focus(){},setAttribute(){}});}return fields.get(key);};field('#model-select').value='test::flash';
 const store=await openStore({memory:true}),create=store.createSessionWithMessage;store.createSessionWithMessage=(...args)=>{calls.created++;return create(...args);};
 const state={store,settings:{activeProviderId:'test',providers:[{id:'test',name:'Test',model:'flash'}]},current:null,composerDraft:null,composerDraftActive:false,drafts:new Map(),messages:[],sessions:[],running:false,submitting:false,sessionOpenGeneration:0,runGeneration:0,devicePanel:{ensureReady:async()=>{calls.bridge++;return true;}},harness:{run:async value=>calls.run.push(value)},navigation:{go:(view,options)=>calls.navigation.push({view,options})}};
 const capture={active:true,start(){this.active=true;return Promise.resolve();}},provider={id:'test',name:'Test',model:'flash'};
 const context={state,capture,$:field,$$:()=>[],t:key=>key,loadComposerDraft,saveComposerDraft,clearComposerDraft,clipboard:{clear(){}},historyWindow:()=>({clear(){},load:async id=>({messages:await store.getMessages(id,{includeImages:false}),hasOlder:false,hasNewer:false}),snapshot:()=>({messages:state.messages,hasOlder:false,hasNewer:false})}),applyHistory:page=>{if(page)state.messages=page.messages;},providers:()=>state.settings.providers,selectedProvider:()=>provider,selectionParts:value=>({providerId:value.split('::')[0],modelId:value.split('::')[1]}),normalizeReasoningEffort:(p,v)=>v,renderModelOptions(){if(state.composerDraftActive)field('#model-select').value=state.composerDraft.modelId;},renderReasoningOptions(){},updateModeDescription(){},resizeInput(){},renderSessions(){},renderClipboard(){},renderMessages(){},renderRunControls(){},setRunning:value=>state.running=value,refreshSessions:async()=>{state.sessions=await store.listSessions();},showDevices:async()=>calls.devices++,showSettings:async()=>calls.settings++,toast(){},report:error=>calls.reports.push(error),conversationFollow:()=>({follow(){}}),getBrowserCompatibility:()=>({supportedForHarness:true}),renderPlatform(){},deviceSessionAvailable:()=>true,showLatestConversation:async()=>{},AbortController,URL,URLSearchParams,location:new URL('https://igent.cc/'),routeHref:route=>route==='harness'?'/':'/'+route,closeNavigationDialog(){},refreshBridgeAfterNavigation(){}};
 context.canonicalRoutes={harness:'',main:'main',skills:'skills',flash:'flash'};
 vm.createContext(context);vm.runInContext(segment('async function changeReasoningSelection','function historyWindow()')+segment('async function openSession(','async function pageHistory(')+segment('async function resumeRun(','async function sendMessage(')+segment('async function sendMessage(','function renderClipboard(')+segment('function navigationURL(','function refreshBridgeAfterNavigation(')+segment('function rememberRouteDraft(','function onNavigationClick('),context);
 return {state,store,field,calls,context,capture,saved};
}
test('new conversation opens one unsaved draft, preserves its text and has no conversation menu',async t=>{
 const f=await fixture(t),ready=deferred();f.state.devicePanel.ensureReady=()=>{f.calls.bridge++;return ready.promise;};const first=f.context.newSession(),second=f.context.newSession();ready.resolve(true);await Promise.all([first,second]);assert.equal(f.calls.bridge,1);assert.equal(f.calls.created,0);assert.equal((await f.store.listSessions()).length,0);assert.equal(f.state.current,null);assert.equal(f.field('#session-menu').hidden,true);
 f.field('#message-input').value='keep this unsent text';f.context.rememberComposerDraft();await f.context.newSession();assert.equal(f.field('#message-input').value,'keep this unsent text');assert.equal(loadComposerDraft().text,'keep this unsent text');assert.equal(f.calls.created,0);
});
test('draft navigation and tab-local storage restore text, selected model and effort without a bridge request',async t=>{
 const f=await fixture(t);f.context.openComposerDraft();f.field('#message-input').value='draft after settings';f.field('#model-select').value='test::other';await f.context.changeModelSelection();f.field('#reasoning-select').value='high';await f.context.changeReasoningSelection();assert.equal(f.state.composerDraft.reasoningEfforts['test::other'],'high');assert.equal((await f.store.listSessions()).length,0);
 await f.context.applyNavigationView({route:'harness',screen:'list'});await f.context.applyNavigationView({route:'harness',screen:'draft'});assert.equal(f.field('#message-input').value,'draft after settings');assert.equal(f.field('#model-select').value,'test::other');assert.equal(new URL(f.context.navigationURL({route:'harness',screen:'draft'})).search,'?draft=1');
 f.state.composerDraft=null;f.state.composerDraftActive=false;f.field('#message-input').value='';f.context.openComposerDraft({navigation:false});assert.equal(f.field('#message-input').value,'draft after settings');assert.equal(f.state.composerDraft.reasoningEfforts['test::other'],'high');assert.equal(f.calls.bridge,0);
});
test('first send atomically saves its user message once before running with its exact message id',async t=>{
 const f=await fixture(t);await f.context.newSession();f.field('#message-input').value='first real request';f.context.rememberComposerDraft();await Promise.all([f.context.sendMessage({preventDefault(){}}),f.context.sendMessage({preventDefault(){}})]);
 assert.equal(f.calls.created,1);assert.equal(f.calls.run.length,1);const sessions=await f.store.listSessions();assert.equal(sessions.length,1);const messages=await f.store.getMessages(sessions[0].id);assert.equal(messages.length,1);assert.equal(messages[0].text,'first real request');assert.equal(f.calls.run[0].firstMessageId,messages[0].id);assert.equal(f.state.composerDraft,null);assert.equal(loadComposerDraft(),null);assert.equal(f.state.current.id,sessions[0].id);assert.equal(f.field('#session-menu').hidden,false);assert.ok(f.calls.navigation.some(value=>value.options?.replace&&value.view.screen==='session'));
});
test('first-send prerequisite or atomic save failure keeps the composer draft and creates no empty session',async t=>{
 const f=await fixture(t);f.context.openComposerDraft();f.field('#message-input').value='preserve on failure';f.context.rememberComposerDraft();f.state.devicePanel.ensureReady=async()=>false;await f.context.sendMessage({preventDefault(){}});assert.equal(f.calls.created,0);assert.equal(f.field('#message-input').value,'preserve on failure');
 f.state.devicePanel.ensureReady=async()=>true;f.store.createSessionWithMessage=async()=>{throw Error('atomic write failed');};await f.context.sendMessage({preventDefault(){}});assert.equal((await f.store.listSessions()).length,0);assert.equal(loadComposerDraft().text,'preserve on failure');assert.equal(f.state.current,null);
});
test('a rendering failure after commit preserves the actual session and saved message instead of rebuilding a draft',async t=>{
 const f=await fixture(t);f.context.openComposerDraft();f.field('#message-input').value='already durable';f.context.openSession=async()=>{throw Error('view failed');};await f.context.sendMessage({preventDefault(){}});assert.equal(f.calls.created,1);assert.equal(f.calls.run.length,0);assert.ok(f.state.current.id);assert.equal(f.state.composerDraft,null);assert.equal((await f.store.getMessages(f.state.current.id))[0].text,'already durable');assert.equal(f.field('#message-input').value,'');
});
test('navigation during bridge preflight cannot let a late new-conversation request replace another view',async t=>{
 const f=await fixture(t),ready=deferred();f.state.devicePanel.ensureReady=()=>ready.promise;const opening=f.context.newSession();f.context.navigate('main');ready.resolve(true);assert.equal(await opening,null);assert.equal(f.state.composerDraft,null);assert.equal(f.calls.created,0);assert.equal(f.calls.navigation.at(-1).view.route,'main');
});
test('typing while the first atomic write waits preserves the newer composer text',async t=>{
 const f=await fixture(t),gate=deferred(),create=f.store.createSessionWithMessage;f.store.createSessionWithMessage=async(...args)=>{await gate.promise;return create(...args);};f.context.openComposerDraft();f.field('#message-input').value='submitted first request';const sending=f.context.sendMessage({preventDefault(){}});for(let i=0;i<12;i++)await Promise.resolve();f.field('#message-input').value='next message being drafted';gate.resolve();await sending;
 assert.equal((await f.store.getMessages(f.state.current.id))[0].text,'submitted first request');assert.equal(f.field('#message-input').value,'next message being drafted');assert.equal(f.state.drafts.get(f.state.current.id),'next message being drafted');assert.equal(f.calls.run.length,1);
});
for(const delayedMethod of ['getSession','getMessages'])test('typing while committed first-send '+delayedMethod+' is loading survives the actual openSession await',async t=>{
 const f=await fixture(t),entered=deferred(),gate=deferred(),read=f.store[delayedMethod];let first=true;f.store[delayedMethod]=async(...args)=>{if(first){first=false;entered.resolve();await gate.promise;}return read(...args);};
 f.context.openComposerDraft();f.field('#message-input').value='durable first request';const sending=f.context.sendMessage({preventDefault(){}});await entered.promise;assert.ok(f.state.current.id);assert.equal(f.state.composerDraft,null);f.field('#message-input').value='new text entered during history loading';gate.resolve();await sending;
 assert.equal(f.field('#message-input').value,'new text entered during history loading');assert.equal(f.state.drafts.get(f.state.current.id),'new text entered during history loading');assert.equal((await f.store.getMessages(f.state.current.id))[0].text,'durable first request');assert.equal(f.calls.run.length,1);
});
for(const delayedMethod of ['getSession','getMessages','refreshSessions','updateSession','skillSync'])test('real navigation during first-send '+delayedMethod+' prevents late model startup after the message is saved',async t=>{
 const f=await fixture(t),entered=deferred(),gate=deferred();
 if(delayedMethod==='skillSync'){f.state.skillSync=gate.promise;const original=f.context.setRunning;f.context.setRunning=value=>{original(value);if(value)entered.resolve();};}
 else{const owner=delayedMethod==='refreshSessions'?f.context:f.store,read=owner[delayedMethod];let first=true;owner[delayedMethod]=async(...args)=>{if(first){first=false;entered.resolve();await gate.promise;}return read(...args);};}
 f.context.openComposerDraft();f.field('#message-input').value='committed before leaving';const sending=f.context.sendMessage({preventDefault(){}});await entered.promise;assert.ok(f.state.current.id);f.context.navigate('main');gate.resolve();await sending;
 assert.equal(f.calls.created,1);assert.equal(f.calls.run.length,0);assert.equal((await f.store.getMessages(f.state.current.id))[0].text,'committed before leaving');assert.equal(f.calls.navigation.at(-1).view.route,'main');assert.equal(f.state.running,false);assert.equal(f.capture.active,true);
});
test('first-send sharing completion after leaving never continues to bridge preflight or storage',async t=>{
 const f=await fixture(t),gate=deferred();f.context.openComposerDraft();f.capture.active=false;f.capture.start=async()=>{await gate.promise;f.capture.active=true;};f.field('#message-input').value='unsent after leaving';const sending=f.context.sendMessage({preventDefault(){}});f.context.navigate('skills');gate.resolve();await sending;assert.equal(f.calls.bridge,0);assert.equal(f.calls.created,0);assert.equal(f.calls.run.length,0);assert.equal(loadComposerDraft().text,'unsent after leaving');assert.equal(f.calls.navigation.at(-1).view.route,'skills');
});
test('a late history read error after leaving cannot navigate its saved first message back into view',async t=>{
 const f=await fixture(t),entered=deferred(),gate=deferred();f.store.getSession=async()=>{entered.resolve();await gate.promise;throw Error('late history read failed');};f.context.openComposerDraft();f.field('#message-input').value='saved without reclaiming the view';const sending=f.context.sendMessage({preventDefault(){}});await entered.promise;f.context.navigate('main');gate.resolve();await sending;assert.equal(f.calls.run.length,0);assert.equal(f.calls.navigation.at(-1).view.route,'main');assert.equal((await f.store.getMessages(f.state.current.id))[0].text,'saved without reclaiming the view');
});
test('leaving during the first write keeps the committed message without navigating back or starting a model request',async t=>{
 const f=await fixture(t),gate=deferred(),create=f.store.createSessionWithMessage;f.store.createSessionWithMessage=async(...args)=>{await gate.promise;return create(...args);};f.context.openComposerDraft();f.field('#message-input').value='save exactly once';const sending=f.context.sendMessage({preventDefault(){}});for(let i=0;i<12;i++)await Promise.resolve();f.context.navigate('skills');gate.resolve();await sending;
 assert.equal(f.calls.created,1);assert.equal(f.calls.run.length,0);assert.equal((await f.store.getMessages(f.state.current.id))[0].text,'save exactly once');assert.equal(f.calls.navigation.filter(value=>value.view.screen==='session').length,0);assert.equal(f.state.composerDraft,null);
});
test('real page navigation during first-send preparation prevents saving or invoking a late model call',async t=>{
 const f=await fixture(t),gate=deferred();f.context.openComposerDraft();f.field('#message-input').value='not submitted after leaving';f.state.devicePanel.ensureReady=()=>gate.promise;const sending=f.context.sendMessage({preventDefault(){}});for(let i=0;i<6;i++)await Promise.resolve();f.context.navigate('main');gate.resolve(true);await sending;
 assert.equal(f.calls.created,0);assert.equal(f.calls.run.length,0);assert.equal(f.calls.navigation.at(-1).view.route,'main');assert.equal(loadComposerDraft().text,'not submitted after leaving');assert.equal(f.capture.active,true);
});
test('real page navigation does not cancel an already saved conversation run or its capture',async t=>{
 const f=await fixture(t);f.state.current=await f.store.createSession({title:'Existing'});f.state.running=true;const controller=new AbortController();f.state.abort=controller;f.context.navigate('main');assert.equal(f.state.running,true);assert.equal(f.state.abort.signal.aborted,false);assert.equal(f.capture.active,true);assert.ok(f.state.current.id);
});
test('returning after navigation starts a fresh draft-opening request instead of reusing an obsolete one',async t=>{
 const f=await fixture(t),gate=deferred();f.state.devicePanel.ensureReady=()=>gate.promise;const old=f.context.newSession();f.context.navigate('main');f.context.navigate('harness');const current=f.context.newSession();gate.resolve(true);assert.equal(await old,null);assert.ok(await current);assert.equal(f.state.current,null);assert.equal(f.calls.navigation.at(-1).view.screen,'draft');
});
test('tab-local draft serialization stays bounded and does not copy unrelated fields',async t=>{
 await fixture(t);saveComposerDraft({text:'unsent',modelId:'test::flash',reasoningEfforts:{'test::flash':'high'},credential:'must-not-be-saved',token:'must-not-be-saved'});assert.deepEqual(loadComposerDraft(),{text:'unsent',modelId:'test::flash',reasoningEfforts:{'test::flash':'high'}});clearComposerDraft();saveComposerDraft({text:'x'.repeat(100001)});assert.equal(loadComposerDraft(),null);
});

for(const saved of [false,true])for(const failure of ['offline','live-check','capture-denied','capture-stopped'])test(`${saved?'saved conversation':'draft'} does not submit when ${failure}`,async t=>{
 const f=await fixture(t);if(saved)f.state.current=await f.store.createSession({title:'Existing'});else f.context.openComposerDraft();
 f.field('#message-input').value='keep my unsent request';let captureRequests=0;
 if(failure==='offline'){f.context.deviceSessionAvailable=()=>false;f.capture.active=false;f.capture.start=()=>{captureRequests++;throw Error('must not request capture');};}
 if(failure==='live-check')f.state.devicePanel.ensureReady=async()=>false;
 if(failure==='capture-denied'){f.capture.active=false;f.capture.start=()=>{captureRequests++;return Promise.reject(new Error('Permission denied'));};}
 if(failure==='capture-stopped')f.state.devicePanel.ensureReady=async()=>{f.capture.active=false;return true;};
 await f.context.sendMessage({preventDefault(){}});
 assert.equal(f.calls.run.length,0);assert.equal(f.calls.created,0);assert.equal(f.field('#message-input').value,'keep my unsent request');assert.equal(f.state.submitting,false);
 if(saved)assert.equal((await f.store.getMessages(f.state.current.id)).length,0);
 if(failure==='offline')assert.equal(captureRequests,0);
});
test('existing session requests capture inside the send gesture and waits for approval',async t=>{
 const f=await fixture(t),gate=deferred();f.state.current=await f.store.createSession({title:'Existing'});f.field('#message-input').value='new request';f.capture.active=false;let started=false;
 f.capture.start=()=>{started=true;return gate.promise.then(()=>{f.capture.active=true;});};
 const sending=f.context.sendMessage({preventDefault(){}});assert.equal(started,true);assert.equal(f.calls.bridge,0);assert.equal(f.calls.run.length,0);gate.resolve();await sending;assert.equal(f.calls.run.length,1);
});
for(const resource of ['bridge','capture'])test(`losing ${resource} during startup prevents the model request and preserves existing-session input`,async t=>{
 const f=await fixture(t),entered=deferred(),gate=deferred();f.state.current=await f.store.createSession({title:'Existing'});f.field('#message-input').value='not submitted';f.state.skillSync=gate.promise;
 const running=f.context.setRunning;f.context.setRunning=value=>{running(value);if(value)entered.resolve();};
 const sending=f.context.sendMessage({preventDefault(){}});await entered.promise;if(resource==='bridge')f.context.deviceSessionAvailable=()=>false;else f.capture.active=false;gate.resolve();await sending;
 assert.equal(f.calls.run.length,0);assert.equal(f.field('#message-input').value,'not submitted');assert.equal((await f.store.getMessages(f.state.current.id)).length,0);assert.equal(f.state.submitting,false);
});

test('resume rejects a bridge disconnect between the readiness response and its continuation',async t=>{
 const f=await fixture(t);f.state.current=await f.store.createSession({title:'Paused'});let ready=true,resumed=0;f.context.deviceSessionAvailable=()=>ready;f.state.harness.resume=async()=>resumed++;
 f.state.devicePanel.ensureReady=async()=>{queueMicrotask(()=>{ready=false;});return true;};await f.context.resumeRun();assert.equal(resumed,0);assert.equal(f.calls.devices,1);assert.equal(f.state.submitting,false);
});
for(const action of ['send','resume'])test(`a stalled native capture restarts sharing synchronously on ${action}`,async t=>{
 const f=await fixture(t),gate=deferred();f.state.current=await f.store.createSession({title:'Existing'});f.field('#message-input').value='continue';f.capture.active=true;f.capture.needsRestart=true;let started=0,resumed=0;
 f.capture.start=()=>{started++;return gate.promise.then(()=>{f.capture.needsRestart=false;});};f.state.harness.resume=async()=>resumed++;
 const pending=action==='send'?f.context.sendMessage({preventDefault(){}}):f.context.resumeRun();assert.equal(started,1);assert.equal(f.calls.run.length,0);assert.equal(resumed,0);gate.resolve();await pending;assert.equal(action==='send'?f.calls.run.length:resumed,1);
});
