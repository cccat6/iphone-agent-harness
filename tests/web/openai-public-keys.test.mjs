import test from 'node:test';
import assert from 'node:assert/strict';
import {serveOpenAIPublicKeys} from '../../apps/web/api/openai-public-keys.js';
import worker from '../../apps/web/worker.js';
const endpoint='https://igent.cc/api/openai/jwks';
const key={kid:'test-key',kty:'RSA',n:'a'.repeat(342),e:'AQAB',alg:'RS256',use:'sig'};
test('public key endpoint fetches only the fixed official URL without forwarding browser data',async()=>{
 let call;const result=await serveOpenAIPublicKeys(new Request(endpoint,{headers:{Origin:'https://selfhost.example','X-Extra':'ignored'}}),{fetchImpl:async(url,options)=>{call={url,options};return Response.json({keys:[{...key,key_ops:['verify'],extra:'not forwarded'}]});}});
 assert.equal(result.status,200);assert.equal(result.headers.get('access-control-allow-origin'),'*');assert.equal(result.headers.get('cache-control'),'no-store');
 assert.equal(call.url,'https://auth.openai.com/.well-known/jwks.json');assert.deepEqual(call.options.headers,{Accept:'application/json'});assert.equal(call.options.credentials,'omit');assert.equal(call.options.redirect,'error');assert.equal(call.options.body,undefined);
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
  const result=await serveOpenAIPublicKeys(new Request(endpoint),{fetchImpl:async()=>Response.json(value)});assert.equal(result.status,502);assert.deepEqual(await result.json(),{error:'public_keys_unavailable'});
 }
 const failed=await serveOpenAIPublicKeys(new Request(endpoint),{fetchImpl:async()=>new Response('upstream private diagnostic',{status:503})});assert.equal(failed.status,502);assert.doesNotMatch(await failed.text(),/private diagnostic/);
});
test('streaming public-key responses are bounded even without Content-Length',async()=>{
 let cancelled=false;const response=new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(40000));},cancel(){cancelled=true;}}));
 const result=await serveOpenAIPublicKeys(new Request(endpoint),{fetchImpl:async()=>response});assert.equal(result.status,502);assert.equal(cancelled,true);
 const announced=await serveOpenAIPublicKeys(new Request(endpoint),{fetchImpl:async()=>new Response('{}',{headers:{'Content-Length':'1000000'}})});assert.equal(announced.status,502);
});
test('public-key route is independent of community storage and static assets',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({keys:[key]});});
 const env=new Proxy({},{get(){throw Error('Public keys must not access private state or bindings');}});
 const result=await worker.fetch(new Request(endpoint),env,{});assert.equal(result.status,200);assert.equal(calls,1);
});
