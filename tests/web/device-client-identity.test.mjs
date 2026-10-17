import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from '../../apps/web/core/store.js';
import {DeviceClient} from '../../apps/web/core/device.js';
const endpoint='https://harness-one.local',fingerprint='a'.repeat(64);
test('owner re-enrollment reuses a persisted public client ID instead of filling eight firmware slots',async()=>{
 const store=await openStore({memory:true}),grants=new Map(),sent=[];
 const fetchImpl=async(url,options={})=>{const path=new URL(url).pathname;if(path==='/v1/identity')return Response.json({protocolVersion:1,boardId:'board-one',bootId:'boot-one',hostname:'harness-one.local',publicKeyFingerprint:fingerprint});const body=JSON.parse(options.body);assert.equal(path,'/v1/pair');if(!grants.has(body.clientId)&&grants.size===8)return Response.json({error:'client_capacity'},{status:409});grants.set(body.clientId,'t'.repeat(32));sent.push(body.clientId);return Response.json({clientId:body.clientId,token:'t'.repeat(32),boardId:'board-one',bootId:'boot-one',hostname:'harness-one.local',publicKeyFingerprint:fingerprint});};
 for(let page=0;page<10;page++){const clientId=await store.ensureDeviceClientId(endpoint),client=new DeviceClient({baseUrl:endpoint,expectedFingerprint:fingerprint,fetchImpl});await client.pair({clientId,setupPassword:'synthetic-owner'});assert.equal(client.paired,true);assert.equal(client.bindingVerified,false);client.clearCredentials();}
 assert.equal(grants.size,1);assert.equal(new Set(sent).size,1);const settings=await store.getSettings();assert.deepEqual(Object.keys(settings),['deviceClientIds']);assert.equal(JSON.stringify(settings).includes('synthetic-owner'),false);assert.equal(JSON.stringify(settings).includes('t'.repeat(32)),false);
});
test('atomic identity creation converges across concurrent calls and keeps different boards separate',async()=>{
 const store=await openStore({memory:true});await store.saveSettings({providers:[{id:'qa',model:'qa-model'}],locale:'en'});
 const ids=await Promise.all(Array.from({length:4},()=>store.ensureDeviceClientId(endpoint)));assert.equal(new Set(ids).size,1);assert.notEqual(await store.ensureDeviceClientId('https://harness-two.local'),ids[0]);
 assert.equal(await store.ensureDeviceClientId(endpoint+'/',{preferredId:'other-id'}),ids[0]);assert.equal((await store.getSettings()).providers[0].id,'qa');
});
test('migration can seed a valid restored public ID but malformed settings and endpoints do not authorize anything',async()=>{
 const store=await openStore({memory:true});assert.equal(await store.ensureDeviceClientId(endpoint,{preferredId:'restored-client'}),'restored-client');
 for(const bad of ['http://harness-one.local','https://user:pass@harness-one.local','https://harness-one.local/other','https://harness-one.local/?key=bad','https://harness-one.local/#bad'])await assert.rejects(store.ensureDeviceClientId(bad));
 await assert.rejects(store.ensureDeviceClientId('https://harness-two.local',{preferredId:'bad id'}));await store.saveSettings({deviceClientIds:{[endpoint]:'bad id'}});assert.match(await store.ensureDeviceClientId(endpoint),/^[a-f0-9-]{36}$/);
});
