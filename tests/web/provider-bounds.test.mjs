import test from 'node:test';
import assert from 'node:assert/strict';
import {callModel} from '../../apps/web/core/providers.js';
const base={id:'account',model:'model',baseUrl:'https://backend.invalid/tenant/v1',stream:false};
const done=p=>p==='anthropic'?{stop_reason:'end_turn',content:[{type:'text',text:'ok'}]}:{choices:[{finish_reason:'stop',message:{content:'ok'}}]};
const packet=e=>'data: '+JSON.stringify(e)+'\n\n';
function toolBody(protocol,tools){return protocol==='anthropic'?{stop_reason:'tool_use',content:tools.map(c=>({type:'tool_use',id:c.id,name:c.name,input:c.input||{}}))}:{choices:[{finish_reason:'tool_calls',message:{content:'',tool_calls:tools.map(c=>({id:c.id,function:{name:c.name,arguments:c.args||'{}'}}))}}]};}
for(const protocol of ['openai','anthropic']){
 test(`${protocol} canonical endpoint reuses exact-scope state but rejects legacy pathless state`,async()=>{
  const provider={...base,protocol},r=await callModel({provider,messages:[],fetchImpl:async()=>Response.json(protocol==='anthropic'?{stop_reason:'end_turn',content:[{type:'thinking',thinking:'opaque-synthetic-marker',signature:'sig'},{type:'text',text:'answer'}]}:{choices:[{finish_reason:'stop',message:{content:'answer',reasoning_content:'opaque-synthetic-marker'}}]})});
  for(const legacy of [false,true]){const state={...r.providerState};if(legacy)delete state.endpoint;let body;await callModel({provider:{...provider,baseUrl:base.baseUrl+'/'+(protocol==='anthropic'?'messages':'chat/completions')},messages:[{role:'assistant',text:'answer',providerState:state}],fetchImpl:async(u,o)=>{body=o.body;return Response.json(done(protocol));}});assert.equal(body.includes('opaque-synthetic-marker'),!legacy);}
 });
 test(`${protocol} UTF8 argument chunks fail cumulatively and cancel the reader`,async()=>{
  const first='{"x":"'+'你'.repeat(12000),second='你'.repeat(12000)+'"}',events=protocol==='openai'?[{choices:[{delta:{tool_calls:[{index:0,id:'c',function:{name:'tool',arguments:first}}]}}]},{choices:[{delta:{tool_calls:[{index:0,function:{arguments:second}}]},finish_reason:'tool_calls'}]}]:[{type:'content_block_start',index:0,content_block:{type:'tool_use',id:'c',name:'tool',input:{}}},{type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:first}},{type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:second}}];let cancelled=false;
  await assert.rejects(callModel({provider:{...base,protocol,stream:true},messages:[],fetchImpl:async()=>new Response(new ReadableStream({start(c){for(const e of events)c.enqueue(new TextEncoder().encode(packet(e)));},cancel(){cancelled=true;}}))}),/size limit/i);assert.equal(cancelled,true);
 });
 test(`${protocol} nonstream limits tool bytes, count and identity before argument parse`,async()=>{
  const normal={id:'c',name:'tool',input:{x:'你'.repeat(22000)},args:JSON.stringify({x:'你'.repeat(22000)})};
  for(const tools of [[normal],Array.from({length:9},(_,i)=>({id:'c'+i,name:'tool'})),[{id:'c'.repeat(129),name:'tool'}],[{id:'c',name:'n'.repeat(129)}]])await assert.rejects(callModel({provider:{...base,protocol},messages:[],fetchImpl:async()=>Response.json(toolBody(protocol,tools))}),/limit/i);
 });
 test(`${protocol} streaming rejects excess tools and identities during accumulation`,async()=>{
  for(const variant of ['count','id','name']){const tools=variant==='count'?Array.from({length:9},(_,i)=>({id:'c'+i,name:'tool'})):[{id:variant==='id'?'c'.repeat(129):'c',name:variant==='name'?'n'.repeat(129):'tool'}];const events=tools.map((c,i)=>protocol==='anthropic'?{type:'content_block_start',index:i,content_block:{type:'tool_use',id:c.id,name:c.name,input:{}}}:{choices:[{delta:{tool_calls:[{index:i,id:c.id,function:{name:c.name,arguments:'{}'}}]}}]});
   await assert.rejects(callModel({provider:{...base,protocol,stream:true},messages:[],fetchImpl:async()=>new Response(events.map(packet).join(''))}),/limit/i);
  }
 });
}
test('Anthropic initial thinking and redacted blocks are bounded in both response modes',async()=>{
 for(const type of ['thinking','redacted_thinking'])for(const stream of [false,true]){const block=type==='thinking'?{type,thinking:'你'.repeat(340000),signature:'sig'}:{type,data:'x'.repeat(1000100)};await assert.rejects(callModel({provider:{...base,protocol:'anthropic',stream},messages:[],fetchImpl:async()=>stream?new Response(packet({type:'content_block_start',index:0,content_block:block})):Response.json({stop_reason:'end_turn',content:[block]})}),/size limit/i);}
});
test('Anthropic thinking and signature accumulation share one aggregate byte budget',async()=>{const events=[{type:'content_block_start',index:0,content_block:{type:'thinking',thinking:'x'.repeat(600000),signature:''}},{type:'content_block_delta',index:0,delta:{type:'signature_delta',signature:'y'.repeat(500000)}}];await assert.rejects(callModel({provider:{...base,protocol:'anthropic',stream:true},messages:[],fetchImpl:async()=>new Response(events.map(packet).join(''))}),/size limit/i);});
