import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB,IDBKeyRange} from 'fake-indexeddb';
import {openStore} from '../../apps/web/core/store.js';
import {exportSessionFile} from '../../apps/web/core/session-files.js';

const stores=['sessions','messages','settings','skills','frames','runs','events'];
const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const completion=t=>new Promise((resolve,reject)=>{t.oncomplete=resolve;t.onabort=()=>reject(t.error);t.onerror=()=>reject(t.error);});
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const row=(n,patch={})=>({id:id(n),title:`Conversation ${n}`,titleState:'preserved',mode:'auto',modelId:'model',pinned:false,archived:false,createdAt:1,updatedAt:100,lastSeq:0,eventSeq:0,...patch});
const order=(a,b)=>Number(b.pinned)-Number(a.pinned)||b.updatedAt-a.updatedAt||a.id.localeCompare(b.id);
function fixture(t){
 const name='iah-session-index-'+crypto.randomUUID(),connections=[];
 const factory={open(...args){const r=indexedDB.open(...args);r.addEventListener('success',()=>connections.push(r.result));return r;}};
 for(const [key,value]of Object.entries({indexedDB:factory,IDBKeyRange})){
  const previous=Object.getOwnPropertyDescriptor(globalThis,key);
  Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  t.after(()=>previous?Object.defineProperty(globalThis,key,previous):delete globalThis[key]);
 }
 t.after(()=>{for(const connection of connections)connection.close();indexedDB.deleteDatabase(name);});
 return {name,connections};
}
async function legacy(f,records,additional={}){
 const opening=indexedDB.open(f.name,2);
 opening.onupgradeneeded=()=>{
  for(const name of stores){const s=opening.result.createObjectStore(name,{keyPath:'id'});
   if(['messages','events','frames','runs'].includes(name))s.createIndex('sessionId','sessionId');
   if(['messages','events'].includes(name))s.createIndex('sessionSeq',['sessionId','seq'],{unique:true});
  }
 };
 const db=await request(opening);f.connections.push(db);
 const transaction=db.transaction(stores,'readwrite'),done=completion(transaction);
 for(const session of records)transaction.objectStore('sessions').put(session);
 for(const [name,values]of Object.entries(additional))for(const value of values)transaction.objectStore(name).put(value);
 await done;return db;
}
async function pages(store,options={}){const found=[];let before=null;while(true){const rows=await store.listSessions({...options,limit:3,before});if(!rows.length)return found;found.push(...rows);before=rows.at(-1);assert.ok(found.length<10000,'pagination must advance');}}
function countListReads(connection){
 const native=connection.transaction.bind(connection),counts={entries:0,opens:0,indexNames:[]};
 connection.transaction=(...args)=>{
  const transaction=native(...args),getStore=transaction.objectStore.bind(transaction);
  transaction.objectStore=name=>{
   const store=getStore(name);if(name!=='sessions')return store;
   store.getAll=()=>{throw new Error('Unbounded session getAll');};
   store.openCursor=()=>{throw new Error('Full session store scan');};
   const getIndex=store.index.bind(store);
   store.index=indexName=>{
    const index=getIndex(indexName);index.getAll=()=>{throw new Error('Unbounded session index getAll');};
    const open=index.openCursor.bind(index);
    index.openCursor=(...cursorArgs)=>{counts.opens++;counts.indexNames.push(indexName);const r=open(...cursorArgs);r.addEventListener('success',()=>{if(r.result)counts.entries++;});return r;};
    return index;
   };return store;
  };return transaction;
 };
 return {counts,reset(){counts.entries=0;counts.opens=0;counts.indexNames=[];},restore(){connection.transaction=native;}};
}

test('v2 migration indexes existing sessions and preserves full history, images and credentials',async t=>{
 const f=fixture(t),session=row(1,{lastSeq:1,eventSeq:1,checkpoint:{text:'long summary '.repeat(1000)},promptState:{goal:'Preserve this goal'},reasoningEfforts:{model:'high'}}),hidden=row(2,{importing:true}),archived=row(3,{archived:true,pinned:true});
 const image=new Blob(['pixel bytes'],{type:'image/jpeg'}),message={id:'message',sessionId:session.id,seq:1,role:'user',text:'Original history',frameRefs:['local-asset:frame']};
 const old=await legacy(f,[session,hidden,archived],{
  messages:[message],frames:[{id:'frame',sessionId:session.id,blob:image,assetRef:'local-asset:frame'}],
  settings:[{id:'local-credential:provider:test',value:{kind:'api',apiKey:'test-token'}},{id:'settings',value:{locale:'zh-Hans'}}],
  skills:[{id:'own-skill',content:'Retain this skill'}],runs:[{id:'run',sessionId:session.id,status:'completed'}],events:[{id:'event',sessionId:session.id,seq:1,type:'completed'}]
 });
 let changed=false;old.onversionchange=event=>{assert.equal(event.newVersion,3);changed=true;old.close();};
 const store=await openStore({name:f.name});t.after(()=>store.close());assert.equal(changed,true);
 assert.deepEqual(await store.getSession(session.id),session);
 assert.deepEqual(await store.listSessions(),[Object.fromEntries(['id','title','mode','modelId','pinned','archived','createdAt','updatedAt'].map(key=>[key,session[key]]))]);
 assert.deepEqual((await store.listSessions({archived:true})).map(value=>value.id),[archived.id]);
 assert.equal((await store.getSession(hidden.id)).importing,true);
 assert.equal((await store.getLocalCredential('provider:test')).apiKey,'test-token');
 assert.equal((await store.getSettings()).locale,'zh-Hans');
 assert.equal((await store.getMessages(session.id,{includeImages:false}))[0].text,message.text);
 assert.equal(await (await store.getFrame('local-asset:frame')).blob.text(),'pixel bytes');
 assert.equal((await store.listSkills())[0].content,'Retain this skill');
 assert.equal((await store.getEvents(session.id))[0].type,'completed');
 const db=f.connections.at(-1),raw=await request(db.transaction('sessions').objectStore('sessions').get(session.id));
 assert.deepEqual(raw._listKey,[0,1,-100,session.id]);delete raw._listKey;assert.deepEqual(raw,session);
 assert.equal(await request(db.transaction('runs').objectStore('runs').count()),1);
 assert.equal((await store.exportSession(session.id)).session._listKey,undefined);
 assert.equal((await exportSessionFile(store,session.id)).size>0,true);
 assert.equal((await (await exportSessionFile(store,session.id)).text()).includes('_listKey'),false);
 await assert.rejects(request(indexedDB.open(f.name,2)),{name:'VersionError'});
});

test('ordered cursor reads only the requested page, including a deep cursor and archive partition',async t=>{
 const f=fixture(t),records=Array.from({length:480},(_,n)=>row(n,{pinned:n%7===0,archived:n%5===0,updatedAt:100+Math.floor(n/4),checkpoint:{text:'large checkpoint '.repeat(1000)}}));
 const old=await legacy(f,records);old.close();const store=await openStore({name:f.name});t.after(()=>store.close());
 const observer=countListReads(f.connections.at(-1));t.after(()=>observer.restore());
 const active=records.filter(v=>!v.archived).sort(order),expected=active.slice(150,157);
 const page=await store.listSessions({limit:7,before:active[149]});
 assert.deepEqual(page.map(v=>v.id),expected.map(v=>v.id));
 assert.equal(observer.counts.entries,7);assert.equal(observer.counts.opens,1);assert.deepEqual(observer.counts.indexNames,['listOrder']);
 assert.ok(page.every(v=>!('_listKey' in v)&&!('checkpoint' in v)&&!('lastSeq' in v)));
 observer.reset();const archived=records.filter(v=>v.archived).sort(order);
 assert.deepEqual((await store.listSessions({archived:true,limit:5})).map(v=>v.id),archived.slice(0,5).map(v=>v.id));
 assert.equal(observer.counts.entries,5);
 observer.reset();const last=await store.listSessions({limit:10,before:active.at(-2)});assert.equal(last.length,1);assert.equal(observer.counts.entries,1);
});

test('title search scans ordered candidates until its limit and keeps its cursor across ties',async t=>{
 const f=fixture(t),records=Array.from({length:15},(_,n)=>row(n,{title:n%3===0?'Find Me '+n:'Other '+n,updatedAt:100}));
 const old=await legacy(f,records);old.close();const store=await openStore({name:f.name});t.after(()=>store.close());
 const observer=countListReads(f.connections.at(-1));t.after(()=>observer.restore());
 const first=await store.listSessions({search:'FIND me',limit:2});assert.deepEqual(first.map(v=>v.id),[id(0),id(3)]);assert.equal(observer.counts.entries,4);
 observer.reset();const next=await store.listSessions({search:'find ME',limit:2,before:first.at(-1)});assert.deepEqual(next.map(v=>v.id),[id(6),id(9)]);assert.equal(observer.counts.entries,6);
 const all=await pages(store,{search:'find me'});assert.deepEqual(all.map(v=>v.id),[0,3,6,9,12].map(id));
});

for(const memory of [false,true])test(`${memory?'memory':'IndexedDB'} session writes preserve pin/archive order, hidden imports and public records`,async t=>{
 const f=fixture(t),store=await openStore({memory,name:f.name});t.after(()=>store.close());const originalNow=Date.now;let now=1000;Date.now=()=>now;t.after(()=>Date.now=originalNow);
 const first=await store.createSession({title:'First'}),second=await store.createSession({title:'Second'}),third=await store.createSession({title:'Third'});
 const tied=[first,second,third].sort(order);assert.deepEqual((await pages(store)).map(v=>v.id),tied.map(v=>v.id));
 now=2000;const updated=await store.updateSession(first.id,{title:'Renamed',checkpoint:{text:'keep'},pinned:true});assert.equal(updated._listKey,undefined);
 assert.equal((await store.listSessions())[0].id,first.id);
 now=3000;await store.addMessage(second.id,{role:'user',text:'New message'});assert.deepEqual((await store.listSessions()).map(v=>v.id),[first.id,second.id,third.id]);
 await store.updateSession(first.id,{archived:true});assert.deepEqual((await store.listSessions({archived:true})).map(v=>v.id),[first.id]);assert.equal((await store.listSessions()).length,2);
 await store.updateSession(first.id,{pinned:false,archived:false});assert.equal((await pages(store)).length,3);
 const importing=await store.createImportSession({title:'Import'});await store.addMessage(importing.id,{role:'user',text:'staged'});assert.equal((await store.listSessions()).length,3);
 const finished=await store.finishImportSession(importing.id);assert.equal(finished._listKey,undefined);assert.equal(finished.importing,undefined);assert.equal((await store.listSessions()).length,4);
 const runId='test-run';await store.claimRun(first.id,runId);await store.addEvent(first.id,{type:'progress'});await store.finishRun(first.id,runId,'completed');assert.equal((await store.getSession(first.id))._listKey,undefined);
 await store.deleteSession(second.id);assert.equal((await store.listSessions()).length,3);assert.equal(await store.getSession(second.id),undefined);
 const exported=await store.exportSession(first.id);assert.equal(exported.session._listKey,undefined);assert.equal(exported.session.checkpoint.text,'keep');
 const restored=await store.importSession(exported);assert.equal(restored._listKey,undefined);assert.equal((await store.listSessions()).length,4);
 assert.ok((await pages(store)).every(v=>!('_listKey' in v)));
});
