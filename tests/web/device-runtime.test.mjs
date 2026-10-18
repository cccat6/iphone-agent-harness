import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from '../../apps/web/core/harness.js';
import {openStore} from '../../apps/web/core/store.js';
import {DeviceClient} from '../../apps/web/core/device.js';
const done={text:'done',toolCalls:[]},turn=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)}};
async function setup(){const store=await openStore({memory:true});await store.saveSettings({providers:[{id:'p',protocol:'openai',baseUrl:'https://offline.invalid',model:'test',stream:false}],activeProviderId:'p'});return {store,session:await store.createSession({mode:'task'})};}
const context={boardId:'board',bootId:'boot',targetId:'phone',clientId:'client',leaseId:'lease',orientationEpoch:1,identityVerified:true,bindingVerified:true,leaseVerified:true,executionEnabled:true,inputState:'released',knownFrames:new Map([['before',{targetId:'phone',orientationEpoch:1}]]),capabilities:{operations:['home','capture']}};
const plan=sessionId=>({version:1,planId:'plan',sessionId,boardId:'board',targetId:'phone',basedOnFrameId:'before',orientationEpoch:1,ttlMs:15000,maxExecutionMs:15000,steps:[{id:'home',op:'home'}]});
const call=value=>({text:'',toolCalls:[{id:'execute',name:'phone_execute_plan',arguments:{plan:value}}]});

test('task heartbeat renews only its run, never claims, and stops before endRun cleanup',async t=>{
 t.mock.timers.enable({apis:['setInterval']});const {store,session}=await setup(),entered=deferred(),finish=deferred(),metas=[],ends=[];
 const h=createHarness({store,getContext:meta=>{metas.push(meta);return {};},device:{endRun:async meta=>{ends.push(meta);return {status:'not_owned'};}},invoke:async()=>{entered.resolve();return finish.promise;}});
 const running=h.run({sessionId:session.id,text:'wait for this model'});await entered.promise;const count=metas.length;t.mock.timers.tick(5000);await turn();assert.equal(metas.length,count+1);assert.equal(metas.at(-1).allowClaim,false);assert.equal(metas.at(-1).mode,'task');assert.ok(metas.every(m=>m.runId===metas[0].runId));
 finish.resolve(done);await running;assert.equal(ends.length,1);assert.equal(ends[0].writerId,metas[0].runId);assert.equal(ends[0].signal.aborted,false);const after=metas.length;t.mock.timers.tick(15000);await turn();assert.equal(metas.length,after);assert.equal(metas.at(-1).signal.aborted,true);
});

test('plan-only and chat runs never start a device-renewal heartbeat',async t=>{
 t.mock.timers.enable({apis:['setInterval']});for(const mode of ['chat','plan']){const {store,session}=await setup(),entered=deferred(),finish=deferred(),metas=[];const h=createHarness({store,getContext:meta=>{metas.push(meta);return {};},invoke:async()=>{entered.resolve();return finish.promise;}});const running=h.run({sessionId:session.id,text:'read only',mode});await entered.promise;const count=metas.length;t.mock.timers.tick(15000);await turn();assert.equal(metas.length,count);assert.ok(metas.every(m=>m.allowClaim===false));finish.resolve(done);await running;}
});

test('cancelled frame node propagates its signal and cannot claim a lease after the run ends',async()=>{
 const {store,session}=await setup(),late=deferred();let frameSignal,pendingFrame,ended=false,lateContexts=0;
 const h=createHarness({store,capture:{active:true,grab:async({signal})=>{frameSignal=signal;return late.promise;}},getContext:()=>{if(ended)lateContexts++;return context;},device:{endRun:async()=>{ended=true;}},executePlan:async(p,{capture})=>{const sampler=new AbortController();pendingFrame=capture.grab({signal:sampler.signal}).catch(()=>null);sampler.abort();return {status:'failed',frames:[]};},invoke:async()=>call(plan(session.id))});
 await h.run({sessionId:session.id,text:'mock a frame-node failure'});assert.equal(ended,true);assert.equal(frameSignal.aborted,true);late.resolve({frameId:'late',width:1,height:1,dataUrl:'data:image/jpeg;base64,YQ=='});await pendingFrame;await turn();assert.equal(lateContexts,0);assert.equal(h.running,false);
});

test('default plan cancellation finishes its own release before Harness endRun',{timeout:5000},async()=>{
 const {store,session}=await setup(),releaseGate=deferred(),submitted=deferred(),releasing=deferred();let ends=0;
 const h=createHarness({store,getContext:()=>context,device:{submitSegment:async()=>{submitted.resolve();return new Promise(()=>{});},getResult:async()=>{throw new Error('not expected');},release:async q=>{releasing.resolve();await releaseGate.promise;return {...q,status:'released',leaseInvalidated:true,releaseSubmitted:true};},endRun:async()=>{ends++;}},invoke:async()=>call(plan(session.id))});
 const running=h.run({sessionId:session.id,text:'cancel the actual plan executor'});const result=running.catch(e=>e);await submitted.promise;h.stop();await releasing.promise;await turn();assert.equal(ends,0);releaseGate.resolve();assert.equal((await result).status,'cancelled');assert.equal(ends,1);assert.equal(h.running,false);
});

test('executing plan state checks cannot reclaim a replacement lease',async()=>{
 const {store,session}=await setup(),seen=[];let inside=false;
 const h=createHarness({store,getContext:meta=>{seen.push({inside,...meta});return context;},executePlan:async(p,{context:latest})=>{inside=true;try{await latest.getState();await latest.getState();return {status:'completed',frames:[]};}finally{inside=false;}},invoke:async()=>seen.some(m=>m.inside)?done:call(plan(session.id))});
 await h.run({sessionId:session.id,text:'check fixed plan lease'});assert.ok(seen.some(m=>m.inside));assert.ok(seen.filter(m=>m.inside).every(m=>m.allowClaim===false));
});

test('Harness, DeviceClient and actual plan executor agree on run ownership and final release',async()=>{
 const {store,session}=await setup(),fingerprint='a'.repeat(64),token='fixture-runtime-device-token',requests=[];let lease=null,lastSegment,turns=0,runId;
 const client=new DeviceClient({baseUrl:'https://board.invalid',fetchImpl:async(url,o)=>{const path=new URL(url).pathname,body=o.body?JSON.parse(o.body):null;requests.push({path,body});const meta={boardId:'board',bootId:'boot',clientId:'client'};
  if(path==='/v1/identity')return Response.json({...meta,hostname:'board.invalid',publicKeyFingerprint:fingerprint});
  if(!['/v1/capabilities','/v1/clock'].includes(path))assert.equal(o.headers.Authorization,'Bearer '+token);
  if(path==='/v1/binding')return Response.json({...meta,targetId:'phone',bindingVerified:true,targets:[{targetId:'phone',connected:true,encrypted:true,hidSubscribed:true,inputState:'released',running:false}]});
  if(path==='/v1/capabilities')return Response.json({...meta,executionEnabled:true,operations:['home'],maxEvents:256,maxSegmentMs:5000,maxHoldMs:3000});
  if(path==='/v1/clock')return Response.json({...meta,deviceTimeMs:performance.now()+5000});
  if(path.endsWith('/leases/claim')){assert.equal(lease,null);lease=body.leaseId;return Response.json({...meta,targetId:'phone',leaseId:lease,inputState:'released',expiresAtDeviceMs:performance.now()+20000});}
  if(path.endsWith('/segments')){assert.equal(body.leaseId,lease);lastSegment=body;return Response.json({...body,status:'hid_submitted',releaseSubmitted:true});}
  if(path.endsWith('/release')){assert.equal(body.leaseId,lease);lease=null;return Response.json({...meta,targetId:'phone',status:'released',leaseInvalidated:true,releaseSubmitted:true});}
  throw new Error('Unexpected mock route');
 }});client.restoreCredentials({format:'iah-device-credential/1',baseUrl:'https://board.invalid',clientId:'client',token,boardId:'board',publicKeyFingerprint:fingerprint,expectedFingerprint:fingerprint});
 const h=createHarness({store,device:client,getContext:async meta=>{runId=meta.runId;return {...await client.getExecutionContext({writerId:meta.runId,allowClaim:meta.allowClaim,signal:meta.signal,orientationEpoch:1}),knownFrames:context.knownFrames};},invoke:async()=>turns++?done:call(plan(session.id))});await h.run({sessionId:session.id,text:'execute one mock Home'});assert.ok(runId);assert.equal(lastSegment.clientId,'client');assert.equal(requests.filter(r=>r.path.endsWith('/segments')).length,1);assert.equal(requests.filter(r=>r.path.endsWith('/release')).length,1);assert.equal(client.leaseId,null);assert.equal(client.status().inputState,'released');
});

test('Chat stays entirely independent of device and capture adapters across local-tool model rounds',async()=>{const {store,session}=await setup();let modelCalls=0,contextCalls=0;const forbidden=new Proxy({},{get(){throw new Error('Chat touched a hardware adapter');}}),h=createHarness({store,device:forbidden,capture:forbidden,getContext:()=>{contextCalls++;throw new Error('Chat queried the board');},invoke:async r=>{assert.ok(!r.tools.some(t=>t.name.startsWith('phone_')));return modelCalls++?done:{text:'',toolCalls:[{id:'local-skills',name:'skills_list',arguments:{}}]};}});await h.run({sessionId:session.id,mode:'chat',text:'List local Skills without a board.'});assert.equal(modelCalls,2);assert.equal(contextCalls,0);});
