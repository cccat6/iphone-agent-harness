import test from 'node:test';
import assert from 'node:assert/strict';
import {cacheUsage,inspectRunMetrics} from '../../apps/web/core/model-usage.js';
import {openStore} from '../../apps/web/core/store.js';
import {createHarness} from '../../apps/web/core/harness.js';
test('missing cache counters remain unknown; explicit zero is reported and missing input has no ratio',()=>{
 for(const u of [{},{input_tokens:100},{input_tokens:100,cached_tokens:-1},{input_tokens:100,cached_tokens:'80'},{cached_tokens:30}]){
  const c=cacheUsage(u);assert.equal(c.cacheHitRatio,null);if(!('cached_tokens'in u&&u.cached_tokens===30)){assert.equal(c.reported,false);assert.equal(c.uncachedInputTokens,null);}
 }
 assert.equal(cacheUsage({input_tokens:100,cached_tokens:0}).reported,true);
 assert.equal(cacheUsage({input_tokens:100,cached_tokens:0}).cacheHitRatio,0);
 assert.equal(cacheUsage({input_tokens:10,cached_tokens:20}).cacheHitRatio,null);
});
test('provider totals and complete item attribution use distinct fallbacks without double counting nested content',()=>{
 const attribution={items:{a:{input_tokens:60,cached_tokens:50,cache_write_tokens:2,content:[{cached_tokens:50}]},b:{input_tokens:40,cached_tokens:30,cache_write_tokens:3,content:[{cached_tokens:30}]}}};
 let c=cacheUsage({input_tokens:100,cached_tokens:90,cache_write_tokens:1,attribution});assert.equal(c.cachedInputTokens,90);assert.equal(c.cacheWriteTokens,1);assert.equal(c.uncachedInputTokens,9);
 c=cacheUsage({attribution});assert.equal(c.inputTokens,100);assert.equal(c.cachedInputTokens,80);assert.equal(c.cacheWriteTokens,5);
 c=cacheUsage({attribution:{items:{a:{cached_tokens:10},b:{input_tokens:50}}}});assert.equal(c.reported,false);assert.equal(c.inputTokens,null);
});
test('Anthropic ratio includes cached reads and writes in the input denominator',()=>{
 const c=cacheUsage({input_tokens:20,cache_read_input_tokens:100,cache_creation_input_tokens:30},true);
 assert.equal(c.inputTokens,150);assert.equal(c.uncachedInputTokens,20);assert.equal(c.cacheHitRatio,100/150);
});
test('usage journal is persisted and emitted with run/request identity even when upstream omits usage',async()=>{
 const store=await openStore({memory:true});await store.saveSettings({providers:[{id:'p',protocol:'openai',baseUrl:'https://fixture.invalid',model:'fixture'}],activeProviderId:'p'});
 const s=await store.createSession({mode:'chat'}),events=[];
 const h=createHarness({store,onEvent:e=>events.push(e),invoke:async()=>({text:'ok',toolCalls:[]})});await h.run({sessionId:s.id,text:'hello'});
 const rows=await store.getEvents(s.id),started=rows.find(x=>x.type==='model.started'),usage=rows.find(x=>x.type==='model.usage');assert.equal(usage.runId,started.runId);assert.equal(usage.payload.requestId,started.payload.requestId);assert.equal(usage.payload.usageReported,false);assert.equal(usage.payload.cacheReported,false);assert.equal(usage.payload.cache.cachedInputTokens,null);assert.ok(usage.payload.durationMs>=0);
 assert.ok(events.some(x=>x.type==='diagnostic'&&x.event.id===usage.id));
 const images=rows.find(x=>x.type==='model.image_transfer');assert.equal(images.payload.requestId,started.payload.requestId);assert.ok(Number.isFinite(images.payload.durationMs)&&images.payload.durationMs>=0);
});

test('image transfer inspection attributes retries and excludes another run without duplicating model latency',async()=>{
 const store=await openStore({memory:true}),s=await store.createSession();
 await store.addEvent(s.id,{runId:'old',type:'model.image_transfer',payload:{uploaded:99,uploadedBytes:99999,durationMs:99999}});
 const add=(type,payload)=>store.addEvent(s.id,{runId:'images',type,payload});
 await add('model.started',{requestId:'first'});
 await add('model.image_transfer',{requestId:'first',uploaded:1,reused:4,uploadedBytes:1200,inlineBytes:0,durationMs:80,credential:'private-fixture'});
 await add('model.failed',{requestId:'first',durationMs:500,code:'SIWC_RELAY_STREAM'});
 await add('model.started',{requestId:'retry'});
 await add('model.image_transfer',{requestId:'retry',uploaded:0,reused:5,uploadedBytes:0,inlineBytes:0,durationMs:12});
 await add('model.usage',{requestId:'retry',durationMs:400,usage:{input_tokens:100,cached_tokens:90}});
 const report=await inspectRunMetrics(store,{sessionId:s.id,runId:'images',pageSize:2});
 assert.deepEqual(report.images,{reportedRequests:2,timedRequests:2,preparationMs:92,uploadedImages:1,reusedReferences:9,uploadedBytes:1200,inlineBytes:0});
 assert.equal(report.failedRequests[0].imageTransfer.uploaded,1);assert.equal(report.requests[0].imageTransfer.reused,5);assert.equal(report.latency.modelMs,900);assert.equal(JSON.stringify(report).includes('private-fixture'),false);
});
test('legacy image records retain unknown preparation time instead of inventing zero latency',async()=>{
 const store=await openStore({memory:true}),s=await store.createSession();await store.addEvent(s.id,{runId:'legacy',type:'model.image_transfer',payload:{requestId:'legacy',uploaded:0,reused:2,uploadedBytes:0,inlineBytes:0}});
 const report=await inspectRunMetrics(store,{sessionId:s.id,runId:'legacy'});assert.equal(report.images.preparationMs,null);assert.equal(report.images.timedRequests,0);assert.equal(report.images.reusedReferences,2);
});
test('run inspection pages ordered session events and isolates runs, zero hits and unknown counts',async()=>{
 const store=await openStore({memory:true}),s=await store.createSession();
 await store.addEvent(s.id,{runId:'old',type:'model.usage',payload:{usage:{input_tokens:999,cached_tokens:999}}});
 await store.addEvent(s.id,{runId:'new',type:'run.started'});
 for(const usage of [{input_tokens:100,cached_tokens:90},{input_tokens:50,cached_tokens:0},{input_tokens:100}])await store.addEvent(s.id,{runId:'new',type:'model.usage',payload:{usage}});
 await store.addEvent(s.id,{runId:'new',type:'run.ended',payload:{status:'completed'}});
 const report=await inspectRunMetrics(store,{sessionId:s.id,runId:'new',pageSize:2});assert.equal(report.pagesRead,3);assert.equal(report.requests.length,3);assert.deepEqual(report.cache,{reportedRequests:2,unreportedRequests:1,inputTokens:150,cachedInputTokens:90,cacheHitRatio:.6});assert.equal(report.end.status,'completed');
});
test('run cache accounting includes compaction API usage using its own protocol denominator',async()=>{
 const store=await openStore({memory:true}),session=await store.createSession();
 await store.addEvent(session.id,{runId:'r',type:'model.compaction_usage',payload:{protocol:'anthropic',model:'fixture',usage:{input_tokens:10,cache_read_input_tokens:90,cache_creation_input_tokens:0}}});
 const report=await inspectRunMetrics(store,{sessionId:session.id,runId:'r'});assert.equal(report.compactions.length,1);assert.equal(report.compactions[0].cache.inputTokens,100);assert.equal(report.cache.cacheHitRatio,.9);
});

test('inspection retains preparation, stream, cache diagnosis and nested latency without double-counting capture',async()=>{
 const store=await openStore({memory:true}),s=await store.createSession();
 const add=(type,payload)=>store.addEvent(s.id,{runId:'timed',type,payload});
 await add('run.started',{});await add('model.started',{requestId:'m',preparation:{totalMs:100,imagesMs:20}});await add('model.usage',{requestId:'m',durationMs:500,timing:{responseHeadersMs:100,firstContentMs:200,totalMs:499},usage:{input_tokens:100,cached_tokens:90},cache:{diagnostics:{status:'cache_hit'}}});
 await add('model.started',{requestId:'failed',preparation:{totalMs:40}});await add('model.failed',{requestId:'failed',durationMs:60,code:'CONTEXT_WINDOW_EXCEEDED'});
 await add('model.compaction_usage',{durationMs:80,sourceRange:{fromSeq:1,throughSeq:10},usage:{input_tokens:10,cached_tokens:0}});
 await add('tool.result',{name:'phone_observe',status:'returned',durationMs:200});await add('capture.stage',{stage:'capture',durationMs:150});await add('tool.result',{name:'phone_execute_plan',status:'failed',durationMs:300});await add('run.ended',{status:'completed'});
 const report=await inspectRunMetrics(store,{sessionId:s.id,runId:'timed',pageSize:2});assert.equal(report.requests[0].preparation.imagesMs,20);assert.equal(report.requests[0].timing.firstContentMs,200);assert.equal(report.requests[0].cacheDiagnostics.status,'cache_hit');assert.equal(report.compactions[0].sourceRange.throughSeq,10);assert.equal(report.latency.modelMs,560);assert.equal(report.latency.preparationMs,140);assert.equal(report.latency.compactionMs,80);assert.equal(report.latency.toolMs,500);assert.deepEqual(report.latency.byTool.phone_execute_plan,{calls:1,failed:1,durationMs:300});
});
