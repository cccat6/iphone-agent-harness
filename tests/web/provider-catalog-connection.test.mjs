import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB,IDBKeyRange} from 'fake-indexeddb';
import {openStore} from '../../apps/web/core/store.js';
globalThis.indexedDB=indexedDB;globalThis.IDBKeyRange=IDBKeyRange;
const profile={id:'profile',protocol:'codex',flow:'chatgpt-plan',clientId:'oaiapp-a',baseUrl:'',subscriptionRelayUrl:'https://relay-a.invalid/api/openai',name:'Original',model:'chosen',models:[{id:'previous'}]};
for(const memory of [true,false]){
 const mode=memory?'memory':'IndexedDB';
 async function fixture(t){const name='provider-catalog-'+crypto.randomUUID(),store=await openStore({memory,name});t.after(()=>store.close());return {store,name};}
 test(mode+': matching connection updates catalog and keeps the latest profile metadata',async t=>{
  const {store}=await fixture(t);await store.saveProvider(profile,null);await store.saveProvider({...profile,name:'Renamed in another view',model:'new-choice'},null);
  const result=await store.updateProviderModels(profile.id,[{id:'fresh'}],{expectedConnection:profile});assert.equal(result.providers[0].name,'Renamed in another view');assert.equal(result.providers[0].model,'new-choice');assert.deepEqual(result.providers[0].models,[{id:'fresh'}]);
 });
 test(mode+': any changed connection field rejects a late catalog atomically without losing another account',async t=>{
  const {store,name}=await fixture(t),other=memory?store:await openStore({name});if(other!==store)t.after(()=>other.close());
  for(const field of ['protocol','baseUrl','flow','clientId','subscriptionRelayUrl']){
   await store.saveProvider(profile,null);const checked=(await store.getSettings()).providers[0];
   const changed={...profile,[field]:field==='protocol'?'openai':field==='flow'?'codex':field==='baseUrl'?'https://api-b.invalid/v1':field==='clientId'?'oaiapp-b':'https://relay-b.invalid/api/openai'};
   await other.saveProvider(changed,null);await other.saveProvider({...profile,id:'other',name:'Keep me'},null);
   const before=await store.getSettings(),result=await store.updateProviderModels(profile.id,[{id:'must-not-save'}],{expectedConnection:checked});assert.deepEqual(result,before,field);assert.deepEqual(await store.getSettings(),before,field);
  }
 });
 test(mode+': optional guard preserves old API, handles default empty fields, and never revives removed profiles',async t=>{
  const {store}=await fixture(t),minimal={id:'api',protocol:'openai',baseUrl:'https://api.invalid/v1',model:''};await store.saveProvider(minimal,null);
  let saved=await store.updateProviderModels(minimal.id,[{id:'first'}],{expectedConnection:{...minimal,flow:'',clientId:'',subscriptionRelayUrl:''}});assert.equal(saved.providers[0].model,'first');
  saved=await store.updateProviderModels(minimal.id,[{id:'unguarded'}]);assert.equal(saved.providers[0].models[0].id,'unguarded');assert.equal(saved.providers[0].model,'first');
  await store.removeProvider(minimal.id);saved=await store.updateProviderModels(minimal.id,[{id:'late'}],{expectedConnection:minimal});assert.deepEqual(saved.providers,[]);
 });
 test(mode+': connection expectation is captured when the request is queued',async t=>{
  const {store}=await fixture(t);await store.saveProvider(profile,null);const expected=structuredClone(profile),updating=store.updateProviderModels(profile.id,[{id:'accepted'}],{expectedConnection:expected});expected.clientId='mutated-after-call';const result=await updating;assert.equal(result.providers[0].models[0].id,'accepted');
 });
}
test('guarded catalog remains unchanged after an IndexedDB reopen',async t=>{
 const name='provider-catalog-reopen-'+crypto.randomUUID();let store=await openStore({name});await store.saveProvider(profile,null);await store.saveProvider({...profile,subscriptionRelayUrl:'https://changed.invalid/api/openai'},null);await store.updateProviderModels(profile.id,[{id:'stale'}],{expectedConnection:profile});store.close();store=await openStore({name});t.after(()=>store.close());assert.deepEqual((await store.getSettings()).providers[0].models,[{id:'previous'}]);
});
