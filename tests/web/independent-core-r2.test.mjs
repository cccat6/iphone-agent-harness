import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from '../../apps/web/core/store.js';
import {createHarness} from '../../apps/web/core/harness.js';
import {DeviceClient} from '../../apps/web/core/device.js';
import {canonicalSegmentJson} from '../../apps/web/core/plan.js';

const provider={id:'synthetic-account',protocol:'openai',baseUrl:'https://model.invalid/v1',model:'synthetic-model',stream:false};
const fingerprint='a'.repeat(64);
async function setup(mode){const store=await openStore({memory:true});await store.saveSettings({providers:[provider],activeProviderId:provider.id});return {store,session:await store.createSession({mode})};}
function restoredClient(fetchImpl){const client=new DeviceClient({baseUrl:'https://board.invalid',fetchImpl,now:()=>1000});client.restoreCredentials({format:'iah-device-credential/1',baseUrl:'https://board.invalid',boardId:'board',clientId:'client',token:'synthetic-device-token-only',publicKeyFingerprint:fingerprint,expectedFingerprint:fingerprint});return client;}

test('independent R2: pure Chat remains usable when the configured phone bridge is offline',async()=>{
 const {store,session}=await setup('chat');let modelCalls=0;
 const client=restoredClient(async()=>{throw new Error('synthetic-offline-board');});
 // This is the app's deviceContext wiring: selecting a bridge makes every
 // context lookup use its live DeviceClient, regardless of the requested mode.
 const harness=createHarness({store,getContext:meta=>client.getExecutionContext({writerId:meta.runId,allowClaim:meta.allowClaim,signal:meta.signal}),invoke:async()=>{modelCalls++;return {text:'Synthetic chat answer',toolCalls:[]};}});
 await assert.doesNotReject(harness.run({sessionId:session.id,text:'A text-only question with no phone operation.'}));
 assert.equal(modelCalls,1);
});

test('independent R2: direct DeviceClient submission obtains or conservatively enforces the 8KB firmware limit',async()=>{
 const requests=[],meta={boardId:'board',bootId:'boot',clientId:'client'};
 const client=restoredClient(async(url,options)=>{
  const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;requests.push({path,body});
  if(path==='/v1/identity')return Response.json({...meta,publicKeyFingerprint:fingerprint});
  if(path==='/v1/binding')return Response.json({...meta,targetId:'phone',bindingVerified:true,targets:[{targetId:'phone',connected:true,encrypted:true,hidSubscribed:true,inputState:'released',running:false}]});
  if(path==='/v1/clock')return Response.json({...meta,deviceTimeMs:1000});
  if(path==='/v1/capabilities')return Response.json({...meta,executionEnabled:true,maxRequestBytes:8192,maxEvents:256,operations:['pointer_sequence']});
  if(path.endsWith('/leases/claim'))return Response.json({...meta,targetId:'phone',leaseId:body.leaseId,inputState:'released',expiresAtDeviceMs:16000});
  if(path.endsWith('/segments'))return Response.json({...meta,targetId:'phone',segmentId:body.segmentId,planId:body.planId,payloadHash:body.payloadHash,status:'hid_submitted',releaseSubmitted:true});
  throw new Error('Unexpected synthetic route');
 });
 // Exercise the public claim + submit API without getExecutionContext(), which
 // is the only ordinary path that would have filled the capabilities cache.
 const lease=await client.claimLease({writerId:'synthetic-writer',leaseId:'synthetic-lease'});
 const segment={protocolVersion:1,...meta,targetId:'phone',leaseId:lease.leaseId,segmentId:'synthetic-segment',planId:'synthetic-plan',segmentIndex:0,ttlMs:3000,events:Array.from({length:200},(_,i)=>({atMs:i*10,kind:'pointer',buttons:i===0||i===199?0:1,x:5000,y:5000}))};
 segment.payloadHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalSegmentJson(segment))))].map(v=>v.toString(16).padStart(2,'0')).join('');
 assert.ok(new TextEncoder().encode(JSON.stringify(segment)).length>8192);
 await assert.rejects(client.submitSegment(segment),e=>e.code==='DEVICE_REQUEST_TOO_LARGE');
 assert.equal(requests.filter(r=>r.path.endsWith('/segments')).length,0);
});
