import test from 'node:test';
import assert from 'node:assert/strict';
import {serveOpenAIRelay} from '../../apps/web/api/openai-relay.js';
const origin='https://igent.cc',endpoint=origin+'/api/openai/responses';
const request=(extra={})=>new Request(endpoint,{method:'POST',headers:{origin,authorization:'Bearer fixture-access','content-type':'application/json'},body:'{"input":"synthetic-only"}',...extra});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('independent relay: uploads the original body stream and only approved headers',async()=>{
 const input=request({headers:{origin,authorization:'Bearer fixture-access','content-type':'application/json',cookie:'never-forward', 'x-extra':'never-forward'}});let seen;
 const response=await serveOpenAIRelay(input,{fetchImpl:async(url,options)=>{seen={url,options};return new Response('ok',{headers:{'content-type':'text/event-stream','set-cookie':'never-return','x-secret':'never-return','x-request-id':'request-fixture'}});}});
 assert.equal(seen.url,'https://api.openai.com/v1/responses');assert.equal(seen.options.body,input.body);assert.equal(seen.options.redirect,'manual');assert.equal(seen.options.credentials,'omit');assert.deepEqual([...seen.options.headers.keys()].sort(),['accept','accept-encoding','authorization','content-type']);assert.equal(seen.options.headers.get('accept-encoding'),'identity');
 assert.equal(response.headers.get('set-cookie'),null);assert.equal(response.headers.get('x-secret'),null);assert.equal(response.headers.get('x-request-id'),'request-fixture');assert.equal(await response.text(),'ok');
});
test('independent relay: unrelated origins and unknown routes never invoke upstream',async()=>{
 let calls=0;const options={fetchImpl:async()=>{calls++;throw Error('unreachable');}};
 for(const input of [request({headers:{origin:'https://unrelated.example',authorization:'Bearer fixture-access','content-type':'application/json'}}),new Request(origin+'/api/openai/responses?target=https://elsewhere.example',{method:'POST',headers:{origin}}),new Request(origin+'/api/openai/token',{headers:{origin}})])assert.ok([403,404].includes((await serveOpenAIRelay(input,options)).status));
 assert.equal(calls,0);
});
test('independent relay: custom origin is exact and preflight cannot widen request headers',async()=>{
 const options={allowedOrigins:'https://custom.example'};
 const allowed=new Request(endpoint,{method:'OPTIONS',headers:{origin:'https://custom.example','access-control-request-method':'POST','access-control-request-headers':'authorization, content-type'}});
 assert.equal((await serveOpenAIRelay(allowed,options)).status,204);
 for(const headers of [{origin:'https://custom.example.evil','access-control-request-method':'POST'},{origin:'https://custom.example','access-control-request-method':'POST','access-control-request-headers':'Cookie'}])assert.equal((await serveOpenAIRelay(new Request(endpoint,{method:'OPTIONS',headers}),options)).status,403);
});
test('independent relay: preserves incremental bytes without reading the next body chunk early',async()=>{
 let pulls=0;const upstream=new ReadableStream({pull(c){pulls++;c.enqueue(new TextEncoder().encode('chunk-'+pulls));},cancel(){}},{highWaterMark:0});
 const response=await serveOpenAIRelay(request(),{fetchImpl:async()=>new Response(upstream)});assert.equal(pulls,0);
 const reader=response.body.getReader();assert.equal(new TextDecoder().decode((await reader.read()).value),'chunk-1');await wait(0);assert.equal(pulls,1);await reader.cancel();assert.equal(upstream.locked,false);
});
test('independent relay: browser cancellation aborts upstream and releases its response reader',async()=>{
 let upstreamSignal,cancels=0;const upstream=new ReadableStream({cancel(){cancels++;}},{highWaterMark:0});
 const response=await serveOpenAIRelay(request(),{fetchImpl:async(_url,options)=>{upstreamSignal=options.signal;return new Response(upstream);}});
 await response.body.cancel();assert.equal(upstreamSignal.aborted,true);assert.equal(cancels,1);assert.equal(upstream.locked,false);
});
test('independent relay: timed out pending fetch returns a fixed error and cancels a late body',async()=>{
 let resolve,cancels=0;const pending=new Promise(r=>{resolve=r;});
 const response=await serveOpenAIRelay(request(),{timeoutMs:5,fetchImpl:()=>pending});assert.equal(response.status,504);assert.equal((await response.json()).error.code,'RELAY_TIMEOUT');
 resolve(new Response(new ReadableStream({cancel(){cancels++;}})));await wait(0);assert.equal(cancels,1);
});
test('independent relay: redirect is never followed and upstream body is cancelled',async()=>{
 let calls=0,cancels=0;const response=await serveOpenAIRelay(request(),{fetchImpl:async()=>{calls++;return new Response(new ReadableStream({cancel(){cancels++;}}),{status:307,headers:{location:'https://different.example/'}});}});
 assert.equal(response.status,502);assert.equal((await response.json()).error.code,'RELAY_UPSTREAM_REDIRECT');assert.equal(calls,1);assert.equal(cancels,1);
});
test('independent relay: upstream errors remain streamed with their HTTP status',async()=>{
 const response=await serveOpenAIRelay(request(),{fetchImpl:async()=>new Response('{"error":"synthetic"}',{status:429,headers:{'retry-after':'2','content-type':'application/json'}})});
 assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'2');assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(await response.text(),'{"error":"synthetic"}');
});
test('independent relay: idle timeout releases the upstream reader before downstream reads',async()=>{
 let cancels=0;const upstream=new ReadableStream({cancel(){cancels++;}},{highWaterMark:0});
 const response=await serveOpenAIRelay(request(),{timeoutMs:5,fetchImpl:async()=>new Response(upstream)});
 await wait(15);
 try{assert.equal(cancels,1);assert.equal(upstream.locked,false);}finally{await response.body.cancel();}
});
test('independent relay: request abort releases an idle upstream reader immediately',async()=>{
 const controller=new AbortController();let cancels=0;const upstream=new ReadableStream({cancel(){cancels++;}},{highWaterMark:0});
 const response=await serveOpenAIRelay(request({signal:controller.signal}),{fetchImpl:async()=>new Response(upstream)});
 controller.abort();await wait(0);
 try{assert.equal(cancels,1);assert.equal(upstream.locked,false);}finally{await response.body.cancel();}
});
test('independent relay: main service binding forwards the original request and streaming response',async()=>{
 const {default:main}=await import('../../apps/web/worker.js');
 for(const [path,method]of [['models','GET'],['responses','POST']]){
  const input=new Request('https://igent.cc/api/openai/'+path,{method,headers:{origin,authorization:'Bearer fixture-access',...(method==='POST'?{'content-type':'application/json'}:{})},...(method==='POST'?{body:'{"input":"synthetic"}'}:{})});
  const upstream=new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2,3]));c.close();}}));let seen;
  const env=new Proxy({OPENAI_RELAY:{fetch:async received=>{seen=received;return upstream;}}},{get(target,key){if(key==='OPENAI_RELAY')return target[key];throw Error('Unrelated binding accessed');}});
  const result=await main.fetch(input,env,{});assert.equal(seen,input);assert.equal(input.bodyUsed,false);assert.equal(result,upstream);assert.deepEqual(new Uint8Array(await result.arrayBuffer()),new Uint8Array([1,2,3]));
 }
});
