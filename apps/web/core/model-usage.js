const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const first=(...values)=>values.map(count).find(value=>value!==null)??null;
function attributionSum(usage,key){
 const items=usage?.attribution?.items;
 if(!items||typeof items!=='object'||Array.isArray(items))return null;
 const rows=Object.values(items);if(!rows.length||rows.length>4096)return null;
 let total=0;for(const row of rows){const value=count(row?.[key]);if(value===null||!Number.isSafeInteger(total+=value))return null;}
 return total;
}
// Provider totals are authoritative. Item and nested content totals overlap;
// use item totals only as a complete fallback, never add them to provider totals.
export function cacheUsage(usage={},anthropic=false){
 usage=usage&&typeof usage==='object'?usage:{};
 const details=usage.input_tokens_details||usage.prompt_tokens_details||{};
 const cached=first(details.cached_tokens,usage.prompt_cache_hit_tokens,usage.cache_read_input_tokens,usage.cached_tokens,attributionSum(usage,'cached_tokens'));
 const input=first(usage.input_tokens,usage.prompt_tokens,attributionSum(usage,'input_tokens'));
 const writes=first(details.cache_write_tokens,usage.cache_creation_input_tokens,usage.cache_write_tokens,attributionSum(usage,'cache_write_tokens'));
 const totalInput=anthropic?(input!==null?input+(cached??0)+(writes??0):null):input;
 const ordinary=first(usage.prompt_cache_miss_tokens)??(anthropic?input:input!==null&&cached!==null&&cached+(writes??0)<=input?input-cached-(writes??0):null);
 return {reported:cached!==null,inputTokens:totalInput,cachedInputTokens:cached,cacheWriteTokens:writes,
  cacheWriteTokens30m:count(details.cache_write_tokens_details?.ttl_30m_tokens),cacheWriteTokens12h:count(details.cache_write_tokens_details?.ttl_12h_tokens),
  uncachedInputTokens:ordinary,cacheHitRatio:totalInput>0&&cached!==null&&cached<=totalInput?cached/totalInput:null,
  outputTokens:first(usage.output_tokens,usage.completion_tokens,attributionSum(usage,'output_tokens')),totalTokens:count(usage.total_tokens)};
}
export function usageMetrics(usage,anthropic=false){
 const cache=cacheUsage(usage,anthropic);
 return {usageReported:Boolean(usage&&typeof usage==='object'),cacheReported:cache.reported,cache};
}
// Read the ordered session index in bounded pages, then select one run. Unknown
// cache counts remain unknown instead of silently becoming zero-cache requests.
export async function inspectRunMetrics(store,{sessionId,runId,pageSize=128}={}){
 if(typeof sessionId!=='string'||!sessionId||typeof runId!=='string'||!runId)throw new TypeError('Session and run IDs are required');
 const session=await store.getSession(sessionId);if(!session)throw new Error('Session not found');
 const endSeq=session.eventSeq||0,requests=[],compactions=[],stages=[],tools=[],started=new Map(),failed=[];let afterSeq=0,start=null,end=null,pagesRead=0;
 while(afterSeq<endSeq){
  const rows=await store.getEvents(sessionId,{afterSeq,beforeSeq:endSeq+1,limit:Math.max(1,Math.min(512,pageSize)),direction:'next'});pagesRead++;if(!rows.length)break;
  for(const event of rows){if(event.runId!==runId)continue;const p=event.payload||{};
   if(event.type==='run.started')start=event.createdAt;
   if(event.type==='run.ended')end={at:event.createdAt,...p};
   if(event.type==='model.started'&&p.requestId)started.set(p.requestId,{at:event.createdAt,prefixHash:p.prefixHash,toolsHash:p.toolsHash,messageCount:p.messageCount,imageCount:p.imageCount,model:p.model,reasoningEffort:p.reasoningEffort,preparation:p.preparation});
   if(event.type==='model.failed')failed.push({...(started.get(p.requestId)||{}),seq:event.seq,at:event.createdAt,...p});
   if(event.type==='model.usage')requests.push({...(started.get(p.requestId)||{}),seq:event.seq,at:event.createdAt,step:p.step,requestId:p.requestId||null,durationMs:p.durationMs??null,timing:p.timing||null,cacheDiagnostics:p.cache?.diagnostics||null,...usageMetrics(p.usage,p.protocol==='anthropic')});
   if(event.type==='model.compaction_usage')compactions.push({seq:event.seq,at:event.createdAt,model:p.model,durationMs:p.durationMs??null,timing:p.timing||null,sourceRange:p.sourceRange||null,...usageMetrics(p.usage,p.protocol==='anthropic')});
   if(event.type==='capture.stage')stages.push({seq:event.seq,at:event.createdAt,...p});
   if(event.type==='tool.started'||event.type==='tool.result')tools.push({seq:event.seq,at:event.createdAt,type:event.type,...p});
  }
  afterSeq=rows.at(-1).seq;
 }
 const allRequests=[...requests,...compactions],reported=allRequests.filter(row=>row.cache.reported&&row.cache.inputTokens!==null),input=reported.reduce((n,row)=>n+row.cache.inputTokens,0),cached=reported.reduce((n,row)=>n+row.cache.cachedInputTokens,0);
 const sum=(rows,select)=>rows.reduce((total,row)=>total+(Number.isFinite(select(row))?select(row):0),0);
 const results=tools.filter(row=>row.type==='tool.result'),byTool={};
 for(const row of results){const item=byTool[row.name]??={calls:0,failed:0,durationMs:0};item.calls++;if(['error','failed','cancelled','unknown'].includes(row.status))item.failed++;item.durationMs+=Number.isFinite(row.durationMs)?row.durationMs:0;}
 // Capture stages nest within tools, and compaction nests within preparation.
 // Keep these breakdowns separate so callers do not sum overlapping intervals.
 const measuredRequests=[...requests,...failed];
 const latency={timedRequests:measuredRequests.filter(row=>Number.isFinite(row.durationMs)).length,timedPreparations:measuredRequests.filter(row=>Number.isFinite(row.preparation?.totalMs)).length,timedCompactions:compactions.filter(row=>Number.isFinite(row.durationMs)).length,timedTools:results.filter(row=>Number.isFinite(row.durationMs)).length,elapsedMs:start!==null&&end?Math.max(0,end.at-start):null,modelMs:sum(measuredRequests,row=>row.durationMs),preparationMs:sum(measuredRequests,row=>row.preparation?.totalMs),compactionMs:sum(compactions,row=>row.durationMs),toolMs:sum(results,row=>row.durationMs),byTool};
 return {sessionId,runId,start,end,pagesRead,requests,compactions,failedRequests:failed,captures:stages,tools,latency,cache:{reportedRequests:reported.length,unreportedRequests:allRequests.length-reported.length,inputTokens:input,cachedInputTokens:cached,cacheHitRatio:input>0?cached/input:null}};
}
