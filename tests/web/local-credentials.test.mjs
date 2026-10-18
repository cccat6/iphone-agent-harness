import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory,IDBKeyRange} from 'fake-indexeddb';
import {openStore} from '../../apps/web/core/store.js';

test('explicit local credentials survive real IndexedDB reopen without entering settings or conversation export',async t=>{
 const rangeBefore=Object.getOwnPropertyDescriptor(globalThis,'IDBKeyRange');Object.defineProperty(globalThis,'IDBKeyRange',{configurable:true,value:IDBKeyRange});t.after(()=>rangeBefore?Object.defineProperty(globalThis,'IDBKeyRange',rangeBefore):delete globalThis.IDBKeyRange);
 const before=Object.getOwnPropertyDescriptor(globalThis,'indexedDB');Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:new IDBFactory()});t.after(()=>before?Object.defineProperty(globalThis,'indexedDB',before):delete globalThis.indexedDB);
 const name='credentials-'+crypto.randomUUID(),first=await openStore({name});
 const device={format:'iah-device-credential/1',token:'local-device-secret'},mcp={token:'local-mcp-secret'};
 await first.saveLocalCredential('device:http://bridge.local',device);await first.saveLocalCredential('mcp:server-one',mcp);await first.saveSettings({locale:'en',token:'not-explicitly-saved'});
 const session=await first.createSession({title:'A test'});await first.addMessage(session.id,{role:'user',text:'Hello'});first.close();
 const reopened=await openStore({name});t.after(()=>reopened.close());assert.deepEqual(await reopened.getLocalCredential('device:http://bridge.local'),device);assert.deepEqual(await reopened.getLocalCredential('mcp:server-one'),mcp);
 const settings=await reopened.getSettings(),exported=await reopened.exportSession(session.id);assert.equal(JSON.stringify(settings).includes('secret'),false);assert.equal(settings.token,undefined);assert.equal(JSON.stringify(exported).includes('secret'),false);
 const copy=await reopened.getLocalCredential('mcp:server-one');copy.token='changed';assert.equal((await reopened.getLocalCredential('mcp:server-one')).token,'local-mcp-secret');
 await reopened.deleteLocalCredential('mcp:server-one');assert.equal(await reopened.getLocalCredential('mcp:server-one'),null);assert.deepEqual(await reopened.getLocalCredential('device:http://bridge.local'),device);
 await assert.rejects(reopened.saveLocalCredential('',device));await assert.rejects(reopened.getLocalCredential('bad\nkey'));
});
