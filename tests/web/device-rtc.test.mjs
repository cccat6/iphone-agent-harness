import test from 'node:test';
import assert from 'node:assert/strict';
import {DeviceRTCTransport,deviceRTCAnswer,validateRTCConfiguration,encodeRTCFrames,allowedRTCRequest} from '../../apps/web/core/device-rtc.js';
import {DeviceClient} from '../../apps/web/core/device.js';
import {createHarness} from '../../apps/web/core/harness.js';
import {openStore} from '../../apps/web/core/store.js';
import {executePhonePlan} from '../../apps/web/core/plan.js';
const rtc={ip:'192.168.0.125',port:18948,fingerprint:'ab'.repeat(32)},baseUrl='http://igent.local';
const offer={type:'offer',sdp:'v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=mid:0\r\na=ice-ufrag:abcdef\r\na=ice-pwd:abcdefghijklmnopqrstuvwx\r\n'};
class Events{events=new Map();addEventListener(name,fn){if(!this.events.has(name))this.events.set(name,[]);this.events.get(name).push(fn);}emit(name,event={}){for(const fn of this.events.get(name)||[])fn(event);}}
class Channel extends Events{readyState='connecting';frames=[];send(raw){this.frames.push(JSON.parse(raw));}close(){this.readyState='closed';this.emit('close');}}
class Peer extends Events{static latest;constructor(options){super();Peer.latest=this;this.options=options;this.channel=new Channel();this.connectionState='new';this.iceConnectionState='new';}createDataChannel(label,options){this.channelOptions=options;return this.channel;}async createOffer(){return offer;}async setLocalDescription(value){this.passedOffer=value;this.localDescription=structuredClone(value);}async setRemoteDescription(value){this.answer=value;this.channel.readyState='open';this.channel.emit('open');}close(){this.connectionState='closed';this.emit('connectionstatechange');}}
async function connected(options={}){const transport=new DeviceRTCTransport({baseUrl,rtc,Peer,...options});await transport.open();return {transport,peer:Peer.latest};}
function respond(peer,value,request=peer.channel.frames.at(-1)){for(const frame of encodeRTCFrames(request.id,value,'res',request.n))peer.channel.emit('message',{data:frame});}
function request(peer,id=peer.channel.frames.at(-1).id){const frames=peer.channel.frames.filter(f=>f.id===id);return JSON.parse(Buffer.concat(frames.map(frame=>Buffer.from(frame.data,'base64'))).toString());}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function until(predicate){for(let i=0;i<200&&!predicate();i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(predicate(),'expected asynchronous lifecycle transition');}
const executionContext=()=>({boardId:'board',bootId:'boot',targetId:'phone',clientId:'browser',leaseId:'lease',orientationEpoch:1,mode:'task',identityVerified:true,bindingVerified:true,leaseVerified:true,executionEnabled:true,inputState:'released',knownFrames:new Map([['before',{targetId:'phone',orientationEpoch:1}]]),capabilities:{operations:['tap','capture']}});
test('RTC loads only same-site defaults, uses mDNS candidate, leaves local SDP unchanged',async()=>{
 const reads=[],transport=new DeviceRTCTransport({baseUrl,Peer,bootstrapFetch:async(url,options)=>{reads.push({url:String(url),options});return Response.json({version:1,port:18948,fingerprint:rtc.fingerprint});}});await transport.open();const peer=Peer.latest;assert.equal(reads.length,1);assert.ok(reads[0].url.endsWith('/apps/web/firmware/rtc-defaults.json'));assert.equal(reads[0].options.credentials,'omit');assert.deepEqual(peer.options.iceServers,[]);assert.equal(peer.passedOffer,offer);assert.ok(peer.answer.sdp.includes('igent.local 18948 typ host'));assert.ok(peer.answer.sdp.includes('libp2p+webrtc+v2/abcdefghijklmnopqrstuvwx'));assert.deepEqual(peer.channelOptions,{negotiated:true,id:0,ordered:true});assert.equal(transport.exportConfiguration().host,'igent.local');transport.close();
});
test('RTC fragments UTF-8 losslessly, preserves authorization and returns fetch-compatible response',async()=>{
 const {transport,peer}=await connected();const text='你好🙂'.repeat(130),pending=transport.fetch(baseUrl+'/v1/targets/phone/clipboard',{method:'POST',headers:{Authorization:'Bearer test-token','X-Request-Id':'test-id'},body:JSON.stringify({text})});
 assert.ok(peer.channel.frames.length>1);assert.ok(peer.channel.frames.every(f=>Buffer.byteLength(JSON.stringify(f))<=512&&Buffer.from(f.data,'base64').length<=256));assert.equal(request(peer).headers.authorization,'Bearer test-token');assert.equal(JSON.parse(request(peer).body).text,text);
 respond(peer,{status:200,body:JSON.stringify({text})});assert.deepEqual(await(await pending).json(),{text});transport.close();
});
test('queued requests are serialized and removing queued work leaves monotonic request number gap-free',async()=>{
 const {transport,peer}=await connected(),cancel=new AbortController();const first=transport.fetch(baseUrl+'/v1/identity'),second=transport.fetch(baseUrl+'/v1/clock',{signal:cancel.signal}),third=transport.fetch(baseUrl+'/v1/binding');const rejected=assert.rejects(second,{code:'DEVICE_REQUEST_CANCELLED'});cancel.abort();await rejected;assert.equal(new Set(peer.channel.frames.map(f=>f.id)).size,1);assert.equal(peer.channel.frames[0].n,1);
 respond(peer,{status:200,body:'{}'});await first;assert.equal(peer.channel.frames.at(-1).n,2);assert.equal(request(peer).path,'/v1/binding');respond(peer,{status:200,body:'{}'});await third;transport.close();
});
test('active cancellation or timeout closes RTC and rejects queued work without replay',async()=>{
 for(const timed of [false,true]){const {transport,peer}=await connected({timeoutMs:timed?5:8000}),controller=new AbortController(),first=transport.fetch(baseUrl+'/v1/targets/phone/segments',{method:'POST',body:'{}',signal:controller.signal}),second=transport.fetch(baseUrl+'/v1/clock');const done=Promise.allSettled([first,second]);if(!timed)controller.abort();const results=await done;assert.ok(results.every(r=>r.status==='rejected'));assert.equal(transport.closed,true);assert.equal(peer.connectionState,'closed');assert.equal(new Set(peer.channel.frames.map(f=>f.id)).size,1);}
});
test('run-ending read/renew and cancelled cleanup drain once before the next request',async()=>{
 for(const [method,path]of [['GET','/v1/identity'],['GET','/v1/binding'],['GET','/v1/targets/phone/results/segment'],['POST','/v1/targets/phone/leases/renew'],['POST','/v1/targets/phone/release'],['POST','/v1/targets/phone/cancel']]){
  const {transport,peer}=await connected(),controller=new AbortController();
  const first=transport.fetch(baseUrl+path,{method,...(method==='POST'?{body:'{}'}:{}),signal:controller.signal}),firstRequest=peer.channel.frames[0];
  const rejected=assert.rejects(first,{code:'DEVICE_REQUEST_CANCELLED'}),next=transport.fetch(baseUrl+'/v1/clock');controller.abort();await rejected;
  assert.equal(transport.ready,true);assert.equal(peer.channel.frames.length,1,'no concurrent request or replay while draining');
  const frames=encodeRTCFrames(firstRequest.id,{status:200,body:JSON.stringify({padding:'x'.repeat(600)})},'res',firstRequest.n);
  for(const raw of frames.slice(0,-1))peer.channel.emit('message',{data:raw});assert.equal(peer.channel.frames.length,1);
  peer.channel.emit('message',{data:frames.at(-1)});assert.equal(peer.channel.frames.length,2);const nextRequest=peer.channel.frames.at(-1);assert.equal(nextRequest.n,2);
  // A duplicate response for the abandoned request must not settle its successor.
  respond(peer,{status:200,body:'{"stale":true}'},firstRequest);assert.equal(transport.ready,true);
  respond(peer,{status:200,body:'{"current":true}'},nextRequest);assert.deepEqual(await(await next).json(),{current:true});transport.close();
 }
});
test('abandoned requests retain the original deadline and real unresponsive peers still close',async t=>{
 const {transport,peer}=await connected({timeoutMs:100});t.mock.timers.enable({apis:['setTimeout']});
 const controller=new AbortController(),first=transport.fetch(baseUrl+'/v1/identity',{signal:controller.signal});const rejected=assert.rejects(first,{code:'DEVICE_REQUEST_CANCELLED'});
 t.mock.timers.tick(70);controller.abort();await rejected;const second=transport.fetch(baseUrl+'/v1/clock'),lost=assert.rejects(second,{code:'DEVICE_RTC_TIMEOUT'});
 t.mock.timers.tick(29);assert.equal(transport.closed,false);t.mock.timers.tick(1);await lost;assert.equal(transport.closed,true);assert.equal(peer.channel.frames.length,1);
});
test('abandoned response still enforces request number and fragment order',async()=>{
 for(const mutation of ['n','seq']){const {transport,peer}=await connected(),controller=new AbortController();const first=transport.fetch(baseUrl+'/v1/identity',{signal:controller.signal}),rejected=assert.rejects(first,{code:'DEVICE_REQUEST_CANCELLED'});controller.abort();await rejected;
  const next=transport.fetch(baseUrl+'/v1/clock'),failed=assert.rejects(next,{code:'DEVICE_RTC_PROTOCOL_ERROR'}),frame=JSON.parse(encodeRTCFrames(peer.channel.frames[0].id,{status:200,body:'{}'},'res',1)[0]);frame[mutation]++;peer.channel.emit('message',{data:JSON.stringify(frame)});await failed;assert.equal(transport.closed,true);assert.equal(peer.channel.frames.length,1);
 }
});
test('active input, binding, ownership and staging mutations still close immediately on cancellation',async()=>{
 for(const path of ['/v1/pair','/v1/targets/phone/segments','/v1/targets/phone/bind','/v1/targets/phone/leases/claim','/v1/targets/phone/clipboard','/v1/targets/phone/clipboard/job/chunks','/v1/targets/phone/challenge/confirm']){
  const {transport,peer}=await connected(),controller=new AbortController(),first=transport.fetch(baseUrl+path,{method:'POST',body:'{}',signal:controller.signal}),next=transport.fetch(baseUrl+'/v1/identity'),done=Promise.allSettled([first,next]);controller.abort();const results=await done;assert.ok(results.every(r=>r.status==='rejected'&&r.reason.code==='DEVICE_REQUEST_CANCELLED'));assert.equal(transport.closed,true);assert.equal(peer.channel.frames.length,1);
 }
});
test('ending a real Harness run with a pending heartbeat GET or renew keeps the peer for cleanup',async t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});
 for(const method of ['GET','POST']){
  const {transport,peer}=await connected(),store=await openStore({memory:true}),model=deferred(),entered=deferred();t.after(()=>transport.close());
  await store.saveSettings({providers:[{id:'p',protocol:'openai',baseUrl:'https://model.invalid',model:'fixture'}],activeProviderId:'p'});const session=await store.createSession({mode:'task'});
  let heartbeat=false,cleanupStarted=false,cleanupSignal;
  const harness=createHarness({store,capture:{active:true,orientationEpoch:1},getContext:async({signal})=>{
   if(heartbeat){heartbeat=false;await transport.fetch(baseUrl+(method==='GET'?'/v1/identity':'/v1/targets/phone/leases/renew'),{method,...(method==='POST'?{body:'{}'}:{}),signal});}return executionContext();
  },device:{endRun:async({signal})=>{cleanupStarted=true;cleanupSignal=signal;await transport.fetch(baseUrl+'/v1/targets/phone/release',{method:'POST',body:'{}',signal});}},invoke:()=>{entered.resolve();return model.promise;}});
  const running=harness.run({sessionId:session.id,text:'Synthetic lifecycle test, no input.'});await entered.promise;
  heartbeat=true;t.mock.timers.tick(5000);await until(()=>peer.channel.frames.length===1);const original=peer.channel.frames[0];
  model.resolve({text:'No input needed.',toolCalls:[]});await until(()=>cleanupStarted);assert.equal(transport.ready,true);assert.equal(peer.channel.frames.length,1);
  respond(peer,{status:200,body:'{}'},original);await until(()=>peer.channel.frames.length===2);assert.equal(request(peer).path,'/v1/targets/phone/release');
  t.mock.timers.tick(1500);assert.equal(cleanupSignal.aborted,false,'normal release latency retains its receipt budget');assert.equal(transport.ready,true);
  respond(peer,{status:200,body:'{}'});await running;assert.equal(harness.running,false);assert.equal(transport.ready,true);assert.equal(new Set(peer.channel.frames.map(f=>f.id)).size,2);transport.close();
 }
});
test('capture metadata timeout drains its GET and accepts delayed release without replaying input',async t=>{
 const {transport,peer}=await connected();t.after(()=>transport.close());t.mock.timers.enable({apis:['setTimeout']});let submitted=0,releasing=false,releaseSignal;
 const ctx=executionContext(),plan={version:1,planId:'plan',sessionId:'session',boardId:'board',targetId:'phone',basedOnFrameId:'before',orientationEpoch:1,ttlMs:15000,maxExecutionMs:15000,steps:[{id:'tap',op:'tap',point:{x:4000,y:6000},holdMs:80,settleMs:0},{id:'capture',op:'capture',frames:{count:1,intervalMs:0,timeoutMs:100},review:false,label:'after tap'},{id:'never',op:'tap',point:{x:1000,y:1000},holdMs:80}]};
 const running=executePhonePlan(plan,{context:ctx,device:{submitSegment:async s=>{submitted++;return {...s,status:'hid_submitted',releaseSubmitted:true};},getResult:async()=>{throw new Error('unexpected reconciliation');},release:async(q,{signal})=>{releasing=true;releaseSignal=signal;const response=await transport.fetch(baseUrl+'/v1/targets/phone/release',{method:'POST',body:'{}',signal});return response.json();}},capture:{grab:async({signal})=>{await transport.fetch(baseUrl+'/v1/identity',{signal});throw new Error('expired sample must not be saved');}}});
 await until(()=>peer.channel.frames.length===1);const sample=peer.channel.frames[0];t.mock.timers.tick(100);await until(()=>releasing);assert.equal(transport.ready,true);assert.equal(submitted,1);assert.equal(peer.channel.frames.length,1);
 respond(peer,{status:200,body:'{}'},sample);await until(()=>peer.channel.frames.length===2);assert.equal(request(peer).path,'/v1/targets/phone/release');
 t.mock.timers.tick(1500);assert.equal(releaseSignal.aborted,false);respond(peer,{status:200,body:JSON.stringify({boardId:ctx.boardId,bootId:ctx.bootId,targetId:ctx.targetId,status:'released',leaseInvalidated:true})});
 const result=await running;assert.equal(result.status,'failed');assert.equal(result.code,'CAPTURE_TIMEOUT');assert.equal(result.steps[2].status,'skipped');assert.equal(result.inputState,'released');assert.equal(result.frames.length,0);assert.equal(submitted,1);assert.equal(transport.ready,true);
});
test('too-large envelope is rejected before any frame; wrong origin/path never reaches channel',async()=>{
 const {transport,peer}=await connected();await assert.rejects(transport.fetch(baseUrl+'/v1/targets/phone/segments',{method:'POST',body:'x'.repeat(12288)}),{code:'DEVICE_REQUEST_TOO_LARGE'});assert.equal(peer.channel.frames.length,0);
 for(const url of ['http://other.local/v1/identity',baseUrl+'/v1/identity?token=x',baseUrl+'/settings',baseUrl+'/v1/clipboard/jobs/id'])await assert.rejects(transport.fetch(url),{code:'DEVICE_INVALID_ARGUMENT'});assert.equal(peer.channel.frames.length,0);transport.close();
});
test('response correlation ignores other ids but rejects wrong monotonic number and fragment order',async()=>{
 for(const mutation of ['n','seq']){const {transport,peer}=await connected(),pending=transport.fetch(baseUrl+'/v1/identity');const frame=JSON.parse(encodeRTCFrames(peer.channel.frames[0].id,{status:200,body:'{}'},'res',1)[0]);peer.channel.emit('message',{data:JSON.stringify({...frame,id:crypto.randomUUID()})});assert.equal(transport.closed,false);frame[mutation]++;peer.channel.emit('message',{data:JSON.stringify(frame)});await assert.rejects(pending,{code:'DEVICE_RTC_PROTOCOL_ERROR'});assert.equal(transport.closed,true);}
});
test('DeviceClient performs identity enrollment through RTC without enabling phone input',async()=>{
 const {transport,peer}=await connected();let parts=[];const identity={boardId:'board',bootId:'boot',hostname:'igent.local',publicKeyFingerprint:'c'.repeat(64),pairingCodeRequired:false};peer.channel.send=function(raw){this.frames.push(JSON.parse(raw));parts.push(JSON.parse(raw));if(!parts.at(-1).end)return;const frame=parts[0],envelope=JSON.parse(Buffer.concat(parts.map(f=>Buffer.from(f.data,'base64'))).toString());parts=[];const data=envelope.path==='/v1/pair'?{...identity,clientId:JSON.parse(envelope.body).clientId,token:'a'.repeat(64)}:identity;queueMicrotask(()=>respond(peer,{status:200,body:JSON.stringify(data)},frame));};
 const client=new DeviceClient({baseUrl,fetchImpl:transport.fetch});await client.pair({clientId:'test-browser'});assert.equal(client.identityVerified,true);assert.equal(client.bindingVerified,false);assert.equal(client.leaseVerified,false);assert.ok(peer.channel.frames.every(f=>f.type==='req'));transport.close();
});
test('invalid RTC metadata and unsupported routes fail; clipboard contract routes allowed',()=>{
 for(const value of [{...rtc,ip:'8.8.8.8'},{...rtc,port:0},{...rtc,fingerprint:'bad'},{...rtc,ip:'evil\r\n.local'}])assert.throws(()=>validateRTCConfiguration(value));assert.equal(validateRTCConfiguration({...rtc,ip:undefined,host:'igent.local'}).host,'igent.local');assert.ok(deviceRTCAnswer(offer.sdp,rtc).sdp.includes('a=setup:passive'));
 for(const [method,path]of [['POST','/v1/targets/phone/clipboard'],['GET','/v1/targets/phone/clipboard/test-id'],['POST','/v1/targets/phone/clipboard/test-id/cancel']])assert.equal(allowedRTCRequest(method,path),true);
});

test('invalid clipboard total length rejects before sending and leaves connection open',async()=>{
 const {transport,peer}=await connected(),fp='c'.repeat(64),identity={boardId:'board',bootId:'boot',hostname:'igent.local',publicKeyFingerprint:fp};let parts=[];
 peer.channel.send=function(raw){const frame=JSON.parse(raw);this.frames.push(frame);parts.push(frame);if(!frame.end)return;const envelope=JSON.parse(Buffer.concat(parts.map(f=>Buffer.from(f.data,'base64'))).toString());parts=[];const data=envelope.path==='/v1/binding'?{...identity,clientId:'browser',targetId:'phone',bindingVerified:true,targets:[{targetId:'phone',connected:true,encrypted:true,hidSubscribed:true,inputState:'released'}]}:identity;queueMicrotask(()=>respond(peer,{status:200,body:JSON.stringify(data)},frame));};
 const client=new DeviceClient({baseUrl,fetchImpl:transport.fetch});client.restoreCredentials({format:'iah-device-credential/1',baseUrl,clientId:'browser',token:'a'.repeat(64),boardId:'board',hostname:'igent.local',publicKeyFingerprint:fp,expectedFingerprint:fp});await client.identity();await client.getBinding();const before=peer.channel.frames.length;
 await assert.rejects(client.stageClipboard({requestId:'job',sessionId:'session',targetId:'phone',totalBytes:Number.MAX_SAFE_INTEGER+1}),error=>error.code==='DEVICE_CLIPBOARD_INVALID');assert.equal(peer.channel.frames.length,before);assert.equal(transport.ready,true);transport.close();
});

test('temporary ICE disconnection can recover without replay; failed ICE closes immediately',async()=>{
 const {transport,peer}=await connected({timeoutMs:50});peer.iceConnectionState='disconnected';peer.emit('iceconnectionstatechange');assert.equal(transport.closed,false);
 peer.iceConnectionState='connected';peer.emit('iceconnectionstatechange');await new Promise(resolve=>setTimeout(resolve,60));assert.equal(transport.closed,false);assert.equal(peer.channel.frames.length,0);
 peer.iceConnectionState='failed';peer.emit('iceconnectionstatechange');assert.equal(transport.closed,true);
 const lost=await connected({timeoutMs:5});lost.peer.iceConnectionState='disconnected';lost.peer.emit('iceconnectionstatechange');await new Promise(resolve=>setTimeout(resolve,10));assert.equal(lost.transport.closed,true);
});

test('normal RTC requests survive a nine-second response delay within the reliable transport budget',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {transport,peer}=await connected();t.after(()=>transport.close());assert.equal(transport.requestTimeoutMs,30000);
 const client=new DeviceClient({baseUrl,fetchImpl:transport.fetch,timeoutMs:transport.requestTimeoutMs});let settled=false;const pending=client.identity().finally(()=>{settled=true;});await until(()=>peer.channel.frames.length===1);
 t.mock.timers.tick(8000);await new Promise(r=>setImmediate(r));assert.equal(settled,false);assert.equal(transport.ready,true);
 t.mock.timers.tick(1000);respond(peer,{status:200,body:JSON.stringify({boardId:'board',bootId:'boot',hostname:'igent.local',publicKeyFingerprint:'c'.repeat(64)})});await pending;assert.equal(transport.ready,true);assert.equal(peer.channel.frames.length,1);
});
test('an individual deadline drains an uncertain mutation without replaying it or closing the live peer',async()=>{
 const {transport,peer}=await connected();const controller=new AbortController(),pending=transport.fetch(baseUrl+'/v1/targets/phone/segments',{method:'POST',body:'{}',signal:controller.signal});const rejected=assert.rejects(pending,{code:'DEVICE_REQUEST_CANCELLED'});const sent=peer.channel.frames[0];controller.abort(Object.assign(new Error('request deadline'),{code:'DEVICE_TIMEOUT'}));await rejected;
 assert.equal(transport.ready,true);const next=transport.fetch(baseUrl+'/v1/clock');assert.equal(peer.channel.frames.length,1);respond(peer,{status:202,body:'{}'},sent);await until(()=>peer.channel.frames.length===2);assert.equal(request(peer).path,'/v1/clock');respond(peer,{status:200,body:'{}'});await next;assert.equal(transport.ready,true);assert.equal(peer.channel.frames.filter(f=>f.id===sent.id).length,1);transport.close();
});
