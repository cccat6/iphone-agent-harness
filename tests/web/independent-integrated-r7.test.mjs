import test from 'node:test';
import assert from 'node:assert/strict';
import {DeviceClient} from '../../apps/web/core/device.js';
import {canonicalSegmentJson} from '../../apps/web/core/plan.js';

// Finite server adapter: monotonic time advances per request, no network/waits.
function board({rtt=1100,cacheMs}={}){
 let now=10000,boot='boot-a',target='phone-a',lease=null;
 const calls=[],state={capsFail:false,releaseUnknown:false,capsLimit:8192};
 const meta=()=>({boardId:'board-a',bootId:boot,clientId:'client-a'});
 const client=new DeviceClient({baseUrl:'https://r7.invalid',cacheMs,now:()=>now,fetchImpl:async(url,options)=>{
  const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;
  calls.push({path,body});now+=rtt;
  if(path==='/v1/identity')return Response.json({...meta(),publicKeyFingerprint:'a'.repeat(64)});
  if(path==='/v1/clock')return Response.json({...meta(),deviceTimeMs:now});
  if(path==='/v1/binding')return Response.json({...meta(),targetId:target,bindingVerified:true,targets:[{targetId:target,connected:true,encrypted:true,hidSubscribed:true,inputState:'released',running:false}]});
  if(path==='/v1/capabilities'){
   if(state.capsFail)throw new Error('finite synthetic capabilities failure');
   return Response.json({...meta(),executionEnabled:true,maxEvents:128,maxRequestBytes:state.capsLimit,maxHoldMs:3000,maxSegmentMs:5000});
  }
  if(path.endsWith('/leases/claim')){lease={...meta(),targetId:target,leaseId:body.leaseId,inputState:'released',expiresAtDeviceMs:now+body.ttlMs};return Response.json(lease);}
  if(path.endsWith('/release')){
   if(state.releaseUnknown)return Response.json({...meta(),targetId:target,status:'unknown',leaseInvalidated:false,releaseSubmitted:false});
   lease=null;return Response.json({...meta(),targetId:target,status:'released',leaseInvalidated:true,releaseSubmitted:true});
  }
  if(path.endsWith('/segments')){
   if(body.bootId!==boot||body.targetId!==target||!lease||body.leaseId!==lease.leaseId||now>=lease.expiresAtDeviceMs)return Response.json({error:'fenced'},{status:409});
   return Response.json({...meta(),targetId:target,segmentId:body.segmentId,planId:body.planId,payloadHash:body.payloadHash,status:'hid_submitted',releaseSubmitted:true});
  }
  throw new Error('Unexpected finite server route: '+path);
 }});
 client.restoreCredentials({format:'iah-device-credential/1',baseUrl:'https://r7.invalid',boardId:'board-a',clientId:'client-a',token:'r7-finite-synthetic-token',publicKeyFingerprint:'a'.repeat(64),expectedFingerprint:'a'.repeat(64)});
 return {client,calls,state,advance:ms=>now+=ms,reboot:()=>{boot='boot-b';lease=null;},retarget:()=>{target='phone-b';lease=null;}};
}
async function warm(f){return f.client.getExecutionContext({writerId:'run-a',allowClaim:true,renewLease:false});}
async function segment(ctx){
 const wire={protocolVersion:1,boardId:ctx.boardId,bootId:ctx.bootId,clientId:ctx.clientId,targetId:ctx.targetId,leaseId:ctx.leaseId,segmentId:'r7-segment',planId:'r7-plan',segmentIndex:0,ttlMs:1000,events:[{atMs:0,kind:'keyboard',modifiers:0,usages:[]}]};
 wire.payloadHash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalSegmentJson(wire)))).toString('hex');return wire;
}
const counts=(f,path)=>f.calls.filter(call=>call.path===path).length;

test('adaptive cache retains a 750ms floor on fast responses and never exceeds five seconds on slow responses',async()=>{
 for(const [rtt,age,expectedReads] of [[1,751,1],[1100,5001,1]]){
  const f=board({rtt});await warm(f);await f.client.getBinding();await f.client.capabilities();
  const before=counts(f,'/v1/capabilities');f.advance(age);
  await f.client.getExecutionContext({writerId:'run-a',renewLease:false});
  assert.equal(counts(f,'/v1/capabilities')-before,expectedReads);
 }
});

test('explicit 1200ms metadata cache expires despite a measured 1100ms RTT',async()=>{
 const f=board({cacheMs:1200});await warm(f);await f.client.getBinding();await f.client.capabilities();
 const before=counts(f,'/v1/capabilities');f.advance(1201);
 await f.client.getExecutionContext({writerId:'run-a',renewLease:false});
 assert.equal(counts(f,'/v1/capabilities'),before+1);
});

test('explicit zero cache continues refreshing metadata after every elapsed request',async()=>{
 const f=board({cacheMs:0});await warm(f);
 const before=counts(f,'/v1/binding');await f.client.getExecutionContext({writerId:'run-a',renewLease:false});
 assert.equal(counts(f,'/v1/binding'),before+1);
});

test('high RTT cache never extends the independently checked writer lease expiry',async()=>{
 const f=board();const ctx=await warm(f),wire=await segment(ctx);
 f.advance(15001);const before=f.calls.filter(c=>c.path.endsWith('/segments')).length;
 await assert.rejects(f.client.submitSegment(wire),e=>e.code==='DEVICE_LEASE_EXPIRED');
 assert.equal(f.calls.filter(c=>c.path.endsWith('/segments')).length,before);
 assert.equal(f.client.leaseVerified,false);
});

test('explicit retargeting inside the adaptive cache revokes the original lease immediately',async()=>{
 const f=board(),ctx=await warm(f),wire=await segment(ctx);f.retarget();
 await f.client.getBinding();assert.equal(f.client.targetId,'phone-b');assert.equal(f.client.leaseId,null);
 await assert.rejects(f.client.submitSegment(wire),e=>e.code==='DEVICE_LEASE_EXPIRED');
 assert.equal(f.calls.filter(c=>c.path.endsWith('/segments')).length,0);
});

test('cached metadata cannot convert a server boot fence into successful input or release',async()=>{
 const f=board(),ctx=await warm(f),wire=await segment(ctx);
 // Refresh both so segment admission uses cached metadata after reboot.
 await f.client.getBinding();await f.client.capabilities();f.reboot();
 await assert.rejects(f.client.submitSegment(wire),e=>e.code==='DEVICE_CONFLICT'&&e.unknown===true);
 assert.equal(f.client.status().inputState,'unknown');
 await assert.rejects(f.client.release(ctx),e=>e.code==='DEVICE_REBOOTED');
 assert.equal(f.client.leaseId,null);assert.equal(f.client.status().inputState,'unknown');
});

test('failed first capability discovery blocks direct input even after RTT warmed by binding and clock',async()=>{
 const f=board();await f.client.identity();await f.client.getBinding();
 const lease=await f.client.claimLease({leaseId:'lease-a',writerId:'run-a'});
 const wire=await segment({...lease,boardId:'board-a',bootId:'boot-a',clientId:'client-a',targetId:'phone-a'});
 f.state.capsFail=true;
 await assert.rejects(f.client.submitSegment(wire),e=>e.code==='DEVICE_TLS_OR_NETWORK_ERROR');
 assert.equal(f.calls.filter(c=>c.path.endsWith('/segments')).length,0);
 f.state.capsFail=false;f.state.capsLimit=100;
 await assert.rejects(f.client.submitSegment(wire),e=>e.code==='DEVICE_REQUEST_TOO_LARGE');
 assert.equal(f.calls.filter(c=>c.path.endsWith('/segments')).length,0);
});

test('unknown release inside adaptive cache retires the writer lease and keeps input unknown',async()=>{
 const f=board(),ctx=await warm(f);f.state.releaseUnknown=true;
 await assert.rejects(f.client.release(ctx),e=>e.code==='DEVICE_RELEASE_UNKNOWN');
 assert.equal(f.client.leaseId,null);assert.equal(f.client.status().inputState,'unknown');
 assert.equal((await f.client.endRun({writerId:'run-a'})).status,'not_owned');
 assert.equal(f.calls.filter(c=>c.path.endsWith('/release')).length,1);
});
