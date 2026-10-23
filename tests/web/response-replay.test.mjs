import test from 'node:test';
import assert from 'node:assert/strict';
import {warmupReplay} from '../../apps/web/core/response-replay.js';
const events=async function*(body){yield JSON.parse(await new Response(body).text());};
test('bounded warmups preserve every input and tool pair without inference or server storage',async()=>{
 const messages=[{role:'user',text:'a'.repeat(100)},{role:'assistant',toolCalls:[{id:'c'}]},{role:'tool',toolCallId:'c',text:'b'.repeat(100)},{role:'user',text:'c'.repeat(100)}],sent=[];
 const result=await warmupReplay({messages,inputFor:async rows=>structuredClone(rows),payload:{model:'fixture',store:false,instructions:'fixed',tools:[]},batchBytes:160,events,socket:{request:async p=>{sent.push(p);return Response.json({type:'response.completed',response:{id:'resp_'+sent.length,status:'completed',output:[]}});}}});
 assert.equal(result.requests,3);assert.deepEqual(sent.flatMap(p=>p.input),messages);assert.equal(sent[1].input.length,2);assert.ok(sent.every(p=>p.generate===false&&p.store===false&&p.instructions==='fixed'));assert.equal(sent[0].previous_response_id,undefined);assert.equal(sent[2].previous_response_id,'resp_2');assert.equal(result.responseId,'resp_3');
});
test('warmup refuses failed or output-producing completions',async()=>{for(const response of [{type:'response.failed'},{type:'response.completed',response:{id:'resp_bad',status:'completed',output:[{type:'function_call'}]}}])await assert.rejects(warmupReplay({messages:[{role:'user',text:'x'}],inputFor:async x=>x,payload:{},events,socket:{request:async()=>Response.json(response)}}));});
test('cancelled replay does not send the next batch',async()=>{const controller=new AbortController();let calls=0;await assert.rejects(warmupReplay({messages:[{role:'user',text:'a'.repeat(100)},{role:'user',text:'b'.repeat(100)}],inputFor:async x=>x,payload:{},batchBytes:100,signal:controller.signal,events,socket:{request:async()=>{calls++;controller.abort();return Response.json({type:'response.completed',response:{id:'resp_first',status:'completed'}});}}}));assert.equal(calls,1);});
