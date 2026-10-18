import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB,IDBKeyRange,IDBVersionChangeEvent,forceCloseDatabase} from 'fake-indexeddb';
import {openStore} from '../../apps/web/core/store.js';

function fixture(t){
 const connections=[],factory={open(...args){const request=indexedDB.open(...args);request.addEventListener('success',()=>connections.push(request.result));return request;}};
 for(const [key,value]of Object.entries({indexedDB:factory,IDBKeyRange})){const prior=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});t.after(()=>prior?Object.defineProperty(globalThis,key,prior):delete globalThis[key]);}
 const name='iah-lifecycle-'+crypto.randomUUID();t.after(()=>{for(const db of connections)db.close();indexedDB.deleteDatabase(name);});
 return {name,connections,factory};
}

test('Safari-style closing connection reconnects once for concurrent session, settings, Skills and device writes',async t=>{
 const f=fixture(t),store=await openStore({name:f.name});t.after(()=>store.close());
 const original=await store.createSession({title:'Preserve my conversation'});await store.addMessage(original.id,{role:'user',text:'Durable original message'});
 f.connections[0].close(); // close() emits no close event; transaction throws InvalidStateError.
 const [session,settings,skill,client]=await Promise.all([store.createSession({title:'After return'}),store.saveSettings({context:{triggerTokens:750000}}),store.saveSkill({id:'own-skill',name:'My skill'}),store.ensureDeviceClientId('https://board.local')]);
 assert.equal(f.connections.length,2);assert.equal(store.persistent,true);assert.ok(session.id);assert.equal(settings.context.triggerTokens,750000);assert.equal(skill.id,'own-skill');assert.ok(client);
 assert.equal((await store.getMessages(original.id))[0].text,'Durable original message');assert.equal((await store.listSessions()).length,2);assert.equal((await store.listSkills())[0].id,'own-skill');
});

test('unexpected native connection closure and versionchange invalidate the shared handle',async t=>{
 const f=fixture(t),store=await openStore({name:f.name});t.after(()=>store.close());await store.saveSettings({sentinel:'retained'});
 forceCloseDatabase(f.connections.at(-1));await new Promise(resolve=>setImmediate(resolve));
 assert.equal((await store.getSettings()).sentinel,'retained');assert.equal(f.connections.length,2);
 // A versionchange notification must relinquish the handle immediately; a
 // subsequent request may reopen only after the version operation has ended.
 f.connections.at(-1).dispatchEvent(new IDBVersionChangeEvent('versionchange',{oldVersion:2,newVersion:2}));
 assert.equal((await store.getSettings()).sentinel,'retained');assert.equal(f.connections.length,3);
});

test('aborted readwrite transaction rolls back and is never silently replayed',async t=>{
 const f=fixture(t),store=await openStore({name:f.name});t.after(()=>store.close());const session=await store.createSession({title:'Before'});
 const db=f.connections[0],original=db.transaction.bind(db);let writes=0;
 db.transaction=(names,mode)=>{const tx=original(names,mode);if(mode==='readwrite'){writes++;const objectStore=tx.objectStore.bind(tx);tx.objectStore=name=>{const os=objectStore(name),put=os.put.bind(os);os.put=value=>{const request=put(value);request.addEventListener('success',()=>tx.abort());return request;};return os;};}return tx;};
 await assert.rejects(store.updateSession(session.id,{title:'Must not persist'}));db.transaction=original;
 assert.equal(writes,1);assert.equal((await store.getSession(session.id)).title,'Before');assert.equal(f.connections.length,1);
});

test('failed reopen surfaces the database error and a later request can recover without memory fallback',async t=>{
 const f=fixture(t),store=await openStore({name:f.name});t.after(()=>store.close());await store.saveSettings({sentinel:'disk'});f.connections[0].close();
 const original=f.factory.open;f.factory.open=()=>{throw new DOMException('Storage disabled','SecurityError');};
 await assert.rejects(store.saveSettings({sentinel:'must not fall back'}),{name:'SecurityError'});assert.equal(store.persistent,true);
 f.factory.open=original;assert.equal((await store.getSettings()).sentinel,'disk');
});

test('explicit store.close is final and cannot reopen or mutate data',async t=>{
 const f=fixture(t),store=await openStore({name:f.name});store.close();await assert.rejects(store.createSession({title:'Not saved'}),{code:'STORE_CLOSED'});assert.equal(f.connections.length,1);
});


test('a real newer schema upgrade releases the old handle and asks old code to reload without deleting data',async t=>{
 const f=fixture(t),store=await openStore({name:f.name});t.after(()=>store.close());await store.saveSettings({sentinel:'preserve across upgrade'});
 const upgraded=await new Promise((resolve,reject)=>{const request=indexedDB.open(f.name,3);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('old handle blocked upgrade'));});t.after(()=>upgraded.close());
 await assert.rejects(store.getSettings(),{code:'STORE_VERSION_CHANGED'});
 const saved=await new Promise((resolve,reject)=>{const request=upgraded.transaction('settings').objectStore('settings').get('settings');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});assert.equal(saved.value.sentinel,'preserve across upgrade');
});


test('local HTTP and HTTPS device identities use distinct canonical origins without permitting public HTTP',async t=>{
 const f=fixture(t),store=await openStore({name:f.name});t.after(()=>store.close());
 const local=await store.ensureDeviceClientId('http://192.168.1.40/');assert.equal(await store.ensureDeviceClientId('http://192.168.1.40'),local);
 assert.notEqual(await store.ensureDeviceClientId('https://192.168.1.40'),local);assert.ok(await store.ensureDeviceClientId('http://harness-test.local'));
 await assert.rejects(store.ensureDeviceClientId('http://example.com'));await assert.rejects(store.ensureDeviceClientId('http://192.168.1.40/commands'));assert.equal(Object.keys((await store.getSettings()).deviceClientIds).length,3);
});

test('history view and deletion use indexed cursors without reading all messages or image blobs',async t=>{
 const f=fixture(t),store=await openStore({name:f.name});t.after(()=>store.close());const session=await store.createSession({title:'paged'});
 for(let i=0;i<12;i++)await store.addMessage(session.id,{role:'user',text:String(i),images:['data:image/png;base64,AAAA'],providerState:{private:'large provider state'}});
 const connection=f.connections.at(-1),native=connection.transaction.bind(connection),calls=[];
 connection.transaction=(...args)=>{const transaction=native(...args),objectStore=transaction.objectStore.bind(transaction);transaction.objectStore=name=>{const target=objectStore(name),nativeIndex=target.index.bind(target);target.getAll=()=>{throw Error('unbounded getAll '+name);};target.index=indexName=>{const index=nativeIndex(indexName);index.getAll=()=>{throw Error('unbounded index getAll '+name);};const keyCursor=index.openKeyCursor.bind(index);index.openKeyCursor=(...arguments_)=>{calls.push(name);return keyCursor(...arguments_);};return index;};return target;};return transaction;};
 const rows=await store.getMessages(session.id,{limit:4,includeImages:false,viewOnly:true});assert.equal(rows.length,4);assert.equal(rows[0].providerState,undefined);assert.ok(rows.every(row=>row.images===undefined));
 assert.equal((await store.listSessions({limit:2})).length,1);await store.deleteSession(session.id);assert.deepEqual(calls.sort(),['events','frames','messages','runs']);assert.equal(await store.getSession(session.id),undefined);assert.deepEqual(await store.getMessages(session.id),[]);
});
test('legacy inline image records remain visible through lazy references without migrating or clearing history',async t=>{const f=fixture(t),store=await openStore({name:f.name});t.after(()=>store.close());const session=await store.createSession({title:'legacy'}),message=await store.addMessage(session.id,{role:'user',text:'old image'}),db=f.connections.at(-1);await new Promise((resolve,reject)=>{const transaction=db.transaction(['messages'],'readwrite');transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);transaction.objectStore('messages').put({...message,images:['data:image/png;base64,AAAA']});});const [view]=await store.getMessages(session.id,{limit:1,includeImages:false,viewOnly:true});assert.equal(view.images,undefined);assert.deepEqual(view.frameRefs,[`local-message:${message.id}:0`]);assert.equal((await store.getFrame(view.frameRefs[0])).dataUrl,'data:image/png;base64,AAAA');assert.deepEqual((await store.getMessages(session.id))[0].images,['data:image/png;base64,AAAA']);});
