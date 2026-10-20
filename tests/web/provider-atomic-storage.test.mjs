import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB,IDBKeyRange,IDBObjectStore} from 'fake-indexeddb';
import {openStore} from '../../apps/web/core/store.js';
globalThis.indexedDB=indexedDB;globalThis.IDBKeyRange=IDBKeyRange;
const plan={id:'plan-a',name:'ChatGPT',protocol:'codex',flow:'chatgpt-plan',clientId:'oaiapp_fixture',accountId:'plan-a',model:'',models:[],stream:true};
const credential={kind:'codex',tokens:{access_token:'synthetic-plan-access',refresh_token:'synthetic-refresh',id_token:'synthetic-id',flow:'chatgpt-plan',clientId:'oaiapp_fixture',identityVerified:true}};
async function fixture(t){const name='atomic-provider-'+crypto.randomUUID(),store=await openStore({name});t.after(()=>store.close());return {store,name};}
test('a model-less subscription and credentials persist together across database reopen',async t=>{
 const {store,name}=await fixture(t);await store.saveSettings({developerMode:true});
 const saved=await store.saveProvider(plan,credential);assert.equal(saved.providers.length,1);assert.equal(saved.providers[0].model,'');assert.equal(saved.activeProviderId,plan.id);assert.equal(saved.developerMode,true);assert.doesNotMatch(JSON.stringify(saved),/synthetic-/);
 store.close();const reopened=await openStore({name});t.after(()=>reopened.close());assert.deepEqual((await reopened.getSettings()).providers,[plan]);assert.deepEqual(await reopened.getLocalCredential('provider:'+plan.id),credential);
});
test('profile write failure rolls back credential replacement in the same transaction',async t=>{
 const {store}=await fixture(t);await store.saveProvider(plan,credential);const original=IDBObjectStore.prototype.put;
 const mock=t.mock.method(IDBObjectStore.prototype,'put',function(value,...args){if(this.name==='settings'&&value.id==='settings')throw new DOMException('Synthetic write failure','QuotaExceededError');return original.call(this,value,...args);});
 await assert.rejects(store.saveProvider({...plan,name:'Must not survive'},{...credential,tokens:{...credential.tokens,access_token:'must-not-survive'}}),{name:'QuotaExceededError'});mock.mock.restore();
 assert.deepEqual((await store.getSettings()).providers,[plan]);assert.deepEqual(await store.getLocalCredential('provider:'+plan.id),credential);
});
test('concurrent saves merge the current list instead of replacing an older snapshot',async t=>{
 const {store,name}=await fixture(t),other=await openStore({name});t.after(()=>other.close());
 await Promise.all([store.saveProvider(plan,credential),other.saveProvider({...plan,id:'plan-b',accountId:'plan-b',name:'Second'},credential)]);
 assert.deepEqual((await store.getSettings()).providers.map(p=>p.id).sort(),['plan-a','plan-b']);
 await other.saveProvider({...plan,name:'Edited'},null);assert.deepEqual(await store.getLocalCredential('provider:'+plan.id),credential);assert.equal((await store.getSettings()).providers.length,2);
});
test('late model discovery never removes another account or creates a deleted draft',async t=>{
 const {store}=await fixture(t);await store.saveProvider(plan,credential);
 await Promise.all([store.saveProvider({...plan,id:'plan-b',accountId:'plan-b'},credential),store.updateProviderModels(plan.id,[{id:'model-x',name:'X'}])]);
 let saved=await store.getSettings();assert.equal(saved.providers.length,2);assert.equal(saved.providers.find(p=>p.id===plan.id).model,'model-x');
 await store.removeProvider(plan.id);await store.updateProviderModels(plan.id,[{id:'late'}]);saved=await store.getSettings();assert.deepEqual(saved.providers.map(p=>p.id),['plan-b']);assert.equal(await store.getLocalCredential('provider:'+plan.id),null);assert.equal(saved.activeProviderId,'plan-b');
 await store.updateProviderModels('unsaved-draft',[{id:'another'}]);assert.equal((await store.getSettings()).providers.length,1);
});
test('explicit model choice and other settings survive catalog updates and deletion',async t=>{
 const {store}=await fixture(t);await store.saveProvider({...plan,model:'chosen',reasoningEffort:'high'},credential);await store.saveSettings({language:'ja',credentialVault:{[plan.id]:{old:true},keep:{old:true}}});
 await store.updateProviderModels(plan.id,[{id:'new-default'}]);const saved=await store.getSettings();assert.equal(saved.providers[0].model,'chosen');assert.equal(saved.providers[0].reasoningEffort,'high');
 const removed=await store.removeProvider(plan.id);assert.equal(removed.language,'ja');assert.deepEqual(removed.credentialVault,{keep:{old:true}});assert.equal(removed.activeProviderId,'');
});
test('cancelled saves leave neither a profile nor a credential',async t=>{
 const {store}=await fixture(t),controller=new AbortController();controller.abort();
 await assert.rejects(store.saveProvider(plan,credential,{signal:controller.signal}),{name:'AbortError'});assert.deepEqual((await store.getSettings()).providers,[]);assert.equal(await store.getLocalCredential('provider:'+plan.id),null);
});
test('aborting after the credential write is queued rolls back both new and existing providers',async t=>{
 const {store}=await fixture(t);await store.saveProvider(plan,credential);
 for(const id of ['new-plan',plan.id]){
  const controller=new AbortController(),original=IDBObjectStore.prototype.put;let queued=false;
  const mock=t.mock.method(IDBObjectStore.prototype,'put',function(value,...args){
   const request=original.call(this,value,...args);
   if(this.name==='settings'&&value.id==='local-credential:provider:'+id){queued=true;controller.abort();}
   return request;
  });
  try{await assert.rejects(store.saveProvider({...plan,id,name:'Must roll back'},{...credential,tokens:{...credential.tokens,access_token:'cancelled-synthetic-token'}},{signal:controller.signal}),{name:'AbortError'});}
  finally{mock.mock.restore();}
  assert.equal(queued,true);assert.deepEqual((await store.getSettings()).providers,[plan]);
  assert.deepEqual(await store.getLocalCredential('provider:'+plan.id),credential);
  assert.equal(await store.getLocalCredential('provider:new-plan'),null);
 }
});
