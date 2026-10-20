import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {openStore} from '../../apps/web/core/store.js';
import {generateSessionTitle,normalizeSessionTitle} from '../../apps/web/core/session-title.js';
import {createHarness} from '../../apps/web/core/harness.js';
import {importSessionFile,exportSessionFile} from '../../apps/web/core/session-files.js';
const provider={id:'test',protocol:'openai',baseUrl:'https://model.invalid/v1',model:'fixture',stream:true};
async function setup(memory=true){const store=await openStore({memory,name:'title-test:'+crypto.randomUUID()});await store.saveSettings({providers:[provider],activeProviderId:'test'});const session=await store.createSession({title:'New conversation',titleState:'pending',mode:'chat'});return {store,session};}
const wait=()=>new Promise(resolve=>setTimeout(resolve,0));

test('title request contains only bounded first request and no history, tools or screenshots',async()=>{const {store,session}=await setup();await store.addMessage(session.id,{role:'user',text:'请帮我设置早上七点的闹钟'+ 'a'.repeat(8000)});await store.addMessage(session.id,{role:'assistant',text:'private later history'});let request;const events=[];await generateSessionTitle({store,sessionId:session.id,provider,locale:'zh-Hans',credential:'fixture',invoke:async value=>{request=value;return {text:'设置早晨闹钟'};},onEvent:e=>events.push(e)});assert.equal(request.messages.length,2);assert.equal(request.messages[1].text.length,4000);assert.match(request.messages[0].text,/Simplified Chinese/);assert.equal(request.messages.some(m=>m.text.includes('private later')),false);assert.deepEqual(request.tools,[]);assert.equal(request.provider.stream,false);assert.equal((await store.getSession(session.id)).title,'设置早晨闹钟');assert.equal(events[0].type,'session.title');store.close();});

test('delayed generated title cannot overwrite a manual rename, including IndexedDB transactions',async()=>{for(const memory of [true,false]){const {store,session}=await setup(memory);await store.addMessage(session.id,{role:'user',text:'Set an alarm'});let release,entered;const gate=new Promise(r=>entered=r),pending=new Promise(r=>release=r);const job=generateSessionTitle({store,sessionId:session.id,provider,invoke:()=>{entered();return pending;}});await gate;await store.updateSession(session.id,{title:'My chosen name'});release({text:'Alarm'});assert.equal(await job,null);assert.equal((await store.getSession(session.id)).title,'My chosen name');store.close();}});

test('exported in-flight automatic title does not rename a restored conversation',async()=>{const {store,session}=await setup();await store.addMessage(session.id,{role:'user',text:'Set an alarm'});const backup=await exportSessionFile(store,session.id);const restored=await importSessionFile(store,backup),legacy=await store.importSession(await store.exportSession(session.id));let calls=0;for(const id of [restored.id,legacy.id]){assert.equal(await generateSessionTitle({store,sessionId:id,provider,invoke:async()=>{calls++;return {text:'wrong'};}}),null);}assert.equal(calls,0);assert.equal((await store.getSession(restored.id)).title,'New conversation (imported)');store.close();});

test('title generation is claimed once even across concurrent calls and later user messages',async()=>{const {store,session}=await setup(false);await store.addMessage(session.id,{role:'user',text:'first request'});let calls=0;const invoke=async request=>{calls++;assert.equal(request.messages[1].text,'first request');await wait();return {text:'First topic'};};await Promise.all([1,2,3].map(()=>generateSessionTitle({store,sessionId:session.id,provider,invoke})));await store.addMessage(session.id,{role:'user',text:'second request'});await generateSessionTitle({store,sessionId:session.id,provider,invoke});assert.equal(calls,1);store.close();});

test('failed optional title request leaves a bounded local fallback and never rejects main response',async()=>{const {store,session}=await setup();await store.addMessage(session.id,{role:'user',text:'Please set an alarm'});const result=await generateSessionTitle({store,sessionId:session.id,provider,invoke:async()=>{throw new Error('backend offline');}});assert.equal(result.title,'Please set an alarm');assert.equal(result.titleState,'fallback');store.close();});

test('uncooperative title request is bounded by timeout and cannot later change fallback',async()=>{const {store,session}=await setup();await store.addMessage(session.id,{role:'user',text:'First task'});let release;const result=await generateSessionTitle({store,sessionId:session.id,provider,timeoutMs:10,invoke:()=>new Promise(r=>release=r)});assert.equal(result.titleState,'fallback');release({text:'Late answer'});await wait();assert.equal((await store.getSession(session.id)).title,'First task');store.close();});

test('harness starts title generation after successful main reply without delaying completion',async()=>{const {store,session}=await setup();let titleStarted,release;const started=new Promise(r=>titleStarted=r),events=[];const harness=createHarness({store,invoke:async()=>({text:'Main reply',toolCalls:[]}),titleInvoke:()=>{titleStarted();return new Promise(r=>release=r);},onEvent:e=>events.push(e)});const reply=await harness.run({sessionId:session.id,text:'Can you help set an alarm?'});await started;assert.equal(reply.text,'Main reply');assert.equal(harness.running,false);release({text:'Alarm assistance'});for(let i=0;i<20&&!events.some(e=>e.type==='session.title'&&e.title==='Alarm assistance');i++)await wait();assert.equal((await store.getSession(session.id)).title,'Alarm assistance');assert.equal(events.some(e=>e.type==='session.title'),true);store.close();});

test('failed main model reply does not cause a second unauthorized title API request',async()=>{const {store,session}=await setup();let calls=0;const harness=createHarness({store,invoke:async()=>{throw Object.assign(new Error('401'),{status:401});},titleInvoke:async()=>{calls++;return {text:'Should not happen'};}});await assert.rejects(harness.run({sessionId:session.id,text:'Hello'}));assert.equal(calls,0);assert.equal((await store.getSession(session.id)).titleState,'pending');store.close();});

test('titles reject structured debug output and strip harmless model quoting',()=>{assert.equal(normalizeSessionTitle('"Morning alarm"'),'Morning alarm');assert.equal(normalizeSessionTitle('{"title":"Alarm"}'),'');assert.equal(normalizeSessionTitle('<b>Alarm</b>'),'');assert.equal(normalizeSessionTitle('a'.repeat(121)),'');});

test('an already cancelled title request keeps pending state and never claims or invokes',async()=>{
 const {store,session}=await setup();await store.addMessage(session.id,{role:'user',text:'Set an alarm'});const controller=new AbortController();controller.abort();let calls=0,claims=0;const begin=store.beginSessionTitle.bind(store);store.beginSessionTitle=async(...args)=>{claims++;return begin(...args);};
 assert.equal(await generateSessionTitle({store,sessionId:session.id,provider,signal:controller.signal,invoke:async()=>{calls++;return {text:'Alarm'};}}),null);
 assert.equal(calls,0);assert.equal(claims,0);assert.equal((await store.getSession(session.id)).titleState,'pending');store.close();
});

test('cancellation while claiming the title never starts its API request or overwrites a manual name',async()=>{
 for(const rename of [false,true]){
  const {store,session}=await setup(false);await store.addMessage(session.id,{role:'user',text:'First request'});const controller=new AbortController(),begin=store.beginSessionTitle.bind(store);let calls=0;
  store.beginSessionTitle=async(...args)=>{const claim=await begin(...args);controller.abort();if(rename)await store.updateSession(session.id,{title:'My manual name'});return claim;};
  await generateSessionTitle({store,sessionId:session.id,provider,signal:controller.signal,invoke:async()=>{calls++;return {text:'Unwanted title'};}});
  assert.equal(calls,0);const saved=await store.getSession(session.id);assert.equal(saved.title,rename?'My manual name':'First request');assert.equal(saved.titleState,rename?'manual':'fallback');store.close();
 }
});

test('a successful retry after main-model failure titles the original first request',async()=>{
 const {store,session}=await setup();let failMain=true,titleCalls=0,finished;const titled=new Promise(resolve=>finished=resolve);
 const harness=createHarness({store,invoke:async()=>{if(failMain)throw Object.assign(new Error('HTTP 401'),{status:401});return {text:'Ready now',toolCalls:[]};},titleInvoke:async request=>{titleCalls++;assert.equal(request.messages[1].text,'Set a seven o’clock alarm');return {text:'Morning alarm'};},onEvent:event=>{if(event.type==='session.title'&&event.title==='Morning alarm')finished();}});
 await assert.rejects(harness.run({sessionId:session.id,text:'Set a seven o’clock alarm'}));assert.equal(titleCalls,0);assert.equal((await store.getSession(session.id)).titleState,'pending');
 failMain=false;await harness.run({sessionId:session.id,text:'Please try again'});await titled;
 assert.equal(titleCalls,1);assert.equal((await store.getSession(session.id)).title,'Morning alarm');store.close();
});

test('successful run cleanup leaves an in-flight title request alive with the selected model',async()=>{
 const {store,session}=await setup();const parent=new AbortController();let request,release,started;const entered=new Promise(resolve=>started=resolve);
 const harness=createHarness({store,invoke:async()=>({text:'Main response',toolCalls:[]}),titleInvoke:input=>{request=input;started();return new Promise(resolve=>release=resolve);}});
 await harness.run({sessionId:session.id,text:'Plan my morning',signal:parent.signal});await entered;assert.equal(request.signal.aborted,false);assert.equal(request.provider.model,provider.model);
 parent.abort();assert.equal(request.signal.aborted,false,'finished run has detached the caller signal');release({text:'Morning plan'});
 for(let i=0;i<30&&(await store.getSession(session.id)).titleState==='generating';i++)await wait();assert.equal((await store.getSession(session.id)).title,'Morning plan');store.close();
});

test('structured fenced output is rejected instead of naming the conversation json',()=>{
 assert.equal(normalizeSessionTitle('```json\n{"title":"Morning alarm"}\n```'),'');
 assert.equal(normalizeSessionTitle('```javascript\nconst title="Alarm";\n```'),'');
 assert.equal(normalizeSessionTitle('```text\nMorning alarm\n```'),'Morning alarm');
 assert.equal(normalizeSessionTitle('```\nMorning alarm\n```'),'Morning alarm');
});
