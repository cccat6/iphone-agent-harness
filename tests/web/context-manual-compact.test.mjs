import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB,IDBKeyRange} from 'fake-indexeddb';
import {openStore} from '../../apps/web/core/store.js';
import {createHarness} from '../../apps/web/core/harness.js';
import {prepareContext} from '../../apps/web/core/context.js';
globalThis.indexedDB=indexedDB;globalThis.IDBKeyRange=IDBKeyRange;
const until=async fn=>{for(let i=0;i<100&&!fn();i++)await new Promise(r=>setTimeout(r,1));assert.ok(fn());};
async function fixture({memory=true}={}){
 const store=await openStore({memory,name:'manual-context-'+crypto.randomUUID()}),provider={id:'p',protocol:'openai',baseUrl:'https://fixture.invalid/v1',model:'m',models:[{id:'m',contextWindowTokens:1000000}]};await store.saveSettings({providers:[provider],activeProviderId:'p',context:{autoCompact:false,triggerTokens:750000}});const session=await store.createSession({mode:'auto'});
 for(let i=0;i<12;i++)await store.addMessage(session.id,{role:i%2?'assistant':'user',text:'Historical evidence '+i+' '+('data '.repeat(200))});
 await store.addMessage(session.id,{role:'user',text:'LATEST REAL USER REQUEST'});await store.addMessage(session.id,{role:'assistant',text:'',toolCalls:[{id:'observe',name:'phone_observe',arguments:{}}]});await store.addMessage(session.id,{role:'tool',toolCallId:'observe',text:'Latest durable receipt.',frameRefs:['never-hydrate-this']});
 const events=[],calls=[];const options={store,onEvent:e=>events.push(e),getContext:()=>{throw Error('No bridge requests');},capture:{active:true,grab:()=>{throw Error('No screenshots');}},executePlan:()=>{throw Error('No input');},invoke:async args=>{calls.push(args);return {text:'The historical evidence is summarized. Keep the latest request and tool outcomes.',toolCalls:[]};}};
 return {store,session,provider,options,events,calls};
}

test('inspect and draft inspect make no requests or storage writes, even before builtins are installed',async()=>{
 const f=await fixture();const before=await f.store.listSkills(),h=createHarness(f.options);const metrics=await h.inspectContext({sessionId:f.session.id});assert.equal(metrics.source,'estimated');assert.equal(metrics.capacityTokens,1000000);assert.ok(metrics.prefixTokens>1000);assert.equal(metrics.toolsEstimated,true);assert.equal(f.calls.length,0);assert.deepEqual(await f.store.listSkills(),before);assert.equal((await f.store.getSession(f.session.id)).activeRun,undefined);
 const draft=await h.inspectContext({modelId:'p::m',mode:'chat'});assert.equal(draft.lastSeq,0);assert.equal(draft.capacityTokens,1000000);assert.ok(draft.usedTokens>0);assert.equal(draft.sessionId,null);assert.deepEqual(await f.store.listSkills(),before);f.store.close();
});

test('manual compaction overrides disabled auto mode and changes only the checkpoint, preserving latest user and whole tool group',async()=>{
 const f=await fixture(),before=await f.store.getMessages(f.session.id,{includeImages:false}),h=createHarness(f.options),result=await h.compact({sessionId:f.session.id,modelId:'p::m'});
 assert.equal(result.compacted,true);assert.equal(result.metrics.compactionReason,'manual');assert.equal(result.metrics.source,'estimated');assert.equal(result.metrics.capacityTokens,1000000);assert.equal(h.running,false);assert.ok(f.calls.length>0);for(const request of f.calls){assert.deepEqual(request.tools,[]);assert.ok(!request.messages.some(m=>m.images?.length));}
 assert.deepEqual(await f.store.getMessages(f.session.id,{includeImages:false}),before);const saved=await f.store.getSession(f.session.id);assert.equal(saved.lastSeq,before.length);assert.equal(saved.activeRun,undefined);assert.equal(saved.checkpoint.goalMessage,undefined);assert.equal(saved.checkpoint.kind,'model-summary');
 const projected=await prepareContext({store:f.store,sessionId:f.session.id,settings:{autoCompact:false}});assert.ok(projected.messages.some(m=>m.text==='LATEST REAL USER REQUEST'));const callIndex=projected.messages.findIndex(m=>m.toolCalls?.[0]?.id==='observe');assert.equal(projected.messages[callIndex+1].toolCallId,'observe');assert.equal(projected.messages[callIndex+1].text,'Latest durable receipt.');assert.ok(f.events.some(e=>e.type==='context'&&e.snapshot?.compactionReason==='manual'));f.store.close();
});

for(const memory of [true,false])test(`checkpoint commit is atomic against history, boundary, ownership and cancellation races (${memory?'memory':'IDB'})`,async()=>{
 const f=await fixture({memory}),old={throughSeq:0,text:'Old boundary'};await f.store.updateSession(f.session.id,{checkpoint:old});let session=await f.store.getSession(f.session.id);await f.store.claimRun(f.session.id,'owner',{expiresAt:Date.now()+90000});
 await assert.rejects(f.store.commitContextCheckpoint(f.session.id,{text:'new'},{runId:'other',lastSeq:session.lastSeq,previousCheckpoint:old}),{code:'CONTEXT_STALE'});
 await f.store.addMessage(f.session.id,{role:'user',text:'Concurrent new request'});await assert.rejects(f.store.commitContextCheckpoint(f.session.id,{text:'new'},{runId:'owner',lastSeq:session.lastSeq,previousCheckpoint:old}),{code:'CONTEXT_STALE'});session=await f.store.getSession(f.session.id);
 await assert.rejects(f.store.commitContextCheckpoint(f.session.id,{text:'new'},{runId:'owner',lastSeq:session.lastSeq,previousCheckpoint:null}),{code:'CONTEXT_STALE'});
 const controller=new AbortController();controller.abort();await assert.rejects(f.store.commitContextCheckpoint(f.session.id,{text:'new'},{runId:'owner',lastSeq:session.lastSeq,previousCheckpoint:old,signal:controller.signal}));assert.deepEqual((await f.store.getSession(f.session.id)).checkpoint,old);
 await f.store.commitContextCheckpoint(f.session.id,{throughSeq:0,text:'new'},{runId:'owner',lastSeq:session.lastSeq,previousCheckpoint:old});assert.equal((await f.store.getSession(f.session.id)).checkpoint.text,'new');await f.store.finishRun(f.session.id,'owner','completed');f.store.close();
});

test('manual compaction excludes concurrent run/compaction and never leaves a claim after cancellation',async()=>{
 const f=await fixture();let finish,started=false;f.options.invoke=()=>{started=true;return new Promise(resolve=>{finish=resolve;});};const h=createHarness(f.options),controller=new AbortController(),pending=h.compact({sessionId:f.session.id,signal:controller.signal});await until(()=>started);assert.equal(h.running,true);
 await assert.rejects(h.compact({sessionId:f.session.id}),{code:'CONTEXT_BUSY'});await assert.rejects(h.run({sessionId:f.session.id,text:'Must not run'}),/正在运行/);
 const other=createHarness(f.options);await assert.rejects(other.compact({sessionId:f.session.id}),/另一个窗口运行/);controller.abort();await assert.rejects(pending,{name:'AbortError'});finish({text:'late summary',toolCalls:[]});await new Promise(r=>setImmediate(r));const saved=await f.store.getSession(f.session.id);assert.equal(saved.checkpoint,undefined);assert.equal(saved.activeRun,undefined);assert.equal(h.running,false);f.store.close();
});

test('manual model failure and a changed history never overwrite the previous checkpoint',async()=>{
 for(const concurrent of [false,true]){const f=await fixture(),old={throughSeq:0,text:'Existing memory'};await f.store.updateSession(f.session.id,{checkpoint:old});f.options.invoke=async()=>{if(!concurrent)throw Error('Summary failed');await f.store.addMessage(f.session.id,{role:'user',text:'Concurrent message'});return {text:'Late obsolete summary',toolCalls:[]};};await assert.rejects(createHarness(f.options).compact({sessionId:f.session.id}));assert.deepEqual((await f.store.getSession(f.session.id)).checkpoint,old);assert.equal((await f.store.getSession(f.session.id)).activeRun,undefined);f.store.close();}
});

test('run emits current estimates and separate per-request usage without cumulative token accounting',async()=>{
 const f=await fixture();await f.store.updateSession(f.session.id,{mode:'chat'});let n=0;f.options.invoke=async()=>++n===1?{text:'',toolCalls:[{id:'list',name:'skills_list',arguments:{}}],usage:{input_tokens:100,prompt_tokens_details:{cached_tokens:80}}}:{text:'Done',toolCalls:[],usage:{input_tokens:140}};await createHarness(f.options).run({sessionId:f.session.id,text:'Hello',mode:'chat'});
 const ready=f.events.filter(e=>e.type==='context'&&e.status==='ready'),usage=f.events.filter(e=>e.type==='context'&&e.status==='usage');assert.equal(ready.length,2);assert.equal(usage.length,2);assert.equal(ready[0].snapshot.source,'estimated');assert.equal(usage[0].snapshot.source,'last_request');assert.equal(usage[0].snapshot.lastRequestInputTokens,100);assert.equal(usage[1].snapshot.lastRequestInputTokens,140);assert.equal(usage[1].snapshot.usedTokens,undefined);assert.ok(usage[1].snapshot.usageSeq>usage[0].snapshot.usageSeq);assert.ok(ready[1].snapshot.usedTokens>ready[0].snapshot.usedTokens);f.store.close();
});
