import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory,IDBKeyRange} from 'fake-indexeddb';
import {openStore} from '../../apps/web/core/store.js';
import {unsealCredentials} from '../../apps/web/core/auth.js';
import {sealCredentials} from './helpers/legacy-credentials.mjs';
import {inspectProviderCredential,resolveProviderCredential,restoreProviderCredentials,saveProviderCredential,setCredential,getCredential,clearCredentials} from '../../apps/web/core/credentials.js';
import {CREDENTIAL_STATE_MESSAGES} from '../../apps/web/locales/credential-state.js';
const profile={id:'own-api',accountId:'subscription-alias',protocol:'openai',baseUrl:'https://api.deepseek.com'};
const setup=()=>{globalThis.indexedDB=new IDBFactory();globalThis.IDBKeyRange=IDBKeyRange;clearCredentials();};

test('a profile card without a durable key differs from temporary memory, encrypted legacy and saved credentials across IndexedDB reopen',async()=>{
 setup();const name='credential-states-'+crypto.randomUUID();let store=await openStore({name});
 await store.saveSettings({providers:[profile],activeProviderId:profile.id});
 assert.equal((await inspectProviderCredential(store,profile)).status,'missing');
 setCredential(profile.id,'synthetic-page-only');
 assert.deepEqual(await inspectProviderCredential(store,profile),{status:'temporary',ready:true,messageKey:'providerCredential.temporary'});
 store.close();clearCredentials();store=await openStore({name});
 assert.equal((await inspectProviderCredential(store,profile)).status,'missing');
 const encrypted=await sealCredentials({apiKey:'synthetic-old-key'},'synthetic-owner-passphrase');
 await store.saveSettings({credentialVault:{[profile.id]:encrypted}});
 assert.equal((await inspectProviderCredential(store,profile)).status,'locked');
 // Only an owner-supplied passphrase can recover this real historical format.
 const unlocked=await unsealCredentials(encrypted,'synthetic-owner-passphrase');
 await saveProviderCredential(store,profile.id,{kind:'api',apiKey:unlocked.apiKey});
 store.close();clearCredentials();store=await openStore({name});
 assert.equal((await inspectProviderCredential(store,profile)).status,'saved');
 assert.equal(await resolveProviderCredential(store,profile),'synthetic-old-key');
 assert.deepEqual((await store.getSettings()).credentialVault[profile.id],encrypted);
 assert.ok(!JSON.stringify(await inspectProviderCredential(store,profile)).includes('synthetic-old-key'));
 store.close();clearCredentials();
});

test('credential inspection never guesses ownership from aliases, identical endpoints, or subscription records',async()=>{
 setup();const store=await openStore({memory:true});
 const other={...profile,id:profile.accountId},codex={id:'subscription-owner',protocol:'codex'};
 await store.saveSettings({providers:[profile,other,codex]});
 await saveProviderCredential(store,other.id,{kind:'api',apiKey:'synthetic-neighbor-key'});
 await saveProviderCredential(store,profile.id,{kind:'codex',tokens:{access_token:'synthetic-subscription-token'}});
 await saveProviderCredential(store,codex.id,{kind:'api',apiKey:'synthetic-api-key'});
 assert.equal((await inspectProviderCredential(store,profile)).status,'missing');
 assert.equal((await inspectProviderCredential(store,codex)).status,'missing');
 await assert.rejects(resolveProviderCredential(store,profile),{code:'PROVIDER_CREDENTIAL_MISSING'});
 let registered=0;await restoreProviderCredentials(store,[profile,codex],{registerAccount:()=>registered++});
 assert.equal(registered,0);assert.equal(getCredential(profile.id),'');
 assert.equal((await store.getLocalCredential('provider:'+other.id)).apiKey,'synthetic-neighbor-key');
 store.close();clearCredentials();
});

test('read-only compatibility checks preserve a newly re-added key and original encrypted record',async()=>{
 setup();const store=await openStore({memory:true}),vault={version:1,data:[1,2,3]};
 await store.saveSettings({credentialVault:{[profile.id]:vault}});
 await saveProviderCredential(store,profile.id,{kind:'api',apiKey:'synthetic-readded-key'});
 const before=structuredClone(await store.getLocalCredential('provider:'+profile.id));
 for(let index=0;index<3;index++){
  assert.equal((await inspectProviderCredential(store,profile)).status,'saved');
  await restoreProviderCredentials(store,[profile]);
 }
 assert.deepEqual(await store.getLocalCredential('provider:'+profile.id),before);
 assert.deepEqual((await store.getSettings()).credentialVault[profile.id],vault);
 assert.equal(getCredential(profile.id),'synthetic-readded-key');store.close();clearCredentials();
});

test('malformed persisted values cannot become Bearer [object Object] on startup',async()=>{
 setup();const store=await openStore({memory:true});
 await store.saveLocalCredential('provider:'+profile.id,{kind:'api',apiKey:{token:'synthetic-invalid'}});
 await restoreProviderCredentials(store,[profile]);assert.equal(getCredential(profile.id),'');
 assert.equal((await inspectProviderCredential(store,profile)).status,'missing');
 await assert.rejects(resolveProviderCredential(store,profile),{code:'PROVIDER_CREDENTIAL_MISSING'});
 setCredential(profile.id,'synthetic-valid-page-key');
 assert.equal((await inspectProviderCredential(store,profile)).status,'temporary');
 assert.equal(await resolveProviderCredential(store,profile),'synthetic-valid-page-key');
 store.close();clearCredentials();
});

test('storage failures remain distinct from missing credentials and do not delete usable page memory',async()=>{
 clearCredentials();setCredential(profile.id,'synthetic-current-key');let writes=0;
 const store={async getLocalCredential(){throw new DOMException('Suspended database','InvalidStateError');},async saveLocalCredential(){writes++;}};
 assert.deepEqual(await inspectProviderCredential(store,profile),{status:'unavailable',ready:false,messageKey:'providerCredential.unavailable'});
 assert.equal(getCredential(profile.id),'synthetic-current-key');assert.equal(writes,0);clearCredentials();
});

test('all credential storage states have localized user-facing labels in eight languages',()=>{
 assert.equal(Object.keys(CREDENTIAL_STATE_MESSAGES).length,8);
 for(const locale of Object.values(CREDENTIAL_STATE_MESSAGES))for(const state of ['saved','temporary','locked','missing','unavailable'])assert.ok(locale['providerCredential.'+state]);
 assert.match(CREDENTIAL_STATE_MESSAGES['zh-Hans']['providerCredential.temporary'],/仅当前页面/);
});
