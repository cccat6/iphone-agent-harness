import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB,IDBKeyRange} from 'fake-indexeddb';
import {openStore} from '../../apps/web/core/store.js';
import {saveProviderCredential,restoreProviderCredentials,removeProviderCredential,clearCredentials,getCredential} from '../../apps/web/core/credentials.js';
import {registerCodexAccount,clearCodexAccounts,getCodexAccount} from '../../apps/web/core/codex.js';
import {discoverModels,callModel,normalizeProviderEndpoint} from '../../apps/web/core/providers.js';
import {messages} from '../../apps/web/locales/messages.js';
import {readFile} from 'node:fs/promises';

test('API and subscription credentials survive a browser database reopen without a passphrase, outside settings and sessions',async()=>{
 globalThis.indexedDB=indexedDB;globalThis.IDBKeyRange=IDBKeyRange;const name='provider-local-'+crypto.randomUUID(),profiles=[{id:'api',protocol:'openai'},{id:'subscription',protocol:'codex'}];
 let store=await openStore({name});await store.saveSettings({providers:profiles,credentialVault:{legacy:{data:'retained-cipher'}}});
 const tokens={access_token:'synthetic-access',refresh_token:'synthetic-refresh',accountId:'synthetic-account',expiresAt:Date.now()+3600000};
 await saveProviderCredential(store,'api',{kind:'api',apiKey:'synthetic-local-key'});await saveProviderCredential(store,'subscription',{kind:'codex',tokens});
 const session=await store.createSession({title:'hello'});await store.addMessage(session.id,{role:'user',text:'hello'});
 const settings=JSON.stringify(await store.getSettings()),exported=JSON.stringify(await store.exportSession(session.id));
 for(const secret of ['synthetic-local-key','synthetic-access','synthetic-refresh']){assert.ok(!settings.includes(secret));assert.ok(!exported.includes(secret));}
 store.close();clearCredentials();clearCodexAccounts();store=await openStore({name});
 await restoreProviderCredentials(store,profiles,{registerAccount:registerCodexAccount,onError:error=>{throw error;}});
 assert.equal(getCredential('api'),'synthetic-local-key');assert.equal(getCodexAccount('subscription').exportTokens().refresh_token,'synthetic-refresh');
 assert.deepEqual((await store.getSettings()).credentialVault,{legacy:{data:'retained-cipher'}});
 await removeProviderCredential(store,'api');clearCredentials();await restoreProviderCredentials(store,profiles);assert.equal(getCredential('api'),'');
 store.close();clearCodexAccounts();
});

for(const [protocol,forms,inference,catalog] of [
 ['openai',['/v1','/v1/chat','/v1/completions','/v1/chat/completions/'],'/v1/chat/completions','/v1/models'],
 ['anthropic',['/v1','/v1/messages/'],'/v1/messages','/v1/models'],
])test(`${protocol} endpoint hints match actual model-discovery and inference paths`,async()=>{
 for(const path of forms){const baseUrl='https://gateway.invalid'+path+'?tenant=a';assert.equal(new URL(normalizeProviderEndpoint(baseUrl)).pathname,'/v1');
 const models=await discoverModels({protocol,baseUrl,fetchImpl:async url=>{assert.equal(url.pathname,catalog);assert.equal(url.search,'?tenant=a');return Response.json({data:[{id:'a'},{id:'b'}]});}});assert.deepEqual(models.map(m=>m.id),['a','b']);
 await callModel({provider:{protocol,baseUrl,model:'b',stream:false},messages:[],fetchImpl:async url=>{assert.equal(new URL(url).pathname,inference);return Response.json(protocol==='openai'?{choices:[{finish_reason:'stop',message:{content:'ok'}}]}:{stop_reason:'end_turn',content:[{type:'text',text:'ok'}]});}});
 }
});

test('provider editor uses one editable model selector and no new credential unlock/encryption control',async()=>{
 const source=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8'),editor=source.slice(source.indexOf('function renderProviderForm('),source.indexOf('async function showDevices('));
 assert.match(editor,/name="model" list="provider-models"/);assert.match(editor,/<datalist id="provider-models"/);assert.ok(!editor.includes('id="discovered-models"'));assert.ok(!editor.includes('name="encrypt"'));
 assert.match(editor,/credentialVault\?\.\[provider.id\].*<details class="provider-legacy">/);
 assert.match(editor,/querySelector\('#close-panel'\)/);
 for(const dictionary of Object.values(messages))for(const key of ['endpoint','openaiHint','anthropicHint','defaultModel','allModels','developer','localHelp'])assert.ok(dictionary['providerRefinement.'+key]);
});

test('provider form prevents native credential submission even if later editor initialization fails',async()=>{
 const source=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8'),start=source.indexOf("  const editorForm=$('#provider-form');"),end=source.indexOf('const editorActive=',start);assert.ok(start>=0&&end>start);
 const {default:vm}=await import('node:vm'),form=new EventTarget();
 const ctx=vm.createContext({$:()=>form});vm.runInContext(source.slice(start,end),ctx);
 // No async submit handler is installed when a later initializer throws.
 const submit=new Event('submit',{cancelable:true});assert.equal(form.dispatchEvent(submit),false);assert.equal(submit.defaultPrevented,true);
 let saved=0;form.addEventListener('submit',()=>saved++);form.dispatchEvent(new Event('submit',{cancelable:true}));assert.equal(saved,1);
});

test('a late catalog result cannot erase an empty-model subscription while its first save is pending',async()=>{
 const {default:vm}=await import('node:vm'),source=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');
 const applyStart=source.indexOf('  const applyModels='),applyEnd=source.indexOf("  $('#discover-models').onclick=",applyStart),saveStart=source.indexOf("  $('#provider-form').onsubmit=",applyEnd),saveEnd=source.indexOf("  const header=$('.panel-header')",saveStart);assert.ok(applyStart>=0&&saveEnd>saveStart);
 const store=await openStore({memory:true});let release,entered;const blocked=new Promise(resolve=>release=resolve),ready=new Promise(resolve=>entered=resolve),atomicSave=store.saveProvider.bind(store);let active=true;
 const form={elements:{protocol:{value:'codex'},baseUrl:{value:''},model:{value:''},secret:{value:''}},querySelector:()=>({disabled:false})},nodes={'#provider-form':form,'#provider-models':{innerHTML:''}},state={settings:{providers:[]},providerModels:[],providerEdit:'new-plan',providerDraftId:'new-plan',store:{...store,async saveProvider(...args){entered();await blocked;return atomicSave(...args);},saveSettings(){assert.fail('must not save a stale account-list snapshot');},updateProviderModels(){assert.fail('unsaved catalog must not mutate stored accounts');}}};
 const fields={name:'ChatGPT',protocol:'codex',model:'',secret:''},tokens={access_token:'synthetic-save-access',refresh_token:'synthetic-save-refresh',flow:'chatgpt-plan',clientId:'oaiapp_synthetic',identityVerified:true,scopes:['chatgpt.tokens.use.direct'],expiresAt:Date.now()+3600000};
 const ctx=vm.createContext({state,provider:{id:'new-plan',protocol:'codex'},modelSequence:0,editorToken:'editor',editorForm:form,editorActive:()=>active,isCodex:()=>true,providers:()=>state.settings.providers||[],$:selector=>nodes[selector],guard:fn=>fn,modelContextMetadata:()=>({}),modelReasoningMetadata:()=>({}),profileModels:()=>[],normalizeProviderEndpoint:x=>x,modelsStatus(){},renderModelOptions(){},getCredential:()=>'',getCodexAccount:()=>({flow:'chatgpt-plan',clientId:'oaiapp_synthetic',exportTokens:()=>tokens}),shortId:()=>assert.fail('must keep login ID'),FormData:class{get(k){return fields[k];}has(k){return !!fields[k];}},showSettings:async()=>{active=false;},toast(){},t:x=>x,escapeHTML:String,AbortController,setCredential(){assert.fail('subscription does not use API key memory');}});
 vm.runInContext(source.slice(applyStart,applyEnd)+source.slice(saveStart,saveEnd)+'\nthis.applyModels=applyModels;',ctx);
 const saving=form.onsubmit({preventDefault(){},target:form});await ready;await ctx.applyModels([{id:'late-catalog-model'}]);release();await saving;
 const saved=await store.getSettings();assert.equal(saved.providers.length,1);assert.equal(saved.providers[0].id,'new-plan');assert.equal(saved.providers[0].model,'');assert.equal((await store.getLocalCredential('provider:new-plan')).tokens.refresh_token,tokens.refresh_token);assert.equal(state.providerDraftId,null);store.close();
});

test('subscription relay settings are localized and used consistently by discover and save',async()=>{
 const source=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8'),editor=source.slice(source.indexOf('function renderProviderForm('),source.indexOf('async function showDevices('));
 assert.match(editor,/name="subscriptionRelayUrl" type="url"/);assert.match(editor,/relayUrl=editorForm.elements.subscriptionRelayUrl.value/);assert.match(editor,/updated.subscriptionRelayUrl=.*normalizeSubscriptionRelay/);assert.match(editor,/subscriptionRelayUrl.disabled=\$\('#subscription-relay-settings'\).hidden/);
 for(const dictionary of Object.values(messages))for(const key of ['relayHelp','relayAdvanced','relayLabel','relayDefault'])assert.ok(dictionary['siwc.'+key]);
});
