import test from 'node:test';
import assert from 'node:assert/strict';
import {localProbeURL,permissionSnapshot,probe,foregroundProbe,backgroundProbe} from '../../apps/web/diagnostics/lna-core.js';
const endpoint='http://igent.local';
function fixture(events=[]){return async(url,options)=>{events.push({path:new URL(url).pathname,options});return Response.json(options.method==='POST'?{...JSON.parse(options.body),phoneInputSent:false}:{boardId:'test-board'});};}
test('LNA begins first fetch before any permission query and uses only read-only probe routes',async()=>{
 const order=[],calls=[],fetchImpl=fixture(calls),result=await foregroundProbe(endpoint,{fetchImpl:(...args)=>{order.push('fetch');return fetchImpl(...args);},permissions:{query:async()=>{order.push('permission');throw new TypeError('unsupported');}}});
 assert.equal(order[0],'fetch');assert.equal(result.passed,true);assert.ok(result.permissions.every(x=>x.supported===false));assert.deepEqual(calls.map(x=>x.path),['/v1/identity','/v1/identity','/v1/probe']);assert.equal(calls[0].options.targetAddressSpace,'local');assert.equal(calls[1].options.targetAddressSpace,undefined);assert.equal(calls[2].options.targetAddressSpace,'local');assert.equal(calls[2].options.method,'POST');assert.ok(calls.every(x=>x.options.credentials==='omit'&&x.options.redirect==='error'));
});
test('explicit local requests can prove connectivity even when default fetch is blocked',async()=>{
 const next=fixture(),result=await foregroundProbe(endpoint,{fetchImpl:(url,options)=>options.targetAddressSpace?next(url,options):Promise.reject(new TypeError('blocked'))});assert.equal(result.tests[1].passed,false);assert.equal(result.passed,true);
});
test('POST must echo its nonce and confirm no input; HTTP or malformed response is a failed probe',async()=>{
 for(const data of [{probe:true,nonce:'wrong',phoneInputSent:false},{probe:true,nonce:'test',phoneInputSent:true},{probe:false,nonce:'test',phoneInputSent:false}])assert.equal((await probe(endpoint,{method:'POST',nonce:'test',fetchImpl:async()=>Response.json(data)})).passed,false);
 assert.equal((await probe(endpoint,{fetchImpl:async()=>Response.json({boardId:'ok'},{status:403})})).passed,false);
 assert.equal((await probe(endpoint,{fetchImpl:async()=>Response.json({hello:'unrelated'})})).passed,false);
 assert.equal((await probe(endpoint,{fetchImpl:async()=>new Response('x'.repeat(16385))})).passed,false);
});
test('background is finite, detects foreground-only evidence and stops after the first failure',async()=>{
 let count=0;const failed=await backgroundProbe(endpoint,{delay:async()=>{},visibility:()=> 'hidden',fetchImpl:async()=>{count++;return count<3?Response.json({boardId:'board'}):Promise.reject(Error('network lost'));}});assert.equal(count,3);assert.equal(failed.tests.length,3);assert.equal(failed.passed,false);
 const calls=[],passed=await backgroundProbe(endpoint,{delay:async()=>{},visibility:()=> 'hidden',fetchImpl:fixture(calls)});assert.equal(passed.passed,true);assert.equal(passed.allRequestedInBackground,true);assert.equal(calls.length,5);assert.ok(calls.every(x=>x.path==='/v1/identity'&&x.options.method==='GET'));
 const foreground=await backgroundProbe(endpoint,{delay:async()=>{},visibility:()=> 'visible',fetchImpl:fixture()});assert.equal(foreground.passed,true);assert.equal(foreground.allRequestedInBackground,false);
});
test('cancelled background does not issue requests; URLs cannot target public or control paths',async()=>{
 const controller=new AbortController();controller.abort();let calls=0;await assert.rejects(backgroundProbe(endpoint,{signal:controller.signal,delay:async()=>{},fetchImpl:async()=>{calls++;}}));assert.equal(calls,0);
 for(const value of ['https://igent.local','http://igent.cc','http://igent.local/v1/pair','http://user:pass@igent.local','http://igent.local?x=1'])assert.throws(()=>localProbeURL(value));assert.equal(localProbeURL('http://192.168.0.107:18947'),'http://192.168.0.107:18947');
 assert.deepEqual(await permissionSnapshot({query:async()=>({state:'granted'})}),[{name:'local-network',supported:true,state:'granted'},{name:'loopback-network',supported:true,state:'granted'}]);
});

test('a stalled permissions query is reported independently and never hangs diagnostic completion',async()=>{
 const result=await permissionSnapshot({query:()=>new Promise(()=>{})},5);assert.ok(result.every(row=>row.supported===null&&row.errorName==='TimeoutError'));
});
