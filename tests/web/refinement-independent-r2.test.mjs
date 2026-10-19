import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');
const section=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);};
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)};};
test('clipboard continuation waits for the currently resumed run rather than an earlier completed submission',async()=>{
 const entered=deferred(),finish=deferred(),pending={requestId:'clip',targetId:'phone'},calls=[];
 const nodes=new Map(),$=key=>{if(!nodes.has(key))nodes.set(key,{value:'p::model'});return nodes.get(key);};
 const session={id:'s',promptState:{runResume:{state:'paused'}}};
 const state={current:session,running:false,submitting:false,runGeneration:0,runCompletion:Promise.resolve(),devicePanel:{ensureReady:async()=>true},store:{getSession:async()=>session,addEvent:async()=>{}},harness:{resume:async()=>{entered.resolve();await finish.promise;}}};
 const context=vm.createContext({state,$,capture:{active:true},AbortController,historyWindow:()=>({load:async()=>({messages:[]})}),applyHistory(){},renderMessages(){},renderRunControls(){},renderReasoningOptions(){},setRunning:value=>state.running=value,t:key=>key,report:error=>{throw error;},clipboard:{getSnapshot:()=>pending},deviceClipboard:{},deviceStatus:()=>({targetId:'phone'}),sendMessage:async()=>calls.push({running:state.running,submitting:state.submitting}),mountClipboardPanel:(node,options)=>options});
 vm.runInContext(section('async function resumeRun()', '\nasync function sendMessage(')+'\n'+section('function renderClipboard()', '\nfunction resizeInput('),context);
 context.renderClipboard();const resumed=context.resumeRun();await entered.promise;
 const copied=state.clipboardView.onCopied({sessionId:'s',requestId:'clip',targetId:'phone'});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls.length,0,'copy receipt must wait until resume finalization clears running/submitting');
 finish.resolve();await resumed;await copied;assert.deepEqual(calls,[{running:false,submitting:false}]);
});

import {openStore} from '../../apps/web/core/store.js';
import {importSessionFile,exportSessionFile} from '../../apps/web/core/session-files.js';
import {createConversationFollow} from '../../apps/web/ui/message-presentation.js';
test('both file and direct session imports retain executable proposal presentation and tool names, reject invalid metadata before creating a session',async()=>{
 const store=await openStore({memory:true}),original=await store.createSession({mode:'auto'});
 const taskPlan={id:'reviewed-plan',goal:'Set alarm',steps:['Open Clock','Enter the time','Verify'],status:'proposed'};
 await store.addMessage(original.id,{role:'assistant',text:'Plan',taskPlan});await store.addMessage(original.id,{role:'tool',text:'{"status":"captured"}',toolName:'phone_observe'});
 const file=await exportSessionFile(store,original.id),parsed=JSON.parse(await file.text());
 for(const session of [await importSessionFile(store,file,{chunkBytes:7}),await store.importSession(parsed)]){
  const messages=await store.getMessages(session.id,{includeImages:false});assert.deepEqual(messages[0].taskPlan,taskPlan);assert.equal(messages[1].toolName,'phone_observe');
 }
 const before=(await store.listSessions()).length;
 for(const patch of [{taskPlan:{...taskPlan,steps:Array(21).fill('Step')}},{taskPlan:{...taskPlan,status:'executing'}},{toolName:'bad/name'}]){
  const bad={...parsed,messages:[{role:'assistant',text:'Bad proposal',...patch}]};await assert.rejects(store.importSession(bad));await assert.rejects(importSessionFile(store,new Blob([JSON.stringify(bad)]),{chunkBytes:7}));
 }
 assert.equal((await store.listSessions()).length,before);store.close();
});

test('viewport bottom-follow callback follows a layout change only while the user remains following',()=>{
 const events=new Map(),queue=[],region={scrollHeight:1500,scrollTop:1000,clientHeight:500,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener(){}};
 const follow=createConversationFollow({region,requestFrame:fn=>(queue.push(fn),queue.length),cancelFrame(){}});
 const viewportChanged=()=>follow.afterRender();
 region.clientHeight=250;viewportChanged();queue.shift()();assert.equal(region.scrollTop,1500);
 region.scrollTop=300;events.get('wheel')({type:'wheel',deltaY:-100});region.clientHeight=700;viewportChanged();assert.equal(queue.length,0);assert.equal(region.scrollTop,300);follow.destroy();
});

test('resume finalization storage failure still clears busy state and releases a waiting clipboard receipt',async()=>{
 const entered=deferred(),finish=deferred(),pending={requestId:'clip',targetId:'phone'},calls=[];
 const session={id:'s',promptState:{runResume:{state:'paused'}}},nodes=new Map(),$=key=>{if(!nodes.has(key))nodes.set(key,{value:'p::model'});return nodes.get(key);};
 const storageError=new Error('fixture finalization read failed');
 const state={current:session,running:false,submitting:false,runGeneration:0,runCompletion:Promise.resolve(),devicePanel:{ensureReady:async()=>true},store:{getSession:async()=>{throw storageError;},addEvent:async()=>{}},harness:{resume:async()=>{entered.resolve();await finish.promise;}}};
 const context=vm.createContext({state,$,capture:{active:true},AbortController,historyWindow:()=>({load:async()=>({messages:[]})}),applyHistory(){},renderMessages(){},renderRunControls(){},renderReasoningOptions(){},setRunning:value=>state.running=value,t:key=>key,report:error=>{throw error;},clipboard:{getSnapshot:()=>pending},deviceClipboard:{},deviceStatus:()=>({targetId:'phone'}),sendMessage:async()=>calls.push({running:state.running,submitting:state.submitting}),mountClipboardPanel:(node,options)=>options});
 vm.runInContext(section('async function resumeRun()', '\nasync function sendMessage(')+'\n'+section('function renderClipboard()', '\nfunction resizeInput('),context);
 context.renderClipboard();const resumed=context.resumeRun().then(()=>null,error=>error);await entered.promise;
 const copied=state.clipboardView.onCopied({sessionId:'s',requestId:'clip',targetId:'phone'});
 finish.resolve();const result=await resumed;assert.ok(result===null||result===storageError,'finalization may either retain an error in UI or reject for the UI guard');
 assert.equal(state.running,false,'failure to reload saved state cannot leave a nonexistent run active');assert.equal(state.submitting,false);assert.equal(state.abort,null);
 let timeout;const released=await Promise.race([copied.then(()=>true),new Promise(resolve=>{timeout=setTimeout(()=>resolve(false),100);})]);clearTimeout(timeout);
 assert.equal(released,true,'clipboard continuation cannot remain blocked on a finished run');assert.deepEqual(calls,[{running:false,submitting:false}]);
});
