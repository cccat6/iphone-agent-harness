import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectContext,prepareContext,contextSnapshot,requestContextUsage} from '../../apps/web/core/context.js';
import {openStore} from '../../apps/web/core/store.js';

test('inspection matches the actual non-compacting projection, including checkpoint, repairs, prefix, and selected images',async()=>{
 const rows=[{seq:4,id:'call',role:'assistant',text:'Observe',toolCalls:[{id:'a',name:'phone_observe',arguments:{}},{id:'missing',name:'phone_observe',arguments:{}}]},{seq:5,id:'tool',role:'tool',toolCallId:'a',text:'receipt',frameRefs:['image-a','image-b']},{seq:6,id:'orphan',role:'tool',toolCallId:'unrelated',text:'not projected'},{seq:7,id:'system',role:'system',text:'historical settings'}];
 const checkpoint={throughSeq:3,compactedAtSeq:6,text:'Prior evidence.',goalMessage:{id:'goal',seq:1,role:'user',text:'The current user request.'},imageSelection:{tool:{refs:['image-b'],imageIndexes:[]}}};
 let writes=0,frames=0,reads=0;const store={getSession:async()=>({lastSeq:7,checkpoint}),getMessages:async(id,o)=>{reads++;assert.equal(o.includeImages,false);assert.equal(o.limit,2);return rows.filter(r=>r.seq>o.afterSeq&&r.seq<o.beforeSeq).slice(0,o.limit);},getFrame:async()=>{frames++;throw Error('No hydration');},updateSession:async()=>{writes++;throw Error('Read only');}};
 const input={store,sessionId:'s',settings:{autoCompact:false,triggerTokens:1024,maxImages:0},pageSize:2,prefixTokens:100,provider:{contextWindowTokens:8192}};
 const actual=await prepareContext(input),inspected=await inspectContext(input);assert.equal(inspected.usedTokens,actual.metrics.estimatedInputTokens);assert.equal(inspected.imageCount,actual.metrics.imageCount);assert.equal(inspected.imageCount,1);assert.equal(inspected.pagesRead,2);assert.equal(inspected.messagesRead,4);assert.equal(inspected.lastSeq,7);assert.equal(inspected.remainingTokens,8192-inspected.usedTokens);assert.equal(inspected.source,'estimated');assert.equal(inspected.estimated,true);assert.equal(writes,0);assert.equal(frames,0);assert.equal(reads,4);
});

test('large history inspection stays paginated and never reads assets or invokes compaction',async()=>{
 const store=await openStore({memory:true}),session=await store.createSession({mode:'auto'});for(let i=0;i<530;i++)await store.addMessage(session.id,{role:i%2?'assistant':'user',text:'Evidence '.repeat(30),...(i%50===0?{frameRefs:['unread-image']}:{})});
 const requests=[],wrapped={...store,getMessages:async(id,o)=>{requests.push(o);return store.getMessages(id,o);},getFrame:()=>{throw Error('No image reads');},updateSession:()=>{throw Error('No writes');}};
 const metrics=await inspectContext({store:wrapped,sessionId:session.id,settings:{triggerTokens:1024,maxImages:0},pageSize:17,prefixTokens:20});assert.equal(metrics.messagesRead,530);assert.equal(metrics.pagesRead,32);assert.ok(requests.every(o=>o.limit===17&&o.includeImages===false));assert.ok(metrics.usedTokens>1024);assert.equal(metrics.capacityTokens,null);assert.equal(metrics.remainingTokens,null);assert.equal(metrics.usedPercent,null);assert.equal((await store.getSession(session.id)).checkpoint,undefined);store.close();
});

test('inspection detects missing records and honours cancellation instead of undercounting',async()=>{
 const missing={getSession:async()=>({lastSeq:2}),getMessages:async()=>[{seq:2,role:'user',text:'missing first'}]};await assert.rejects(inspectContext({store:missing,sessionId:'s'}),/Non-contiguous/);
 const controller=new AbortController();controller.abort();await assert.rejects(inspectContext({store:missing,sessionId:'s',signal:controller.signal}),{name:'AbortError'});
});

test('window capacity uses only explicit metadata, never the auto-compaction threshold',()=>{
 const metrics={estimatedInputTokens:1234,reserveTokens:4000,triggerTokens:750000};assert.equal(contextSnapshot(metrics,{model:'gpt-5.4'}).capacityTokens,null);assert.ok(Math.abs(contextSnapshot(metrics,{contextWindowTokens:1000000}).usedPercent-.1234)<1e-9);assert.equal(contextSnapshot(metrics,{contextWindowTokens:1024}).remainingTokens,0);assert.equal(contextSnapshot(metrics,{contextWindowTokens:'1000000'}).capacityTokens,null);
});

test('per-request usage distinguishes OpenAI cache-inclusive input from Anthropic cache components',()=>{
 assert.deepEqual(requestContextUsage({input_tokens:1000,input_tokens_details:{cached_tokens:800}},{protocol:'openai'},8),{source:'last_request',estimated:false,lastRequestInputTokens:1000,usageSeq:8,capacityTokens:null});
 assert.equal(requestContextUsage({prompt_tokens:900,prompt_cache_hit_tokens:700},{protocol:'openai'},9).lastRequestInputTokens,900);
 assert.equal(requestContextUsage({input_tokens:10,cache_read_input_tokens:800,cache_creation_input_tokens:100},{protocol:'anthropic'},10).lastRequestInputTokens,910);
 assert.equal(requestContextUsage({output_tokens:500},{protocol:'openai'},3),null);assert.equal(requestContextUsage({input_tokens:10,cache_read_input_tokens:-1},{protocol:'anthropic'},3),null);
});
