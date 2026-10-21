import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createLocationAccess} from '../../apps/web/core/location.js';
import {mountLocationRequest} from '../../apps/web/ui/location-request.js';
const fix={coords:{latitude:12,longitude:34,accuracy:10},timestamp:1700000000000};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({permission='prompt',enabled=true,hidden=false,query=true}={}){
 let settings={locationEnabled:enabled},reads=0,currentPermission=permission;const fixes=[],writes=[],events=new Map();
 const document={visibilityState:hidden?'hidden':'visible',hasFocus:()=>!hidden,addEventListener:(key,fn)=>events.set(key,fn),removeEventListener:key=>events.delete(key)};
 const navigator={geolocation:{getCurrentPosition(success,error){reads++;fixes.push({success,error});}},...(query?{permissions:{query:async()=>({state:currentPermission})}}:{})};
 const options={navigator,document,getSettings:async()=>settings,saveSettings:async patch=>{writes.push(patch);return settings={...settings,...patch};},permissionTimeoutMs:10,deadlineMs:100};
 const access=createLocationAccess(options);
 return {access,options,fixes,writes,events,document,get settings(){return settings;},get reads(){return reads;},set permission(value){currentPermission=value;}};
}
test('refresh rechecks browser permission and clears saved opt-in without reading location',async()=>{
 for(const permission of ['prompt','denied','granted']){const f=fixture({permission});const result=await f.access.syncPermission();assert.equal(f.reads,0);assert.equal(f.settings.locationEnabled,permission==='granted');assert.equal(result.confirmed,permission==='granted');f.access.dispose();}
});
test('unsupported permission query confirms only current page and reload clears saved opt-in',async()=>{
 const f=fixture({query:false});await f.access.syncPermission();assert.equal(f.settings.locationEnabled,false);const authorization=f.access.authorize();assert.equal(f.reads,1);f.fixes[0].success(fix);assert.equal((await authorization).confirmed,true);assert.equal(f.settings.locationEnabled,true);
 const reloaded=createLocationAccess(f.options);assert.equal((await reloaded.syncPermission()).confirmed,false);assert.equal(f.settings.locationEnabled,false);assert.equal(f.reads,1);reloaded.dispose();f.access.dispose();
});
test('authorization invokes geolocation before any await and never stores coordinates',async()=>{
 const f=fixture({permission:'granted',enabled:false});const authorization=f.access.authorize();assert.equal(f.reads,1);f.fixes[0].success(fix);assert.equal((await authorization).confirmed,true);assert.deepEqual(f.writes,[{locationEnabled:true}]);assert.equal(f.access.getSnapshot(),null);f.access.dispose();
});
test('a successful one-time fix does not turn prompt into a persistent granted checkbox',async()=>{
 const f=fixture({permission:'prompt',enabled:false});const authorization=f.access.authorize();f.fixes[0].success(fix);assert.equal((await authorization).confirmed,false);assert.equal(f.settings.locationEnabled,false);f.access.dispose();
});
test('background unconfirmed call asks for user action without touching geolocation',async()=>{
 const f=fixture({hidden:true});await assert.rejects(f.access.read({sessionId:'s'}),{code:'LOCATION_PERMISSION_REQUIRED'});assert.equal(f.reads,0);assert.equal(f.settings.locationEnabled,false);assert.deepEqual(Object.keys(f.access.getSnapshot()).sort(),['code','requestedAt','sessionId']);f.access.dispose();
});
test('foreground return checks permission only and clears expired authorization',async()=>{
 const f=fixture({permission:'granted'});await f.access.syncPermission();f.permission='prompt';f.events.get('visibilitychange')();await flush();assert.equal(f.settings.locationEnabled,false);assert.equal(f.reads,0);f.access.dispose();
});
test('permission query has a finite deadline and caller cancellation prevents sensor access',async()=>{
 const f=fixture();f.options.navigator.permissions.query=()=>new Promise(()=>{});assert.equal(await f.access.permission(),'unknown');const c=new AbortController(),reading=f.access.read({signal:c.signal});c.abort();await assert.rejects(reading,{name:'AbortError'});assert.equal(f.reads,0);f.access.dispose();
});
function requestFixture({confirmed=true}={}){
 const nodes=new Map();const root={hidden:false,dataset:{},set innerHTML(value){for(const match of value.matchAll(/data-location-[a-z-]+/g))nodes.set('['+match[0]+']',{textContent:'',hidden:false,disabled:false});},querySelector:key=>nodes.get(key),replaceChildren(){}};
 let session='s',pending={sessionId:'s',code:'LOCATION_PERMISSION_REQUIRED'},listener,authorizations=0,continuations=0,lastSignal,continueResult=true,resolveAuthorization,asyncAuthorize=false;
 const access={getSnapshot:()=>pending,subscribe:fn=>{listener=fn;return()=>{};},dismiss(){pending=null;listener();},authorize({signal}){authorizations++;lastSignal=signal;return asyncAuthorize?new Promise(resolve=>resolveAuthorization=resolve):Promise.resolve({confirmed});}};
 const continuation=[];const ui=mountLocationRequest(root,{access,getSessionId:()=>session,t:key=>key,onAuthorized:async info=>{continuations++;continuation.push(info);return continueResult;}});
 return {ui,root,access,nodes,continuation,get authorizations(){return authorizations;},get continuations(){return continuations;},get signal(){return lastSignal;},get pending(){return pending;},set session(v){session=v;},set continueResult(v){continueResult=v;},defer(){asyncAuthorize=true;},resolve(value){resolveAuthorization(value);},click:()=>nodes.get('[data-location-authorize]').onclick()};
}
test('authorization succeeds and continues without its synchronous dismiss aborting the request',async()=>{
 const f=requestFixture();await f.click();assert.equal(f.authorizations,1);assert.equal(f.continuations,1);assert.equal(f.signal.aborted,false);assert.equal(f.root.hidden,true);f.ui.dispose();
});
test('unconfirmed single-use grant remains actionable and cannot auto-continue',async()=>{
 const f=requestFixture({confirmed:false});await f.click();assert.equal(f.continuations,0);assert.equal(f.root.hidden,false);assert.equal(f.nodes.get('[data-location-request-status]').hidden,false);f.ui.dispose();
});
test('capture stopped or bridge unavailable retains a fresh user Continue click',async()=>{
 const f=requestFixture();f.continueResult=false;await f.click();assert.equal(f.root.hidden,false);assert.equal(f.continuation[0].userGesture,false);assert.equal(f.nodes.get('[data-location-authorize]').textContent,'interaction.resume');f.continueResult=true;const clicking=f.click();assert.equal(f.continuations,2,'second continuation starts synchronously from click');await clicking;assert.equal(f.authorizations,1);assert.equal(f.continuation[1].userGesture,true);assert.equal(f.root.hidden,true);f.ui.dispose();
});
test('switching sessions during authorization cancels and cannot continue the old task',async()=>{
 const f=requestFixture();f.defer();const click=f.click();f.session='other';f.ui.refresh();assert.equal(f.signal.aborted,true);f.resolve({confirmed:true});await click;assert.equal(f.continuations,0);assert.equal(f.root.hidden,true);f.ui.dispose();
});
test('cancel only dismisses this conversation request',()=>{
 const f=requestFixture();f.nodes.get('[data-location-dismiss]').onclick();assert.equal(f.pending,null);assert.equal(f.root.hidden,true);assert.equal(f.authorizations,0);f.ui.dispose();
});

const appSource=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');
const continuationSource=appSource.match(/state\.locationRequest=mountLocationRequest[\s\S]*?onAuthorized:(async pending=>\{[^\n]+?\})\}\);/)[1];
function appContinuation({active=true,connected=true,running=false,session='s'}={}){let calls=0;const state={current:{id:session},running,submitting:false},capture={active};const run=new Function('state','capture','deviceSessionAvailable','sendMessage','t','return ('+continuationSource+')')(state,capture,()=>connected,async()=>{calls++;return true;},key=>key);return {run,state,capture,get calls(){return calls;},disconnect(){connected=false;}};}
test('real app continuation waits for a new user click if sharing stopped during authorization',async()=>{
 const f=appContinuation({active:false});assert.equal(await f.run({sessionId:'s',userGesture:false}),false);assert.equal(f.calls,0);const result=f.run({sessionId:'s',userGesture:true});assert.equal(f.calls,1,'capture startup is reached in this click stack');await result;
});
test('real app continuation preserves pending task while bridge disconnected, run active, or session changed',async()=>{
 for(const options of [{connected:false},{running:true},{session:'other'}]){const f=appContinuation(options);assert.equal(await f.run({sessionId:'s',userGesture:false}),false);assert.equal(f.calls,0);}
});
test('real app continuation can automatically continue when capture and bridge remain ready',async()=>{
 const f=appContinuation();assert.equal(await f.run({sessionId:'s',userGesture:false}),true);assert.equal(f.calls,1);
});

test('startup clearing an old checked setting does not cancel an explicit foreground one-off request',async()=>{
 const f=fixture({permission:'prompt',enabled:true});const request=f.access.read();await flush();await f.access.syncPermission();assert.equal(f.settings.locationEnabled,false);f.fixes[0].success(fix);assert.equal((await request).status,'located');f.access.dispose();
});

test('app Stop cancels pending location authorization before stopping the task',()=>{
 const stopSource=appSource.match(/\$\('#stop-run'\)\.onclick=\(\)=>\{([^\n]+?)\};/)[1];const calls=[];const state={locationAccess:{cancel:()=>calls.push('location')},harness:{stop:()=>calls.push('run')},abort:{abort:()=>calls.push('abort')}};
 new Function('state','$',stopSource)(state,()=>({}));assert.deepEqual(calls,['location','run','abort']);
});
test('clearing pending authorization during its prompt never continues after late success',async()=>{
 const f=requestFixture();f.defer();const click=f.click();f.access.dismiss();assert.equal(f.signal.aborted,true);f.resolve({confirmed:true});await click;assert.equal(f.continuations,0);f.ui.dispose();
});

test('real app continuation keeps authorization panel when sendMessage declines to start',async()=>{
 for(const result of [undefined,false]){const state={current:{id:'s'}},capture={active:true};let calls=0;const run=new Function('state','capture','deviceSessionAvailable','sendMessage','t','return ('+continuationSource+')')(state,capture,()=>true,async()=>{calls++;return result;},key=>key);assert.equal(await run({sessionId:'s',userGesture:false}),false);assert.equal(calls,1);}
});
test('late location settings mount disposes itself without replacing the current view',async()=>{
 const source=appSource.match(/const locationRoot=\$\('#location-settings'\),locationGeneration=state\.panelGeneration;([\s\S]*?)state\.locationSettings=view;/)[0];
 let root={isConnected:true},resolve,disposed=0;const newer={name:'newer'},state={panelGeneration:1,store:{},locationAccess:{},locationSettings:null};
 const mount=new Function('state','$','mountLocationSettings','toast','return (async()=>{'+source+'})()')(state,()=>root,()=>new Promise(done=>resolve=done),()=>{});
 state.panelGeneration=2;state.locationSettings=newer;root={isConnected:true};resolve({dispose:()=>disposed++});await mount;assert.equal(disposed,1);assert.equal(state.locationSettings,newer);
});

test('an older permission sync cannot overwrite a successful new authorization',async()=>{
 let saved={locationEnabled:true},permission='prompt',resolveOld,reads=0,ok;
 const access=createLocationAccess({getSettings:()=>++reads===1?new Promise(resolve=>resolveOld=resolve):Promise.resolve(saved),saveSettings:async patch=>(saved={...saved,...patch}),navigator:{permissions:{query:async()=>({state:permission})},geolocation:{getCurrentPosition(success){ok=success;}}}});
 const oldSync=access.syncPermission();await flush();const authorization=access.authorize();permission='granted';ok(fix);assert.equal((await authorization).confirmed,true);resolveOld({locationEnabled:true});assert.equal((await oldSync).confirmed,true);assert.equal(saved.locationEnabled,true);access.dispose();
});
test('late denial from a cancelled acquisition cannot clear a newer authorization',async()=>{
 const f=fixture({permission:'granted',enabled:false});const first=f.access.authorize();const rejected=assert.rejects(first);f.access.cancel();await rejected;const second=f.access.authorize();f.fixes[1].success(fix);await second;f.fixes[0].error({code:1});await flush();assert.equal(f.settings.locationEnabled,true);f.access.dispose();
});

test('browser permission revocation rejects an in-flight one-off fix and asks the affected session to reauthorize',async()=>{
 let onChange,ok;const permission={state:'granted',addEventListener(type,handler){onChange=handler;},removeEventListener(){}};
 const access=createLocationAccess({getSettings:async()=>({locationEnabled:false}),navigator:{permissions:{query:async()=>permission},geolocation:{getCurrentPosition(success){ok=success;}}}});
 const request=access.read({sessionId:'s'}),rejected=assert.rejects(request,{code:'LOCATION_DENIED'});await flush();permission.state='denied';onChange();ok(fix);await rejected;assert.equal(access.getSnapshot().code,'LOCATION_DENIED');assert.equal((await access.syncPermission()).confirmed,false);access.dispose();
});
