import test from 'node:test';
import assert from 'node:assert/strict';
import {serveOpenAIRelay} from '../../apps/web/api/openai-relay.js';
import standalone from '../../apps/web/api/openai-relay-worker.js';
const origin='https://igent.cc',prefix=origin+'/api/openai';
function req(path='models',options={}){return new Request(prefix+'/'+path,{...options,headers:{Origin:origin,Authorization:'Bearer synthetic-access',...options.headers},...(options.body?{duplex:'half'}:{})});}
test('only fixed model routes, allowed origins and expected methods can reach upstream',async()=>{
 let calls=0;const options={fetchImpl:async()=>{calls++;return Response.json({models:[]});}};
 for(const request of [req('models?url=https://elsewhere.invalid'),req('token'),req('responses',{method:'GET'}),req('models',{headers:{Origin:'https://other.invalid'}}),req('models',{headers:{Origin:'null'}}),req('models',{headers:{Authorization:''}}),req('responses',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'})])assert.ok((await serveOpenAIRelay(request,options)).status>=400);
 assert.equal(calls,0);
 const preflight=await serveOpenAIRelay(req('responses',{method:'OPTIONS',headers:{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}}),options);assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);assert.equal(calls,0);
 assert.equal((await serveOpenAIRelay(req('responses',{method:'OPTIONS',headers:{'Access-Control-Request-Headers':'x-target-url'}}),options)).status,403);
});
test('catalog forwards only access authorization to the official URL and strips upstream cookies/cache headers',async()=>{
 let args;const r=await serveOpenAIRelay(req('models',{headers:{Cookie:'private-cookie','X-Private':'private'}}),{fetchImpl:async(url,options)=>{args={url,options};return Response.json({models:[{slug:'fixture',visibility:'list'}]},{headers:{'Set-Cookie':'private-cookie','Access-Control-Allow-Origin':'https://wrong.invalid','Cache-Control':'public,max-age=9999','X-Request-ID':'req-fixture','Retry-After':'5'}});}});
 assert.equal(args.url,'https://api.openai.com/v1/models');assert.deepEqual(Object.fromEntries(args.options.headers),{accept:'application/json','accept-encoding':'identity',authorization:'Bearer synthetic-access'});assert.equal(args.options.redirect,'manual');assert.equal(args.options.credentials,'omit');assert.equal(args.options.cache,'no-store');assert.equal(args.options.body,undefined);
 assert.equal(r.status,200);assert.equal(r.headers.get('set-cookie'),null);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('access-control-allow-origin'),origin);assert.equal(r.headers.get('x-request-id'),'req-fixture');assert.deepEqual(await r.json(),{models:[{slug:'fixture',visibility:'list'}]});
});
test('upload is passed as a stream and SSE bytes are delivered before completion with backpressure',async()=>{
 const upload=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{"store":false,"stream":true}'));c.close();}});const request=req('responses',{method:'POST',headers:{'Content-Type':'application/json'},body:upload});let send,receivedBody;
 const upstream=new ReadableStream({start(c){send=c;}},{highWaterMark:0});
 const response=await serveOpenAIRelay(request,{fetchImpl:async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.method,'POST');receivedBody=options.body;return new Response(upstream,{headers:{'Content-Type':'text/event-stream'}});}});
 assert.equal(receivedBody,request.body);assert.equal(request.bodyUsed,false);assert.equal(response.headers.get('content-type'),'text/event-stream');const reader=response.body.getReader();const first=reader.read();send.enqueue(new TextEncoder().encode('event: delta\ndata: first\n\n'));assert.match(new TextDecoder().decode((await first).value),/first/);send.enqueue(new TextEncoder().encode('event: done\n\n'));send.close();assert.match(new TextDecoder().decode((await reader.read()).value),/done/);assert.equal((await reader.read()).done,true);reader.releaseLock();await request.body.cancel();
});
test('redirects are never followed with user authorization',async()=>{
 let calls=0;const response=await serveOpenAIRelay(req(),{fetchImpl:async()=>{calls++;return new Response(null,{status:307,headers:{Location:'https://different.invalid'}});}});assert.equal(calls,1);assert.equal(response.status,502);assert.equal((await response.json()).error.code,'RELAY_UPSTREAM_REDIRECT');assert.equal(response.headers.get('location'),null);
});
test('upstream HTTP failure retains status and body without application persistence',async()=>{
 const r=await serveOpenAIRelay(req(),{fetchImpl:async()=>Response.json({error:{code:'invalid_token'}},{status:401})});assert.equal(r.status,401);assert.deepEqual(await r.json(),{error:{code:'invalid_token'}});
});
test('downstream cancel aborts the outgoing request and cancels upstream stream',async()=>{
 let signal,cancelled=false;const response=await serveOpenAIRelay(req(),{fetchImpl:async(url,o)=>{signal=o.signal;return new Response(new ReadableStream({cancel(){cancelled=true;}},{highWaterMark:0}));}});await response.body.cancel();assert.equal(signal.aborted,true);assert.equal(cancelled,true);
});
test('upstream timeout before headers returns a fixed 504 without raw exception details',async()=>{
 const r=await serveOpenAIRelay(req(),{timeoutMs:5,fetchImpl:async()=>new Promise(()=>{})});assert.equal(r.status,504);assert.equal((await r.json()).error.code,'RELAY_TIMEOUT');
});
test('request cancellation ends an idle response stream without waiting for more data',async()=>{
 const controller=new AbortController();let cancelled=false,signal;const response=await serveOpenAIRelay(req('models',{signal:controller.signal}),{fetchImpl:async(url,o)=>{signal=o.signal;return new Response(new ReadableStream({cancel(){cancelled=true;}},{highWaterMark:0}));}});controller.abort();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(signal.aborted,true);assert.equal(cancelled,true);await response.body.cancel();
});
test('self-hosted relay uses the configured origin without any storage binding',async t=>{
 t.mock.method(globalThis,'fetch',async()=>Response.json({models:[]}));
 const env=new Proxy({},{get(_,key){if(key==='ALLOWED_ORIGINS')return origin;throw Error('storage accessed');}});
 const response=await standalone.fetch(new Request('https://my-relay.example/api/openai/models',{headers:{Origin:origin,Authorization:'Bearer synthetic-access'}}),env);assert.equal(response.status,200);await response.text();
});

test('same-origin GET without an Origin header still forwards the user bearer',async()=>{
 let calls=0;const response=await serveOpenAIRelay(new Request(prefix+'/models',{headers:{Authorization:'Bearer synthetic-access'}}),{fetchImpl:async()=>{calls++;return Response.json({models:[]});}});
 assert.equal(response.status,200);assert.equal(calls,1);assert.equal(response.headers.get('access-control-allow-origin'),null);await response.json();
 const missing=await serveOpenAIRelay(new Request(prefix+'/models'),{fetchImpl:async()=>assert.fail('missing bearer')});assert.equal(missing.status,401);
});

test('relay exposes header latency and validated provider duration while streaming unchanged',async()=>{
 for(const processing of ['12.5','12;desc="private"']){
  const response=await serveOpenAIRelay(req(),{fetchImpl:async()=>new Response('streamed bytes',{headers:{'openai-processing-ms':processing,'server-timing':'private;desc="upstream metadata"'}})});
  assert.match(response.headers.get('server-timing'),/^iah-upstream;dur=\d+(?:, iah-provider;dur=12\.5)?$/);assert.equal(response.headers.get('server-timing').includes('iah-provider'),processing==='12.5');assert.ok(response.headers.get('access-control-expose-headers').includes('Server-Timing'));assert.equal(await response.text(),'streamed bytes');
 }
});

test('subscription cache affinity forwards only a bounded stable session identifier',async()=>{
 let calls=0;const options={fetchImpl:async(_url,o)=>{calls++;assert.equal(o.headers.get('session-id'),'iah:session-fixture');assert.equal(o.headers.get('thread-id'),null);return Response.json({ok:true});}};
 const r=await serveOpenAIRelay(req('responses',{method:'POST',headers:{'Content-Type':'application/json','Session-ID':'iah:session-fixture','Thread-ID':'do-not-forward'},body:'{}'}),options);assert.equal(r.status,200);await r.text();
 const bad=await serveOpenAIRelay(req('responses',{method:'POST',headers:{'Content-Type':'application/json','Session-ID':'invalid id'},body:'{}'}),options);assert.equal(bad.status,400);assert.equal(calls,1);
 const preflight=await serveOpenAIRelay(req('responses',{method:'OPTIONS',headers:{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type,session-id'}}));assert.equal(preflight.status,204);
});
