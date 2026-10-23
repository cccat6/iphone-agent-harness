import test from 'node:test';
import assert from 'node:assert/strict';
import {serveResponseSocket} from '../../apps/web/api/openai-relay.js';
class Socket extends EventTarget{
 sent=[];closed=[];accepted=false;
 accept(){this.accepted=true;}
 send(data){this.sent.push(data);}
 close(code,reason){this.closed.push({code,reason});}
 message(data){this.dispatchEvent(Object.assign(new Event('message'),{data}));}
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(fetchImpl){const browser=new Socket(),server=new Socket(),upstream=new Socket();let headers;
 const response=serveResponseSocket(new Request('https://igent.cc/api/openai/responses'),{fetchImpl:fetchImpl|| (async(url,o)=>{headers=o.headers;assert.equal(url,'https://api.openai.com/v1/responses');return {status:101,webSocket:upstream};}),pairFactory:()=>({0:browser,1:server}),upgrade:socket=>({socket})});
 return {browser,server,upstream,response,get headers(){return headers;},auth:()=>server.message(JSON.stringify({type:'iah.authenticate',authorization:'Bearer synthetic',sessionId:'iah:fixture'})),close:()=>server.dispatchEvent(new Event('close'))};
}
test('encrypted first-frame authentication forwards only to fixed endpoint and pipes messages both ways',async()=>{const f=fixture();try{assert.equal(f.response.socket,f.browser);f.auth();await tick();assert.equal(f.headers.get('authorization'),'Bearer synthetic');assert.equal(f.headers.get('session-id'),'iah:fixture');assert.equal(f.upstream.accepted,true);assert.deepEqual(JSON.parse(f.server.sent[0]),{type:'iah.ready'});f.server.message('{"type":"response.create"}');assert.equal(f.upstream.sent[0],'{"type":"response.create"}');f.upstream.message('{"type":"response.completed"}');assert.equal(f.server.sent.at(-1),'{"type":"response.completed"}');}finally{f.close();}assert.equal(f.upstream.closed.length,1);});
test('invalid authentication is rejected before any upstream request',async()=>{let calls=0;const f=fixture(async()=>{calls++;});f.server.message('{"type":"iah.authenticate","authorization":"secret"}');await tick();assert.equal(calls,0);assert.equal(f.server.closed.length,1);assert.equal(JSON.parse(f.server.sent[0]).status,401);});
test('client closure during upstream handshake closes late upstream socket',async()=>{let resolve;const f=fixture(()=>new Promise(r=>resolve=r));f.auth();f.close();resolve({status:101,webSocket:f.upstream});await tick();assert.equal(f.upstream.closed.length,1);assert.equal(f.upstream.accepted,false);});
test('upstream refusal and oversized messages close both channels without retaining a queue',async()=>{const f=fixture(async()=>({status:403}));f.auth();await tick();assert.equal(JSON.parse(f.server.sent[0]).status,403);assert.equal(f.server.closed.length,1);const g=fixture();g.auth();await tick();g.server.message('a'.repeat(16000001));assert.equal(g.upstream.sent.length,0);assert.equal(g.upstream.closed.length,1);});
test('browser idle keepalives are answered locally without sending inference requests upstream',async()=>{const f=fixture();try{f.auth();await tick();f.server.message('{"type":"iah.ping"}');assert.equal(f.upstream.sent.length,0);assert.deepEqual(JSON.parse(f.server.sent.at(-1)),{type:'iah.pong'});}finally{f.close();}});
