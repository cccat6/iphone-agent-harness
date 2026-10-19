import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {indexedDB,IDBKeyRange} from 'fake-indexeddb';
import {openStore} from '../../apps/web/core/store.js';
import {setCredential,getCredential,clearCredentials,saveProviderCredential,restoreProviderCredentials,resolveProviderCredential} from '../../apps/web/core/credentials.js';
import {createHarness} from '../../apps/web/core/harness.js';
import {callModel} from '../../apps/web/core/providers.js';
import {readProviderFailure} from '../../apps/web/core/provider-errors.js';
import {ERROR_CATALOG} from '../../apps/web/core/error-catalog.js';
import {localizeError,setLocale} from '../../apps/web/i18n.js';
const profile={id:'saved-api',accountId:'stale-subscription-id',protocol:'openai',baseUrl:'https://gateway.invalid/v1',model:'chosen',stream:false};
const syntheticKey='synthetic-retained-key';

test('a reopened API profile uses its own saved key, never stale subscription accountId, in actual inference headers',async()=>{
 globalThis.indexedDB=indexedDB;globalThis.IDBKeyRange=IDBKeyRange;clearCredentials();
 const name='credential-recovery-'+crypto.randomUUID();let store=await openStore({name});
 await store.saveSettings({providers:[profile],activeProviderId:profile.id});await saveProviderCredential(store,profile.id,{kind:'api',apiKey:syntheticKey});
 const session=await store.createSession({mode:'chat'});store.close();clearCredentials();store=await openStore({name});
 // Deliberately do not run startup restoration. A resumed run recovers its own
 // saved record even if an earlier startup restoration was interrupted.
 setCredential(profile.accountId,'synthetic-wrong-account-key');let requests=0;
 const harness=createHarness({store,invoke:request=>callModel({...request,fetchImpl:async(url,options)=>{
   requests++;assert.equal(url,'https://gateway.invalid/v1/chat/completions');assert.equal(options.headers.authorization,'Bearer '+syntheticKey);
   return Response.json({choices:[{finish_reason:'stop',message:{content:'ok'}}]});
 }})});
 await harness.run({sessionId:session.id,text:'hello'});assert.equal(requests,1);assert.equal(getCredential(profile.id),syntheticKey);
 const settings=JSON.stringify(await store.getSettings()),exported=JSON.stringify(await store.exportSession(session.id));assert.ok(!settings.includes(syntheticKey));assert.ok(!exported.includes(syntheticKey));
 store.close();clearCredentials();
});

test('startup restoration and lazy run recovery select the same API key after a real IndexedDB reopen',async()=>{
 globalThis.indexedDB=indexedDB;globalThis.IDBKeyRange=IDBKeyRange;const name='credential-startup-'+crypto.randomUUID();let store=await openStore({name});
 await saveProviderCredential(store,profile.id,{kind:'api',apiKey:syntheticKey});store.close();clearCredentials();store=await openStore({name});
 await restoreProviderCredentials(store,[profile]);assert.equal(getCredential(profile.id),syntheticKey);assert.equal(await resolveProviderCredential(store,profile),syntheticKey);store.close();clearCredentials();
});

test('old encrypted records remain intact and fail locally before even an injected request can run',async()=>{
 clearCredentials();const store=await openStore({memory:true}),vault={version:1,data:'synthetic-unchanged-cipher'};
 await store.saveSettings({providers:[profile],activeProviderId:profile.id,credentialVault:{[profile.id]:vault}});const session=await store.createSession({mode:'chat'});let called=false;
 const harness=createHarness({store,invoke:async()=>{called=true;throw new Error('should not request');}});
 await assert.rejects(harness.run({sessionId:session.id,text:'hello'}),error=>error.cause?.code==='PROVIDER_CREDENTIAL_LOCKED');assert.equal(called,false);
 assert.deepEqual((await store.getSettings()).credentialVault[profile.id],vault);assert.equal((await store.getMessages(session.id)).length,0);store.close();
});

test('a real Harness request without a saved key fails before network and does not present a misleading remote 401',async()=>{
 clearCredentials();const store=await openStore({memory:true});await store.saveSettings({providers:[{...profile,baseUrl:'https://api.deepseek.com',model:'deepseek-flash'}],activeProviderId:profile.id});const session=await store.createSession({mode:'chat'});
 const harness=createHarness({store});await assert.rejects(harness.run({sessionId:session.id,text:'hello'}),error=>error.cause?.code==='PROVIDER_CREDENTIAL_MISSING');assert.equal((await store.getMessages(session.id)).length,0);store.close();
});

test('legacy keys already unlocked in page memory survive the resolver without changing old vault records',async()=>{
 const store=await openStore({memory:true});setCredential(profile.id,syntheticKey);const vault={data:'unchanged'};await store.saveSettings({credentialVault:{[profile.id]:vault}});
 assert.equal(await resolveProviderCredential(store,profile),syntheticKey);assert.deepEqual((await store.getSettings()).credentialVault[profile.id],vault);store.close();clearCredentials();
});

test('saving an existing API with a blank secret migrates its unlocked page key to browser storage without losing its model or reasoning setting',async()=>{
 globalThis.indexedDB=indexedDB;globalThis.IDBKeyRange=IDBKeyRange;clearCredentials();
 const name='blank-save-migration-'+crypto.randomUUID();let store=await openStore({name});const existing={...profile,reasoningEffort:'high'},vault={version:1,data:'retained-old-encrypted-record'};
 await store.saveSettings({providers:[existing],activeProviderId:existing.id,credentialVault:{[existing.id]:vault}});
 setCredential(existing.id,syntheticKey);assert.equal(await store.getLocalCredential('provider:'+existing.id),null);
 const app=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8'),start=app.indexOf("$('#provider-form').onsubmit=guard("),end=app.indexOf('\n  const header=',start);assert.ok(start>=0&&end>start);
 const fields=new Map([['name','Renamed API'],['protocol','openai'],['baseUrl',existing.baseUrl],['model',existing.model],['secret',''],['stream','on']]);
 const button={disabled:false},form={elements:{secret:{value:''}},querySelector:()=>button},state={store,settings:await store.getSettings(),providerEdit:existing.id,providerModels:[]};let active=true;
 const sandbox=vm.createContext({state,provider:existing,$:()=>form,guard:fn=>fn,FormData:class{get(k){return fields.get(k);}has(k){return fields.has(k);}},shortId:()=>{throw new Error('existing ID must be retained');},normalizeProviderEndpoint:x=>x,getCodexAccount:()=>null,saveProviderCredential,removeProviderCredential:()=>{throw new Error('must preserve record');},getCredential,profileModels:p=>[{id:p.model}],providers:()=>state.settings.providers,renderModelOptions(){},async showSettings(){active=false;},toast(){},t:k=>k,editorActive:()=>active,editorToken:'existing-editor',editorForm:form});
 vm.runInContext(app.slice(start,end),sandbox);await form.onsubmit({preventDefault(){},target:form});
 assert.equal(state.settings.providers.length,1);assert.equal(state.settings.providers[0].id,existing.id);assert.equal(state.settings.providers[0].model,existing.model);assert.equal(state.settings.providers[0].reasoningEffort,'high');assert.equal(state.settings.providers[0].name,'Renamed API');
 assert.equal((await store.getLocalCredential('provider:'+existing.id)).apiKey,syntheticKey);assert.deepEqual((await store.getSettings()).credentialVault[existing.id],vault);
 store.close();clearCredentials();store=await openStore({name});assert.equal(await resolveProviderCredential(store,existing),syntheticKey);assert.ok(!JSON.stringify(await store.getSettings()).includes(syntheticKey));store.close();clearCredentials();
});

test('authentication, billing, permissions and other provider failures retain separate bounded diagnostics in all locales',async()=>{
 for(const [status,code]of [[401,'PROVIDER_AUTH_REJECTED'],[402,'PROVIDER_PAYMENT_REQUIRED'],[403,'PROVIDER_ACCESS_DENIED'],[429,'PROVIDER_HTTP_ERROR']]){
  const error=await readProviderFailure(Response.json({error:{message:'never echo synthetic-secret'}},{status}));assert.equal(error.code,code);assert.equal(error.status,status);assert.ok(!error.message.includes('synthetic-secret'));
  for(const locale of ['en','zh-Hans','zh-Hant','ja','ru','de','fr','es']){setLocale(locale);assert.equal(localizeError(error),ERROR_CATALOG[code][locale]+` (HTTP ${status})`);}
 }
 for(const code of ['PROVIDER_CREDENTIAL_MISSING','PROVIDER_CREDENTIAL_LOCKED'])for(const locale of ['en','zh-Hans','zh-Hant','ja','ru','de','fr','es'])assert.ok(ERROR_CATALOG[code][locale]);setLocale('auto');
});
