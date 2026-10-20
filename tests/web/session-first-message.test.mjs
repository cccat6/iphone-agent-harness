import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB,IDBKeyRange} from 'fake-indexeddb';
import {openStore} from '../../apps/web/core/store.js';
import {createHarness} from '../../apps/web/core/harness.js';

async function fixture(t,memory){
 const connections=[],name='first-message-'+crypto.randomUUID();
 if(!memory)for(const[key,value]of Object.entries({indexedDB:{open(...args){const request=indexedDB.open(...args);request.addEventListener('success',()=>connections.push(request.result));return request;}},IDBKeyRange})){
  const previous=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,value});t.after(()=>previous?Object.defineProperty(globalThis,key,previous):delete globalThis[key]);
 }
 const store=await openStore({memory,name});t.after(()=>{store.close();for(const db of connections)db.close();if(!memory)indexedDB.deleteDatabase(name);});
 return {store,connections};
}
for(const memory of [true,false])test('first submission commits its session and one user message together: '+(memory?'memory':'IndexedDB'),async t=>{
 const {store}=await fixture(t,memory);assert.deepEqual(await store.listSessions(),[]);
 for(const text of ['', ' \n ', 'a'.repeat(100001),null])await assert.rejects(store.createSessionWithMessage({mode:'auto'},text));
 assert.deepEqual(await store.listSessions(),[]);
 const {session,message}=await store.createSessionWithMessage({title:'New conversation',mode:'auto',modelId:'account::model',reasoningEfforts:{'account::model':'high'}},'请设明早七点的闹钟');
 assert.equal(session.lastSeq,1);assert.equal(session.titleState,'pending');assert.equal(session.modelId,'account::model');
 assert.equal((await store.listSessions()).length,1);assert.equal(message.sessionId,session.id);assert.equal(message.role,'user');assert.equal(message.seq,1);
 assert.deepEqual(await store.getMessages(session.id,{includeImages:false}),[message]);
});
test('failed first-message transaction leaves neither a session nor an orphan message',async t=>{
 const {store,connections}=await fixture(t,false),db=connections[0],original=db.transaction.bind(db);
 db.transaction=(names,mode)=>{const tx=original(names,mode);if(mode==='readwrite'){const objectStore=tx.objectStore.bind(tx);tx.objectStore=name=>{const os=objectStore(name);if(name==='messages'){const put=os.put.bind(os);os.put=value=>{const request=put(value);request.addEventListener('success',()=>tx.abort());return request;};}return os;};}return tx;};
 await assert.rejects(store.createSessionWithMessage({title:'New conversation'},'A real first message'));
 db.transaction=original;assert.deepEqual(await store.listSessions(),[]);
 const count=await new Promise((resolve,reject)=>{const r=db.transaction(['messages']).objectStore('messages').count();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});assert.equal(count,0);
});
test('cancelled initial save cannot create an empty conversation',async t=>{
 const {store}=await fixture(t,false),controller=new AbortController();controller.abort();
 await assert.rejects(store.createSessionWithMessage({},'hello',{signal:controller.signal}),{name:'AbortError'});assert.deepEqual(await store.listSessions(),[]);
});
const provider={id:'test',protocol:'openai',baseUrl:'https://model.invalid/v1',model:'fixture'};
test('Harness uses the already committed first message once and obtains a model-generated title',async t=>{
 const {store}=await fixture(t,false);await store.saveSettings({providers:[provider],activeProviderId:'test'});
 const {session,message}=await store.createSessionWithMessage({title:'New conversation',mode:'chat'},'帮我设置明早七点的闹钟');let titled,mainCalls=0,titleCalls=0;
 const finished=new Promise(resolve=>titled=resolve);
 const harness=createHarness({store,invoke:async request=>{mainCalls++;assert.equal(request.messages.filter(m=>m.role==='user'&&!m.internal&&m.text===message.text).length,1);return {text:'好的',toolCalls:[]};},titleInvoke:async request=>{titleCalls++;assert.equal(request.messages[1].text,message.text);return {text:'明早七点闹钟'};},onEvent:event=>{if(event.type==='session.title'&&event.title==='明早七点闹钟')titled();}});
 await harness.run({sessionId:session.id,text:message.text,firstMessageId:message.id});await finished;
 assert.equal(mainCalls,1);assert.equal(titleCalls,1);assert.equal((await store.getMessages(session.id)).filter(m=>m.role==='user'&&!m.internal).length,1);
 assert.equal((await store.getSession(session.id)).title,'明早七点闹钟');assert.equal((await store.listSessions())[0].title,'明早七点闹钟');
});
test('mismatched saved-first-message references never invoke a model or append another user message',async t=>{
 const {store}=await fixture(t,true);await store.saveSettings({providers:[provider],activeProviderId:'test'});const {session,message}=await store.createSessionWithMessage({mode:'chat'},'first');let calls=0;
 const harness=createHarness({store,invoke:async()=>{calls++;return {text:'unexpected',toolCalls:[]};}});
 for(const args of [{firstMessageId:'other',text:'first'},{firstMessageId:message.id,text:'different'}])await assert.rejects(harness.run({sessionId:session.id,...args}));
 assert.equal(calls,0);assert.equal((await store.getMessages(session.id)).length,1);
});
test('a failed model call retains the submitted first message without an empty or duplicate conversation',async t=>{
 const {store}=await fixture(t,true);await store.saveSettings({providers:[provider],activeProviderId:'test'});const {session,message}=await store.createSessionWithMessage({mode:'chat'},'first');
 const harness=createHarness({store,invoke:async()=>{throw new Error('HTTP 401');}});
 await assert.rejects(harness.run({sessionId:session.id,text:message.text,firstMessageId:message.id}));
 assert.equal((await store.listSessions()).length,1);assert.equal((await store.getMessages(session.id)).filter(m=>m.role==='user'&&!m.internal).length,1);
});
test('expired title claims can recover after reload and fence an old response',async t=>{
 t.mock.timers.enable({apis:['Date'],now:100000});const {store}=await fixture(t,false);const {session}=await store.createSessionWithMessage({},'original request');
 const old=await store.beginSessionTitle(session.id);assert.equal(await store.beginSessionTitle(session.id),null);
 t.mock.timers.tick(30001);const current=await store.beginSessionTitle(session.id);assert.notEqual(current.requestId,old.requestId);assert.equal(current.text,'original request');
 assert.equal(await store.setGeneratedSessionTitle(session.id,{requestId:old.requestId,title:'obsolete'}),null);
 await store.setGeneratedSessionTitle(session.id,{requestId:current.requestId,title:'Current summary'});assert.equal((await store.getSession(session.id)).title,'Current summary');
});
test('failed titles may retry after cooldown, but a manual name always wins',async t=>{
 t.mock.timers.enable({apis:['Date'],now:100000});const {store}=await fixture(t,true);const {session}=await store.createSessionWithMessage({},'original request');
 const first=await store.beginSessionTitle(session.id);await store.setGeneratedSessionTitle(session.id,{requestId:first.requestId,title:'original request',failed:true});assert.equal(await store.beginSessionTitle(session.id),null);
 t.mock.timers.tick(30001);const retry=await store.beginSessionTitle(session.id);assert.ok(retry);await store.updateSession(session.id,{title:'My chosen title'});
 assert.equal(await store.setGeneratedSessionTitle(session.id,{requestId:retry.requestId,title:'Generated'}),null);t.mock.timers.tick(30001);assert.equal(await store.beginSessionTitle(session.id),null);assert.equal((await store.getSession(session.id)).title,'My chosen title');
});
