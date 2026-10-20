import test from 'node:test';
import assert from 'node:assert/strict';
import {serveOpenAIPublicKeys} from '../../apps/web/api/openai-public-keys.js';
import worker from '../../apps/web/worker.js';
const endpoint='https://igent.cc/api/openai/jwks';
const key={kid:'test-key',kty:'RSA',n:'a'.repeat(342),e:'AQAB',alg:'RS256',use:'sig'};
test('public key endpoint fetches only the fixed official URL without forwarding browser data',async()=>{
 let call;const result=await serveOpenAIPublicKeys(new Request(endpoint,{headers:{Origin:'https://selfhost.example','X-Extra':'ignored'}}),{fetchImpl:async(url,options)=>{call={url,options};return Response.json({keys:[{...key,key_ops:['verify'],extra:'not forwarded'}]});}});
 assert.equal(result.status,200);assert.equal(result.headers.get('access-control-allow-origin'),'*');assert.equal(result.headers.get('cache-control'),'no-store');
 assert.equal(call.url,'https://auth.openai.com/.well-known/jwks.json');assert.deepEqual(call.options.headers,{Accept:'application/json'});assert.equal(call.options.credentials,'omit');assert.equal(call.options.redirect,'manual');assert.equal(call.options.body,undefined);
 assert.deepEqual(await result.json(),{keys:[key]});
});
test('account credentials, caller URLs and POST bodies are rejected without any upstream call',async()=>{
 let calls=0;const options={fetchImpl:async()=>{calls++;throw Error('must not forward');}};
 for(const request of [new Request(endpoint+'?url=https://elsewhere.example'),new Request(endpoint,{headers:{authorization:'Bearer fixture'}}),new Request(endpoint,{headers:{cookie:'session=fixture'}}),new Request(endpoint,{method:'POST',body:'private content'})]){
  const result=await serveOpenAIPublicKeys(request,options);assert.ok([400,405].includes(result.status));
 }
 assert.equal(calls,0);assert.equal((await serveOpenAIPublicKeys(new Request(endpoint,{method:'OPTIONS'}),options)).status,204);assert.equal(calls,0);
});
test('malformed, private, duplicate and excessive key sets fail without echoing upstream content',async()=>{
 for(const value of [{keys:[]},{keys:[{...key,d:'private-material'}]},{keys:[key,key]},{keys:[{...key,alg:'none'}]},{keys:[{...key,n:'short'}]}, {keys:Array(33).fill(key)}]){
  const result=await serveOpenAIPublicKeys(new Request(endpoint),{fetchImpl:async()=>Response.json(value)});assert.equal(result.status,502);assert.deepEqual(await result.json(),{error:'public_keys_unavailable',phase:'body',upstreamStatus:200});
 }
 const failed=await serveOpenAIPublicKeys(new Request(endpoint),{fetchImpl:async()=>new Response('upstream private diagnostic',{status:503})});assert.equal(failed.status,502);assert.doesNotMatch(await failed.text(),/private diagnostic/);
});
test('streaming public-key responses are bounded even without Content-Length',async()=>{
 let cancelled=false;const response=new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(40000));},cancel(){cancelled=true;}}));
 const result=await serveOpenAIPublicKeys(new Request(endpoint),{fetchImpl:async()=>response});assert.equal(result.status,502);assert.equal(cancelled,true);
 const announced=await serveOpenAIPublicKeys(new Request(endpoint),{fetchImpl:async()=>new Response('{}',{headers:{'Content-Length':'1000000'}})});assert.equal(announced.status,502);
});
test('public key redirects are rejected without following their destination',async()=>{
 for(const status of [302,307]){
  let calls=0;
  const result=await serveOpenAIPublicKeys(new Request(endpoint),{fetchImpl:async(url,options)=>{
   calls++;assert.equal(url,'https://auth.openai.com/.well-known/jwks.json');assert.equal(options.redirect,'manual');
   return new Response(null,{status,headers:{Location:'https://elsewhere.example/keys'}});
  }});
  assert.equal(calls,1);assert.equal(result.status,502);assert.deepEqual(await result.json(),{error:'public_keys_unavailable',phase:'upstream',upstreamStatus:status});
 }
});
test('public-key route is independent of community storage and static assets',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({keys:[key]});});
 const env=new Proxy({},{get(_,key){if(key==='OPENAI_PUBLIC_KEYS')return undefined;throw Error('Public keys must not access private state or bindings');}});
 const result=await worker.fetch(new Request(endpoint),env,{});assert.equal(result.status,200);assert.equal(calls,1);
});

const now=1800000000000;
const envelope=(age=0,jwks={keys:[key]})=>JSON.stringify({version:1,fetchedAt:now-age,jwks});
test('fresh shared public keys serve without an upstream request or cache mutation',async()=>{
 let calls=0;
 const result=await serveOpenAIPublicKeys(new Request(endpoint),{now,keyCache:{
  get:async(name,options)=>{assert.equal(name,'openai-jwks-v1');assert.deepEqual(options,{type:'text',cacheTtl:30});return envelope(60000);},
  put:async()=>assert.fail('fresh cache must not be rewritten'),
 },fetchImpl:async()=>{calls++;throw Error('upstream unavailable');}});
 assert.equal(calls,0);assert.equal(result.status,200);assert.equal(result.headers.get('x-openai-jwks-source'),'cache');assert.deepEqual(await result.json(),{keys:[key]});
});
test('upstream outage uses bounded stale keys without extending their age',async()=>{
 for(const age of [15*60*1000,24*60*60*1000]){
  const result=await serveOpenAIPublicKeys(new Request(endpoint),{now,clock:()=>now,keyCache:{get:async()=>envelope(age),put:async()=>assert.fail('must not renew stale keys')},fetchImpl:async()=>new Response('blocked',{status:403})});
  assert.equal(result.status,200);assert.equal(result.headers.get('x-openai-jwks-source'),'stale');assert.equal(Number(result.headers.get('x-openai-jwks-age')),age/1000);
 }
 for(const cached of [envelope(24*60*60*1000+1),envelope(-60000),envelope(0,{keys:[{...key,d:'private'}]}),'invalid']){
  const result=await serveOpenAIPublicKeys(new Request(endpoint),{now,keyCache:{get:async()=>cached},fetchImpl:async()=>new Response(null,{status:503})});
  assert.equal(result.status,502);
 }
});
test('cache that expires while upstream is unavailable cannot be served after the deadline',async()=>{
 let elapsed=0;
 const result=await serveOpenAIPublicKeys(new Request(endpoint),{now,clock:()=>now+elapsed,keyCache:{get:async()=>envelope(86400000-1000)},fetchImpl:async()=>{elapsed=2000;return new Response(null,{status:503});}});
 assert.equal(result.status,502);
});
test('rotation refresh bypasses fresh cache and stores only validated public metadata',async()=>{
 const writes=[],next={...key,kid:'rotated-key'};
 const result=await serveOpenAIPublicKeys(new Request(endpoint+'?refresh=1'),{now,keyCache:{get:async()=>envelope(),put:async(...args)=>writes.push(args)},fetchImpl:async()=>Response.json({keys:[next]})});
 assert.equal(result.status,200);assert.deepEqual(await result.json(),{keys:[next]});assert.equal(writes.length,1);assert.equal(writes[0][0],'openai-jwks-v1');assert.deepEqual(JSON.parse(writes[0][1]),{version:1,fetchedAt:now,jwks:{keys:[next]}});assert.deepEqual(writes[0][2],{expirationTtl:86400});
 const unavailable=await serveOpenAIPublicKeys(new Request(endpoint+'?refresh=1'),{now,keyCache:{get:async()=>envelope()},fetchImpl:async()=>new Response(null,{status:403})});
 assert.equal(unavailable.status,502);
});
test('invalid upstream keys cannot replace last known public keys',async()=>{
 const result=await serveOpenAIPublicKeys(new Request(endpoint),{now,keyCache:{get:async()=>envelope(3600000),put:async()=>assert.fail('invalid key write')},fetchImpl:async()=>Response.json({keys:[{...key,d:'private'}]})});
 assert.equal(result.status,200);assert.deepEqual(await result.json(),{keys:[key]});
});
test('cache outages do not turn a successful official key response into a login failure',async()=>{
 const result=await serveOpenAIPublicKeys(new Request(endpoint),{now,keyCache:{get:async()=>{throw Error('read unavailable');},put:async()=>{throw Error('write unavailable');}},fetchImpl:async()=>Response.json({keys:[key]})});
 assert.equal(result.status,200);assert.equal(result.headers.get('x-openai-jwks-source'),'upstream');
});
test('background cache writes are tracked by the Worker lifetime',async()=>{
 const pending=[];
 const result=await serveOpenAIPublicKeys(new Request(endpoint),{now,keyCache:{get:async()=>null,put:async()=>{}},context:{waitUntil(p){pending.push(p);}},fetchImpl:async()=>Response.json({keys:[key]})});
 assert.equal(result.status,200);assert.equal(pending.length,1);await Promise.all(pending);
});
