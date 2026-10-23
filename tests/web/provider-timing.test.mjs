import test from 'node:test';
import assert from 'node:assert/strict';
import {callModel} from '../../apps/web/core/providers.js';
test('API timing measures UTF8 upload, headers, output and completion for both protocols',async()=>{
 for(const protocol of ['openai','anthropic'])for(const stream of [false,true]){
  let bytes=0;const result=await callModel({provider:{id:'p',protocol,model:'fixture',baseUrl:'https://fixture.invalid/v1',stream},messages:[{role:'user',text:'测试'}],fetchImpl:async(url,o)=>{bytes=new TextEncoder().encode(o.body).length;await new Promise(r=>setTimeout(r,5));if(!stream)return Response.json(protocol==='openai'?{choices:[{message:{content:'OK'},finish_reason:'stop'}]}:{content:[{type:'text',text:'OK'}],stop_reason:'end_turn'});const events=protocol==='openai'?[{choices:[{delta:{content:'OK'},finish_reason:'stop'}]},'[DONE]']:[{type:'content_block_delta',delta:{type:'text_delta',text:'OK'}},{type:'message_delta',delta:{stop_reason:'end_turn'}},{type:'message_stop'}];return new Response(new ReadableStream({async start(c){await new Promise(r=>setTimeout(r,5));c.enqueue(new TextEncoder().encode(events.map(e=>'data: '+(typeof e==='string'?e:JSON.stringify(e))+'\n\n').join('')));c.close();}}));}});
  assert.equal(result.text,'OK');assert.equal(result.timing.requestBytes,bytes);assert.equal(result.timing.requestCount,1);assert.equal(result.timing.transport,protocol==='openai'?'openai-chat':'anthropic-messages');assert.ok(result.timing.responseHeadersMs>=3);assert.ok(result.timing.firstEventMs>=result.timing.responseHeadersMs);assert.ok(result.timing.firstContentMs>=result.timing.firstEventMs);assert.ok(result.timing.totalMs>=result.timing.responseHeadersMs+result.timing.streamMs-1);
 }
});
