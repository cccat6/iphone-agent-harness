import test from 'node:test';
import assert from 'node:assert/strict';
import {DeviceClient} from '../../apps/web/core/device.js';
import {canonicalSegmentJson} from '../../apps/web/core/plan.js';
const baseUrl='http://igent.local',fingerprint='a'.repeat(64),token='fixture-device-token-not-a-real-secret';
async function fixture({advertise=true,bound='phone-a'}={}){
 const state={bound,rejection:null,bindingReply:null,bindDelay:null},calls=[];
 const identity=()=>({boardId:'board',bootId:'boot',hostname:'igent.local',publicKeyFingerprint:fingerprint,...(advertise?{targetBinding:'explicit-rebind-v1'}:{})});
 const meta=()=>({...identity(),clientId:'browser',targetId:state.bound});
 const snapshot=()=>({...meta(),bindingVerified:!!state.bound,targets:['phone-a','phone-b'].map(targetId=>({targetId,connected:true,encrypted:true,hidSubscribed:true,inputState:'released',running:false}))});
 const fetchImpl=async(url,options={})=>{
  const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;calls.push({path,body,token:options.headers.Authorization});
  if(path==='/v1/identity')return Response.json(identity());
  if(path==='/v1/binding'){if(state.bindingReply){const pending=state.bindingReply;state.bindingReply=null;return pending;}return Response.json(snapshot());}
  if(path==='/v1/clock')return Response.json({...identity(),deviceTimeMs:1000});
  if(path==='/v1/capabilities')return Response.json({...identity(),executionEnabled:true,maxEvents:128,maxRequestBytes:8192,maxHoldMs:3000,maxSegmentMs:5000});
  if(path.endsWith('/bind')){if(state.bindDelay)await state.bindDelay;if(state.rejection)return Response.json({error:state.rejection.error},{status:state.rejection.status});state.bound=path.split('/')[3];return Response.json({...meta(),bindingVerified:true,inputTestVerified:false});}
  if(path.endsWith('/challenge/start'))return Response.json({targetId:state.bound,challengeId:'challenge-a',length:8,expiresInMs:30000,status:'typing'},{status:202});
  if(path.endsWith('/leases/claim'))return Response.json({...meta(),leaseId:body.leaseId,expiresAtDeviceMs:16000,inputState:'released'});
  if(path.endsWith('/release'))return Response.json({...meta(),status:'released',leaseInvalidated:true,releaseSubmitted:true});
  if(path.endsWith('/segments'))return Response.json({...meta(),segmentId:body.segmentId,planId:body.planId,payloadHash:body.payloadHash,status:'hid_submitted',releaseSubmitted:true},{status:202});
  throw Error('Unexpected fixture route '+path);
 };
 const client=new DeviceClient({baseUrl,fetchImpl,now:()=>1000});client.restoreCredentials({format:'iah-device-credential/1',baseUrl,clientId:'browser',token,boardId:'board',hostname:'igent.local',publicKeyFingerprint:fingerprint,expectedFingerprint:fingerprint});
 await client.identity();await client.getBinding();return {client,state,calls,snapshot};
}
async function segment(client,leaseId){const value={protocolVersion:1,boardId:'board',bootId:'boot',clientId:'browser',targetId:client.targetId,leaseId,segmentId:'same-local-segment-id',planId:'plan',segmentIndex:0,ttlMs:1500,events:[{atMs:0,kind:'consumer',usage:64},{atMs:100,kind:'consumer',usage:0}]};value.payloadHash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalSegmentJson(value)))).toString('hex');return value;}
test('explicit target change keeps browser credentials and clears previous target challenge and segment cache',async()=>{
 const {client,calls}=await fixture(),credentials=client.exportCredentials();
 const a=await client.claimLease({leaseId:'lease-a',writerId:'run-a'});await client.submitSegment(await segment(client,a.leaseId));await client.endRun({writerId:'run-a'});await client.startChallenge('phone-a');
 const before=calls.length;const bound=await client.bindTarget('phone-b');assert.equal(bound.targetId,'phone-b');assert.equal(client.bindingVerified,true);assert.equal(client.leaseId,null);assert.equal(client.status().inputState,'released');assert.deepEqual(client.exportCredentials(),credentials);
 assert.deepEqual(calls.slice(before).map(value=>value.path),['/v1/binding','/v1/targets/phone-b/bind']);
 await assert.rejects(client.confirmChallenge('phone-a',{challengeId:'challenge-a',observedNonce:'12345678'}),{code:'DEVICE_CHALLENGE_INVALID'});
 const b=await client.claimLease({leaseId:'lease-b',writerId:'run-b'});await client.submitSegment(await segment(client,b.leaseId));assert.equal(calls.filter(value=>value.path.endsWith('/segments')).length,2);assert.ok(calls.filter(value=>value.path.endsWith('/bind')).every(value=>value.token==='Bearer '+token));
});
test('busy or persistence failure preserves the original target and credentials',async()=>{
 for(const rejection of [{status:409,error:'target_busy'},{status:503,error:'binding_persistence_failed'},{status:403,error:'wrong_target'}]){
  const {client,state}=await fixture(),credentials=client.exportCredentials();state.rejection=rejection;
  await assert.rejects(client.bindTarget('phone-b'),value=>value.status===rejection.status&&value.serverCode===rejection.error);
  assert.equal(client.targetId,'phone-a');assert.equal(client.bindingVerified,true);assert.equal(client.identityVerified,true);assert.deepEqual(client.exportCredentials(),credentials);
 }
});
test('active lease and in-flight binding prevent a competing target change or lease claim',async()=>{
 const {client,state,calls}=await fixture();await client.claimLease({leaseId:'lease-a',writerId:'run-a'});
 await assert.rejects(client.bindTarget('phone-b'),{code:'DEVICE_WRITER_BUSY'});assert.equal(calls.some(value=>value.path.endsWith('/bind')),false);await client.endRun({writerId:'run-a'});
 let finish;state.bindDelay=new Promise(resolve=>finish=resolve);const switching=client.bindTarget('phone-b');for(let i=0;i<30;i++)await Promise.resolve();
 await assert.rejects(client.claimLease({leaseId:'lease-b',writerId:'run-b'}),{code:'DEVICE_WRITER_BUSY'});await assert.rejects(client.bindTarget('phone-a'),{code:'DEVICE_WRITER_BUSY'});finish();await switching;assert.equal(client.targetId,'phone-b');
});
test('a delayed pre-switch binding read cannot restore the former phone',async()=>{
 const {client,state,snapshot}=await fixture();const previous=snapshot();let reply;state.bindingReply=new Promise(resolve=>reply=resolve);const stale=client.getBinding();
 await client.bindTarget('phone-b');reply(Response.json(previous));await assert.rejects(stale,{code:'DEVICE_STATE_CHANGED'});assert.equal(client.targetId,'phone-b');
});
test('old firmware rebind and old initial-bind denial request an update without dropping credentials',async()=>{
 const old=await fixture({advertise:false}),credentials=old.client.exportCredentials();await assert.rejects(old.client.bindTarget('phone-b'),{code:'DEVICE_SETUP_UPGRADE_REQUIRED'});assert.equal(old.calls.some(value=>value.path.endsWith('/bind')),false);assert.equal(old.client.targetId,'phone-a');assert.deepEqual(old.client.exportCredentials(),credentials);
 const initial=await fixture({advertise:false,bound:null});initial.state.rejection={status:403,error:'wrong_target'};await assert.rejects(initial.client.bindTarget('phone-a'),{code:'DEVICE_SETUP_UPGRADE_REQUIRED'});assert.equal(initial.client.identityVerified,true);assert.equal(initial.client.clientId,'browser');
 const denied=await fixture();denied.state.rejection={status:403,error:'origin_not_allowed'};await assert.rejects(denied.client.bindTarget('phone-b'),{code:'DEVICE_ACCESS_DENIED'});assert.equal(denied.client.exportCredentials().token,token);
});
