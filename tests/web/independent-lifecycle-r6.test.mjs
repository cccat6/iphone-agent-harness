import test from 'node:test';
import assert from 'node:assert/strict';
import {ScreenCapture} from '../../apps/web/core/capture.js';
import {createHarness} from '../../apps/web/core/harness.js';
import {openStore} from '../../apps/web/core/store.js';

const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function patch(t,key,value){const old=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});t.after(()=>old?Object.defineProperty(globalThis,key,old):delete globalThis[key]);}
function stream(){const track=new EventTarget();track.readyState='live';track.stop=()=>{track.readyState='ended';};return {track,getVideoTracks:()=>[track],getTracks:()=>[track]};}
function captureFixture(t){
 const capture=new ScreenCapture(),streams=[],listeners=new Set();let closed=0;
 patch(t,'navigator',{mediaDevices:{getDisplayMedia:async()=>{const s=stream();streams.push(s);return s;}}});
 patch(t,'MediaRecorder',class {state='inactive';static isTypeSupported(){return false;}start(){this.state='recording';}stop(){this.state='inactive';}});
 patch(t,'ImageCapture',class {async grabFrame(){return {width:120,height:240,close(){closed++;}};}});
 patch(t,'OffscreenCanvas',class {getContext(){return {drawImage(){}};}async convertToBlob(){return new Blob(['synthetic']);}});
 const subscribe=capture.subscribe.bind(capture);capture.subscribe=fn=>{listeners.add(fn);const remove=subscribe(fn);return ()=>{listeners.delete(fn);remove();};};
 return {capture,streams,listeners,get closed(){return closed;}};
}
async function setup(){const store=await openStore({memory:true});await store.saveSettings({providers:[{id:'r6',protocol:'openai',baseUrl:'https://offline.invalid/v1',model:'synthetic',stream:false}],activeProviderId:'r6'});return {store,session:await store.createSession({mode:'task'})};}
const context=epoch=>({boardId:'board',bootId:'boot',targetId:'phone',clientId:'client',leaseId:'lease',orientationEpoch:epoch,identityVerified:true,bindingVerified:true,leaseVerified:true,executionEnabled:true,inputState:'released',knownFrames:new Map([['frame',{targetId:'phone',orientationEpoch:epoch}]]),capabilities:{operations:['home']}});
const home=sessionId=>({id:'input',name:'phone_execute_plan',arguments:{plan:{version:1,planId:'plan',sessionId,boardId:'board',targetId:'phone',basedOnFrameId:'frame',orientationEpoch:1,ttlMs:15000,maxExecutionMs:15000,steps:[{id:'home',op:'home'}]}}});

test('independent R6: native sharing end during data URL read rejects the late frame',async t=>{
 const f=captureFixture(t),reading=deferred();let reader;
 patch(t,'FileReader',class {readAsDataURL(){reader=this;reading.resolve();}});
 await f.capture.start();const pending=f.capture.grab();await reading.promise;
 f.streams[0].track.readyState='ended';f.streams[0].track.dispatchEvent(new Event('ended'));
 reader.result='data:image/jpeg;base64,late';reader.onload();
 await assert.rejects(pending,e=>e.code==='CAPTURE_SOURCE_CHANGED');assert.equal(f.closed,1);assert.equal(f.capture.stream,null);
});

test('independent R6: a draw failure closes the bitmap and leaves subsequent stop idempotent',async t=>{
 const f=captureFixture(t);patch(t,'OffscreenCanvas',class {getContext(){return {drawImage(){throw new Error('synthetic draw failure');}};}});
 await f.capture.start();let stopped=0;f.capture.subscribe(()=>{stopped++;});await assert.rejects(f.capture.grab(),/synthetic draw failure/);
 assert.equal(f.closed,1);f.capture.stop();f.capture.stop();assert.equal(stopped,1);
});

test('independent R6: stop while the dispatch intent is persisting prevents its device call and settles the batch',async t=>{
 const f=captureFixture(t);await f.capture.start();const {store,session}=await setup(),entered=deferred(),persist=deferred(),addEvent=store.addEvent.bind(store);let submitted=0,ended=0;
 store.addEvent=async(id,event)=>{if(event.type==='device.segment.intent'){entered.resolve();await persist.promise;}return addEvent(id,event);};
 const h=createHarness({store,capture:f.capture,getContext:()=>context(1),device:{submitSegment:async()=>{submitted++;},getResult:async()=>{},release:async()=>{throw new Error('no segment dispatched');},endRun:async()=>{ended++;}},invoke:async()=>({text:'',toolCalls:[home(session.id),{id:'dependent',name:'skills_list',arguments:{}}]})});
 const pending=h.run({sessionId:session.id,text:'One bounded input.'});await entered.promise;f.capture.stop();persist.resolve();assert.equal((await pending).status,'paused');
 assert.equal((await store.getSession(session.id)).promptState.runResume.reason,'capture_stopped');assert.equal(submitted,0);assert.equal(ended,1);assert.equal(h.running,false);assert.equal(f.listeners.size,0);
 const messages=await store.getMessages(session.id);for(const id of ['input','dependent'])assert.equal(messages.filter(m=>m.toolCallId===id).length,1);
 assert.equal(JSON.parse(messages.find(m=>m.toolCallId==='dependent').text).status,'not_executed');
});

test('independent R6: listeners detach after completion, provider failure, sharing pause and a later successful run',async t=>{
 const f=captureFixture(t);await f.capture.start();const {store}=await setup();let behavior='complete',calls=0,entered=deferred();
 const h=createHarness({store,capture:f.capture,getContext:()=>context(f.capture.orientationEpoch),invoke:async()=>{calls++;if(behavior==='fail')throw new Error('synthetic provider failure');if(behavior==='wait'){entered.resolve();return new Promise(()=>{});}return {text:'done',toolCalls:[]};}});
 const run=async()=>h.run({sessionId:(await store.createSession({mode:'task'})).id,text:'A bounded run.'});
 await run();assert.equal(f.listeners.size,0);behavior='fail';await assert.rejects(run(),/synthetic provider failure/);assert.equal(f.listeners.size,0);
 behavior='wait';const pending=run();await entered.promise;assert.equal(f.listeners.size,1);f.capture.stop();assert.equal((await pending).status,'paused');assert.equal(f.listeners.size,0);
 await f.capture.start();behavior='complete';await run();assert.equal(f.listeners.size,0);assert.equal(calls,4);assert.equal(h.running,false);f.capture.stop();
});

test('independent R6: old ended events cannot cancel a later run using a replacement stream',async t=>{
 const f=captureFixture(t);await f.capture.start();const old=f.streams[0],{store,session}=await setup(),entered=deferred(),reply=deferred();
 await f.capture.start();const replacement=f.capture.stream;
 const h=createHarness({store,capture:f.capture,getContext:()=>context(f.capture.orientationEpoch),invoke:async()=>{entered.resolve();return reply.promise;}});
 const pending=h.run({sessionId:session.id,text:'Use the replacement source.'});await entered.promise;old.track.dispatchEvent(new Event('ended'));
 assert.equal(f.capture.stream,replacement);assert.equal(h.running,true);reply.resolve({text:'done',toolCalls:[]});await pending;assert.equal(f.listeners.size,0);f.capture.stop();
});

test('independent R6: plan interaction pauses on sharing end and legacy captures without subscribe still work',async t=>{
 const f=captureFixture(t);await f.capture.start();const {store,session}=await setup(),entered=deferred();
 const h=createHarness({store,capture:f.capture,getContext:()=>context(f.capture.orientationEpoch),invoke:async()=>{entered.resolve();return new Promise(()=>{});}});
 const pending=h.run({sessionId:session.id,mode:'plan',text:'Only propose.'});await entered.promise;f.capture.stop();assert.equal((await pending).status,'paused');assert.equal(f.listeners.size,0);
 await createHarness({store,capture:{active:false,orientationEpoch:0},getContext:()=>({}),invoke:async()=>({text:'legacy done',toolCalls:[]})}).run({sessionId:session.id,mode:'plan',text:'No observation required.'});
});
