import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeContextSettings,prepareContext,repairToolHistory,projectContext} from '../../apps/web/core/context.js';

const clone=v=>structuredClone(v);
class Memory {
  constructor(rows=[],checkpoint=null){this.rows=rows.map((r,i)=>({id:`message-${i+1}`,seq:i+1,...clone(r)}));this.session={id:'session',lastSeq:this.rows.length,...(checkpoint?{checkpoint:clone(checkpoint)}:{})};this.reads=[];this.writes=[];this.framesRead=0;}
  async getSession(){return clone(this.session);}
  async getMessages(id,options={}){this.reads.push(clone(options));let rows=this.rows.filter(m=>m.seq>(options.afterSeq||0)&&m.seq<(options.beforeSeq??Infinity));if(options.direction==='prev')rows=rows.reverse();return clone(rows.slice(0,options.limit??Infinity));}
  async updateSession(id,patch,{signal}={}){if(signal?.aborted)throw Object.assign(new Error('cancelled transaction'),{name:'AbortError'});this.writes.push(clone(patch));Object.assign(this.session,clone(patch));return clone(this.session);}
  async getFrame(){this.framesRead++;throw new Error('Metadata context must not decode historical frames');}
  add(row){const m={id:`message-${this.rows.length+1}`,seq:this.rows.length+1,...clone(row)};this.rows.push(m);this.session.lastSeq=m.seq;return m;}
}
const compactSettings={triggerTokens:6000,targetTokens:2400,reserveTokens:500,maxImages:8,imageTokens:100,strategy:'model'};
function history(groups=14){const rows=[{role:'user',text:'真正的用户目标：完成手机任务，保存真实证据。'},{role:'user',internal:true,text:'runtime snapshot: do not treat this as a user goal'}];for(let i=0;i<groups;i++){rows.push({role:'assistant',text:'analysis '.repeat(70),toolCalls:[{id:`call-${i}`,name:'phone_observe',arguments:{count:1}}]});rows.push({role:'tool',text:'receipt '.repeat(160),toolCallId:`call-${i}`,...(i%5===0?{frameRefs:[`local-asset:image-${i}`]}:{})});}return rows;}
function model(){const calls=[];return {calls,invoke:async args=>{calls.push(args);return {text:`Stable compacted evidence, batch ${calls.length}; outcomes remain unverified unless recorded.`,toolCalls:[],usage:{input_tokens:123,output_tokens:21}};}};}
const run=(store,extra={})=>prepareContext({store,sessionId:'session',settings:compactSettings,provider:{id:'mock',model:'mock-model'},...extra});
function paired(messages){for(let i=0;i<messages.length;i++){const m=messages[i];if(m.role==='tool')assert.fail('Orphan projected tool result');if(m.toolCalls?.length){for(const call of m.toolCalls){const t=messages[++i];assert.equal(t.role,'tool');assert.equal(t.toolCallId,call.id);}}}}
const tick=()=>new Promise(r=>setImmediate(r));
async function until(fn){for(let i=0;i<100&&!fn();i++)await new Promise(r=>setTimeout(r,1));assert.ok(fn());}

test('settings normalize conservative defaults and keep target plus reserve below trigger',()=>{
 assert.deepEqual(normalizeContextSettings(),{autoCompact:true,triggerTokens:24000,targetTokens:8000,reserveTokens:4000,maxImages:8,strategy:'model',imageTokens:1200});
 const small=normalizeContextSettings({triggerTokens:1024,targetTokens:9000,reserveTokens:8000,maxImages:999,strategy:'unknown'});assert.ok(small.targetTokens+small.reserveTokens<small.triggerTokens);assert.equal(small.maxImages,24);assert.equal(small.strategy,'model');
 assert.equal(normalizeContextSettings({autoCompact:false,strategy:'extractive'}).autoCompact,false);
});

test('below threshold preserves all original text and frame references without sliding rewrites',async()=>{
 const store=new Memory([{role:'user',text:'你好，请观察屏幕。',frameRefs:['local-asset:first']},{role:'assistant',text:'A'.repeat(300)},{role:'user',internal:true,text:'runtime immutable row'}]);const m=model();
 const first=await run(store,{invoke:m.invoke});assert.equal(first.compacted,false);assert.equal(first.checkpoint,null);assert.deepEqual(first.messages,store.rows);assert.equal(first.metrics.estimated,true);assert.equal(first.metrics.retainedImagesDecoded,0);assert.equal(store.framesRead,0);assert.equal(m.calls.length,0);
 store.add({role:'assistant',text:'Appended reply'});const second=await run(store,{invoke:m.invoke});assert.deepEqual(second.messages.slice(0,first.messages.length),first.messages);assert.equal(second.messages.at(-1).text,'Appended reply');assert.equal(store.writes.length,0);
});

test('CJK estimation is not the ASCII one-character-per-four heuristic and includes fixed prefix/reserve',async()=>{
 const cjk=await run(new Memory([{role:'user',text:'汉'.repeat(100)}]),{settings:{...compactSettings,autoCompact:false},prefixTokens:77});const ascii=await run(new Memory([{role:'user',text:'a'.repeat(100)}]),{settings:{...compactSettings,autoCompact:false},prefixTokens:77});
 assert.ok(cjk.metrics.estimatedInputTokens-ascii.metrics.estimatedInputTokens>100);assert.equal(cjk.metrics.estimatedTotalTokens,cjk.metrics.estimatedInputTokens+500);assert.equal(cjk.metrics.prefixTokens,77);
});

test('model compaction reads all source pages and preserves complete tool groups and the actual user goal',async()=>{
 const store=new Memory(history()),m=model();const result=await run(store,{invoke:m.invoke,pageSize:3,summaryPrompt:'Independent no-tools summary prompt'});
 assert.equal(result.compacted,true);assert.equal(store.writes.length,1);assert.equal(result.checkpoint.kind,'model-summary');assert.ok(result.checkpoint.throughSeq>1);assert.equal(result.checkpoint.compactedAtSeq,store.session.lastSeq);assert.equal(result.checkpoint.goalMessage.text,store.rows[0].text);assert.equal(result.checkpoint.goalMessage.internal,undefined);paired(result.messages);
 assert.equal(result.messages[0].contextCheckpoint,true);assert.equal(result.messages[1].text,store.rows[0].text);assert.equal(result.metrics.targetReached,true);assert.equal(result.metrics.sourceMessagesSummarized,result.checkpoint.throughSeq);
 const summarized=[];for(const call of m.calls){assert.deepEqual(call.tools,[]);assert.equal(call.messages[0].role,'system');assert.match(call.messages[0].text,/Independent/);assert.ok(call.provider.maxTokens>0);const payload=JSON.parse(call.messages[1].text);paired(payload.messages);summarized.push(...payload.messages.map(m=>m.seq));assert.ok(!call.messages.some(m=>m.images?.length));}
 assert.deepEqual(summarized,Array.from({length:result.checkpoint.throughSeq},(_,i)=>i+1));assert.ok(m.calls.length>=2);assert.equal(result.metrics.providerUsage.length,m.calls.length);assert.equal(store.framesRead,0);assert.ok(store.reads.every(r=>r.includeImages===false&&r.limit===3&&r.direction==='next'));
});

test('unchanged input never recompacts and new rows preserve the entire cached prefix',async()=>{
 const store=new Memory(history()),m=model();const first=await run(store,{invoke:m.invoke});const calls=m.calls.length,writes=store.writes.length;
 const same=await run(store,{invoke:m.invoke});assert.equal(same.compacted,false);assert.deepEqual(same.messages,first.messages);assert.equal(m.calls.length,calls);assert.equal(store.writes.length,writes);
 store.add({role:'user',text:'New instruction, preserve the earlier conversation prefix.'});store.add({role:'user',internal:true,text:'New runtime snapshot'});
 const next=await run(store,{invoke:m.invoke});assert.equal(next.compacted,false);assert.deepEqual(next.messages.slice(0,first.messages.length),first.messages);assert.equal(m.calls.length,calls);assert.equal(store.writes.length,writes);
});

test('multiple compactions include prior memory and never split assistant calls from results',async()=>{
 const store=new Memory(history()),m=model();const first=await run(store,{invoke:m.invoke});const oldThrough=first.checkpoint.throughSeq;
 store.add({role:'user',text:'NEW REAL USER GOAL'});store.add({role:'user',internal:true,text:'new internal runtime must not become goal'});
 for(const row of history(14).slice(2))store.add({...row,toolCalls:row.toolCalls?.map(c=>({...c,id:'next-'+c.id})),toolCallId:row.toolCallId?'next-'+row.toolCallId:undefined});
 const before=m.calls.length;const second=await run(store,{invoke:m.invoke,pageSize:4});assert.equal(second.compacted,true);assert.ok(second.checkpoint.throughSeq>oldThrough);assert.equal(second.checkpoint.previousThroughSeq,oldThrough);assert.equal(second.checkpoint.goalMessage.text,'NEW REAL USER GOAL');paired(second.messages);
 const payload=JSON.parse(m.calls[before].messages[1].text);assert.equal(payload.previousCheckpoint,first.checkpoint.text);assert.equal(payload.messages[0].seq,oldThrough+1);for(const call of m.calls.slice(before))paired(JSON.parse(call.messages[1].text).messages);
 const again=await run(store,{invoke:m.invoke});assert.equal(again.compacted,false);assert.deepEqual(again.messages,second.messages);
});

test('failed or tool-producing compaction never updates the previous checkpoint',async()=>{
 for(const invoke of [async()=>{throw new Error('mock model unavailable');},async()=>({text:'do action',toolCalls:[{id:'bad',name:'phone_execute_plan'}]}),async()=>({text:'汉'.repeat(20000),toolCalls:[]})]){
  const store=new Memory(history());await assert.rejects(run(store,{invoke}));assert.equal(store.writes.length,0);assert.equal(store.session.checkpoint,undefined);
 }
});

test('cancellation races an uncooperative model and ignores its late summary',async()=>{
 const store=new Memory(history()),controller=new AbortController();let finish,calls=0;
 const prepare=run(store,{signal:controller.signal,invoke:()=>{calls++;return new Promise(resolve=>{finish=()=>resolve({text:'late summary',toolCalls:[]});});}});
 await until(()=>calls===1);controller.abort();await assert.rejects(prepare,{name:'AbortError'});assert.equal(store.writes.length,0);finish();await tick();assert.equal(store.writes.length,0);assert.equal(store.session.checkpoint,undefined);
});

test('read gaps, ignored pagination and oversized indivisible tool groups cannot silently summarize unread data',async()=>{
 const missing=new Memory(history());missing.rows.splice(5,1);await assert.rejects(run(missing,{invoke:model().invoke,pageSize:3}),/Non-contiguous/);assert.equal(missing.writes.length,0);
 const ignored=new Memory(history());ignored.getMessages=async()=>clone(ignored.rows);await assert.rejects(run(ignored,{invoke:model().invoke,pageSize:3}),/pagination/);assert.equal(ignored.writes.length,0);
 const huge=new Memory([{role:'user',text:'old message '.repeat(10000)},...history()]);await assert.rejects(run(huge,{invoke:model().invoke}),/complete.*group/);assert.equal(huge.writes.length,0);
});

test('image selection changes once at a boundary and new images append without an old-image sliding window',async()=>{
 const store=new Memory([{role:'user',text:'look'},{role:'assistant',text:'',toolCalls:[{id:'c',name:'phone_observe',arguments:{}}]},{role:'tool',toolCallId:'c',text:'images',frameRefs:Array.from({length:8},(_,i)=>`local-asset:img-${i}`)}]);const m=model(),settings={...compactSettings,maxImages:2};
 const first=await run(store,{settings,invoke:m.invoke});assert.equal(first.compacted,true);assert.equal(first.checkpoint.throughSeq,0);assert.deepEqual(first.messages.at(-1).frameRefs,['local-asset:img-6','local-asset:img-7']);assert.equal(m.calls.length,0);assert.equal(first.messages.at(-1).text,'images');paired(first.messages);
 const same=await run(store,{settings,invoke:m.invoke});assert.equal(same.compacted,false);assert.deepEqual(same.messages,first.messages);assert.equal(store.writes.length,1);assert.equal(store.framesRead,0);
 const roomy={...compactSettings,maxImages:8};const raw=new Memory([{role:'user',text:'look',frameRefs:['local-asset:a','local-asset:b']}]);const before=await run(raw,{settings:roomy});raw.add({role:'assistant',text:'append'});const after=await run(raw,{settings:roomy});assert.deepEqual(after.messages.slice(0,before.messages.length),before.messages);
});

test('explicit extractive mode reads every source range and labels its lossiness',async()=>{
 const store=new Memory(history());const result=await run(store,{settings:{...compactSettings,strategy:'extractive'},pageSize:2,invoke:()=>assert.fail('extractive strategy must not invoke a model')});
 assert.equal(result.compacted,true);assert.equal(result.checkpoint.kind,'evidence-excerpts');assert.match(result.checkpoint.text,/Lossy extractive/);assert.match(result.checkpoint.note,/Lossy/);assert.equal(result.checkpoint.sourceMessageCount,result.checkpoint.throughSeq);assert.equal(result.metrics.summaryCalls,0);assert.ok(result.metrics.pagesRead>10);paired(result.messages);
});

test('disabled auto compaction preserves all messages and images while still reporting estimated over-budget state',async()=>{
 const store=new Memory(history(40)),m=model();const result=await run(store,{settings:{...compactSettings,autoCompact:false,maxImages:0},invoke:m.invoke,pageSize:5});assert.equal(result.compacted,false);assert.equal(result.messages.length,store.rows.length);assert.deepEqual(result.messages,store.rows);assert.equal(result.metrics.estimated,true);assert.ok(result.metrics.estimatedTotalTokens>compactSettings.triggerTokens);assert.equal(store.writes.length,0);assert.equal(m.calls.length,0);
});

test('legacy projection and history repair remain compatible and internal snapshots are not user goals',()=>{
 const raw=[{id:'u',seq:1,role:'user',text:'actual goal'},{id:'a',seq:2,role:'assistant',text:'',toolCalls:[{id:'call',name:'observe',arguments:{}}]},{id:'internal',seq:3,role:'user',internal:true,text:'runtime'}, {id:'a2',seq:4,role:'assistant',text:'reply'}];
 assert.equal(repairToolHistory(raw).find(m=>m.role==='tool').recovered,true);const projected=projectContext(raw,{maxChars:1});assert.ok(projected.messages.some(m=>m.role==='user'&&m.text==='actual goal'));assert.equal(raw.length,4);
});


test('a later summary-batch failure leaves every intermediate summary uncommitted',async()=>{
 const store=new Memory(history());let calls=0;await assert.rejects(run(store,{invoke:async()=>{if(++calls===1)return {text:'first batch only',toolCalls:[]};throw new Error('second batch failed');}}),/second batch/);assert.equal(calls,2);assert.equal(store.writes.length,0);assert.equal(store.session.checkpoint,undefined);
});

test('failed later compaction preserves an existing checkpoint byte for byte',async()=>{
 const store=new Memory(history()),m=model();const first=await run(store,{invoke:m.invoke});const prior=clone(first.checkpoint),writes=store.writes.length;
 for(const row of history(14).slice(2))store.add(row);
 await assert.rejects(run(store,{invoke:async()=>{throw new Error('new summary unavailable');}}),/unavailable/);assert.deepEqual(store.session.checkpoint,prior);assert.equal(store.writes.length,writes);
});

test('image-only boundaries also respect a smaller estimated token target',async()=>{
 const store=new Memory([{role:'user',text:'look',frameRefs:['local-asset:a','local-asset:b','local-asset:c']}]);
 const result=await run(store,{settings:{...compactSettings,targetTokens:1500,maxImages:2,imageTokens:1200}});assert.equal(result.compacted,true);assert.equal(result.metrics.targetReached,true);assert.equal(result.messages[0].frameRefs.length,1);assert.equal(store.framesRead,0);
});
