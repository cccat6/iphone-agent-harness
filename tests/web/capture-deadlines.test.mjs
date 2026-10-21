import test from 'node:test';
import assert from 'node:assert/strict';
import {ScreenCapture} from '../../apps/web/core/capture.js';
import {executePhonePlan} from '../../apps/web/core/plan.js';
import {createHarness} from '../../apps/web/core/harness.js';
import {openStore} from '../../apps/web/core/store.js';
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)}};
const turn=()=>new Promise(r=>setImmediate(r));
function patch(t,key,value){const old=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});t.after(()=>old?Object.defineProperty(globalThis,key,old):delete globalThis[key]);}
function fixture(t,{native,encode,read,timeoutMs=25}={}){
 let nativeCalls=0,closed=0,readAborts=0;const streams=[];
 const stream=()=>{const track=new EventTarget();track.readyState='live';track.muted=false;track.stop=()=>track.readyState='ended';return {getVideoTracks:()=>[track],getTracks:()=>[track]};};
 patch(t,'navigator',{mediaDevices:{getDisplayMedia:async()=>{const value=stream();streams.push(value);return value;}}});
 patch(t,'MediaRecorder',class{state='inactive';static isTypeSupported(){return true;}start(){this.state='recording';}stop(){this.state='inactive';}});
 patch(t,'ImageCapture',class{grabFrame(){nativeCalls++;return native?native():Promise.resolve({width:10,height:20,close(){closed++;}});}});
 patch(t,'OffscreenCanvas',class{getContext(){return {drawImage(){}};}convertToBlob(){return encode?encode():Promise.resolve(new Blob(['fixture']));}});
 patch(t,'FileReader',class{readAsDataURL(){if(read)return read(this);this.result='data:image/jpeg;base64,eA==';queueMicrotask(()=>this.onload());}abort(){readAborts++;this.onabort?.();}});
 const capture=new ScreenCapture({timeoutMs,stageTimeoutMs:timeoutMs});t.after(()=>capture.stop());return {capture,streams,get nativeCalls(){return nativeCalls;},get closed(){return closed;},get readAborts(){return readAborts;}};
}
test('native timeout keeps sharing, requires restart and never stacks another pending native call',async t=>{
 const pending=deferred(),f=fixture(t,{native:()=>pending.promise}),diagnostics=[];await f.capture.start();
 await assert.rejects(f.capture.grab({onDiagnostic:v=>diagnostics.push(v)}),{code:'CAPTURE_TIMEOUT',stage:'native_frame'});
 assert.equal(f.capture.active,true);assert.equal(f.capture.needsRestart,true);await assert.rejects(f.capture.grab(),{code:'CAPTURE_RESTART_REQUIRED'});assert.equal(f.nativeCalls,1);
 let closed=0;pending.resolve({width:10,height:20,close(){closed++;}});await turn();assert.equal(closed,1);assert.equal(f.capture.needsRestart,true);
 assert.deepEqual(Object.keys(diagnostics[0]).sort(),['durationMs','lastRecorderEventAgeMs','needsRestart','stage','status','trackMuted','trackState','visibility']);assert.equal(diagnostics[0].status,'timeout');
 await f.capture.start();assert.equal(f.capture.needsRestart,false);assert.equal(f.capture.lastMediaEventAtMs,null);
});
test('concurrent native call fails busy without invalidating the owner; cancellation closes its late bitmap',async t=>{
 const pending=deferred(),f=fixture(t,{native:()=>pending.promise,timeoutMs:1000});await f.capture.start();const controller=new AbortController(),first=f.capture.grab({signal:controller.signal});
 await assert.rejects(f.capture.grab(),{code:'CAPTURE_BUSY'});assert.equal(f.capture.needsRestart,false);controller.abort();await assert.rejects(first,{name:'AbortError'});assert.equal(f.capture.needsRestart,true);assert.equal(f.nativeCalls,1);
 let closed=0;pending.resolve({width:10,height:20,close(){closed++;}});await turn();assert.equal(closed,1);
});
test('source replacement immediately rejects its pending frame and old settlement cannot affect the new source',async t=>{
 const pending=deferred(),f=fixture(t,{native:()=>pending.promise,timeoutMs:1000});await f.capture.start();const first=f.capture.grab(),rejected=assert.rejects(first,{code:'CAPTURE_SOURCE_CHANGED'});await f.capture.start();await rejected;
 assert.equal(f.capture.needsRestart,false);let closed=0;pending.resolve({width:10,height:20,close(){closed++;}});await turn();assert.equal(closed,1);assert.equal(f.capture.active,true);assert.equal(f.capture.needsRestart,false);
});
test('encoding timeout is bounded and closes the bitmap before any late encoded image',async t=>{
 const encoded=deferred(),f=fixture(t,{encode:()=>encoded.promise});await f.capture.start();await assert.rejects(f.capture.grab(),{code:'CAPTURE_TIMEOUT',stage:'encode'});assert.equal(f.closed,1);assert.equal(f.capture.needsRestart,true);await assert.rejects(f.capture.grab(),{code:'CAPTURE_RESTART_REQUIRED'});assert.equal(f.nativeCalls,1);encoded.resolve(new Blob(['late']));await turn();assert.equal(f.capture.active,true);
});
test('data URL timeout actively aborts its FileReader and never returns a late image',async t=>{
 let reader;const f=fixture(t,{read:r=>reader=r});await f.capture.start();await assert.rejects(f.capture.grab(),{code:'CAPTURE_TIMEOUT',stage:'read'});assert.equal(f.readAborts,1);reader.result='data:image/jpeg;base64,late';reader.onload?.();await turn();assert.equal(f.closed,1);
});
const ctx=()=>({boardId:'b',bootId:'boot',targetId:'t',clientId:'c',leaseId:'l',orientationEpoch:0,mode:'auto',identityVerified:true,bindingVerified:true,leaseVerified:true,executionEnabled:true,inputState:'released',knownFrames:new Map([['before',{targetId:'t',orientationEpoch:0}]]),capabilities:{operations:['capture','tap']}});
const plan=()=>({version:1,planId:'p',sessionId:'s',boardId:'b',targetId:'t',basedOnFrameId:'before',orientationEpoch:0,ttlMs:15000,maxExecutionMs:15000,steps:[{id:'capture',op:'capture',frames:{count:1,intervalMs:0,timeoutMs:100},review:true,label:'fixture'}]});
for(const location of ['context_before','context_after','save'])test('frame deadline covers '+location+' and propagates cancellation',async()=>{
 let checks=0,grabs=0,saves=0,receivedSignal;const base=ctx(),context={...base,getState:({signal})=>{checks++;if(checks===(location==='context_before'?2:location==='context_after'?3:-1)){receivedSignal=signal;return new Promise(()=>{});}return base;}};
 const capture={grab:async()=>{grabs++;return {frameId:'f',targetId:'t',orientationEpoch:0,requestedAtMs:1,readyAtMs:2,mediaTimeMs:null,width:10,height:20};},save:async(frame,metadata,{signal})=>{saves++;receivedSignal=signal;return new Promise(()=>{});}};
 const value=await executePhonePlan(plan(),{context,capture});assert.equal(value.code,'CAPTURE_TIMEOUT');assert.equal(value.captureStage,location);assert.equal(value.frames.length,0);assert.equal(receivedSignal.aborted,true);assert.equal(grabs,location==='context_before'?0:1);assert.equal(saves,location==='save'?1:0);
});
test('phone_observe has one bounded frame deadline and writes metadata-only stages',async()=>{
 const store=await openStore({memory:true});await store.saveSettings({providers:[{id:'p',protocol:'openai',baseUrl:'https://unused.invalid',model:'fixture'}],activeProviderId:'p'});const session=await store.createSession({mode:'auto'});let turns=0,grabs=0;
 const h=createHarness({store,capture:{active:true,timeoutMs:25,grab:()=>{grabs++;return new Promise(()=>{});}},getContext:()=>ctx(),invoke:async()=>++turns===1?{text:'',toolCalls:[{id:'o',name:'phone_observe',arguments:{count:1}}]}:{text:'Please share again.',toolCalls:[]}});
 await h.run({sessionId:session.id,text:'Observe fixture'});assert.equal(grabs,1);const messages=await store.getMessages(session.id),result=JSON.parse(messages.find(m=>m.toolName==='phone_observe').text);assert.equal(result.code,'CAPTURE_TIMEOUT');const records=(await store.getEvents(session.id)).filter(e=>e.type==='capture.stage');assert.ok(records.some(e=>e.payload.status==='timeout'));assert.ok(records.every(e=>Object.keys(e.payload).every(key=>['stage','status','durationMs'].includes(key))));store.close();
});
test('the total plan deadline expiring during capture is reported separately from capture timeout',async()=>{
 const input=plan();input.maxExecutionMs=100;const value=await executePhonePlan(input,{context:ctx(),capture:{grab:()=>new Promise(()=>{}),save:async()=>{throw Error('not reached');}}});assert.equal(value.code,'PLAN_DEADLINE_EXCEEDED');assert.equal(value.captureStage,undefined);assert.ok(value.timing.elapsedMs>=0);
});
test('an already submitted tap is never replayed when capture needs restarting',async()=>{
 const input=plan();input.steps.unshift({id:'tap',op:'tap',point:{x:5000,y:5000},holdMs:50});let submits=0;const device={submitSegment:async segment=>{submits++;return {...segment,status:'hid_submitted',releaseSubmitted:true};},getResult:async()=>{throw Error('not needed');},release:async query=>({...query,status:'released',leaseInvalidated:true})};
 const value=await executePhonePlan(input,{context:ctx(),device,capture:{needsRestart:true,grab:async()=>{throw Object.assign(new Error('fixture timeout'),{code:'CAPTURE_TIMEOUT',stage:'native_frame'});},save:async()=>{throw Error('not reached');}}});assert.equal(submits,1);assert.equal(value.inputState,'released');assert.equal(value.recovery.action,'resume_sharing');assert.equal(value.recovery.automatic,false);assert.equal(value.captureNeedsRestart,true);
});
test('encoding and reading share the same lane even after the native bitmap has arrived',async t=>{
 const encoded=deferred(),entered=deferred(),f=fixture(t,{timeoutMs:1000,encode:()=>{entered.resolve();return encoded.promise;}});await f.capture.start();const first=f.capture.grab();await entered.promise;await assert.rejects(f.capture.grab(),{code:'CAPTURE_BUSY'});assert.equal(f.nativeCalls,1);encoded.resolve(new Blob(['fixture']));await first;await f.capture.grab();assert.equal(f.nativeCalls,2);
});
