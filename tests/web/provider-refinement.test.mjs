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
