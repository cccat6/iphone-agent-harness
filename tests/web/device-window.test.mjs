import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {DeviceWindowTransport,allowedDeviceWindowRequest} from '../../apps/web/core/device-window.js';
const baseUrl='http://harness-test.local',instance='a'.repeat(32),identity=JSON.stringify({boardId:'board-test',bootId:'boot-test'});
function fixture(t,{timeoutMs=1000}={}){
 const doc=new EventTarget();doc.visibilityState='visible';const win=new EventTarget(),messages=[],names=[];let bridge;let helperVisibility='visible',respond=true;
 const receive=data=>{const event=new Event('message');Object.assign(event,{source:child,origin:baseUrl,data});win.dispatchEvent(event);};
 const child={closed:false,close(){this.closed=true;},postMessage(data,target){assert.equal(target,baseUrl);messages.push(data);if(respond&&data.type==='iah-lan-request')queueMicrotask(()=>receive({type:'iah-lan-response',nonce:bridge.nonce,instance,id:data.id,status:200,body:identity,helperVisibility}));}};
 win.open=(url,name)=>{names.push(name);assert.ok(url.startsWith(baseUrl+'/harness-link#nonce='));return child;};
 bridge=new DeviceWindowTransport({baseUrl,windowRef:win,documentRef:doc,timeoutMs,connectTimeoutMs:1000});t.after(()=>bridge.close());
 return {bridge,doc,win,child,messages,names,receive,ready(){receive({type:'iah-lan-ready',nonce:bridge.nonce,instance});},set hidden(value){helperVisibility=value?'hidden':'visible';},set respond(value){respond=value;}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function connected(t,options){const f=fixture(t,options);f.hidden=true;const opening=f.bridge.open();f.ready();await opening;return f;}
test('readiness requires a round trip with the helper hidden and Harness visible',async t=>{
 const f=fixture(t);let completed=false;const opening=f.bridge.open().then(()=>{completed=true;});f.ready();await tick();assert.equal(completed,false);assert.equal(f.bridge.ready,false);
 f.hidden=true;f.ready();await opening;assert.equal(f.bridge.ready,true);assert.equal(f.messages.filter(m=>m.type==='iah-lan-request').length,2);
});
test('each connection opens a unique window name, never reuses a hash-only orphan',async t=>{
 const a=await connected(t),b=await connected(t);assert.notEqual(a.names[0],b.names[0]);assert.ok(a.names[0].endsWith(a.bridge.nonce));
});
test('wrong source, origin, nonce and reloaded helper do not authorize requests',async t=>{
 const f=fixture(t),opening=f.bridge.open();opening.catch(()=>{});
 const event=new Event('message');Object.assign(event,{source:f.child,origin:'http://other.local',data:{type:'iah-lan-ready',nonce:f.bridge.nonce,instance}});f.win.dispatchEvent(event);await tick();assert.equal(f.messages.filter(m=>m.type!=='iah-lan-connect').length,0);
 f.hidden=true;f.ready();await opening;f.receive({type:'iah-lan-ready',nonce:f.bridge.nonce,instance:'b'.repeat(32)});assert.equal(f.bridge.closed,true);await assert.rejects(f.bridge.fetch(baseUrl+'/v1/identity'),{code:'DEVICE_WINDOW_NOT_READY'});
});
test('closed or timed-out helper never silently replays a mutation',async t=>{
 const f=await connected(t,{timeoutMs:20});f.respond=false;
 await assert.rejects(f.bridge.fetch(baseUrl+'/v1/pair',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),{code:'DEVICE_WINDOW_TIMEOUT'});
 assert.equal(f.messages.filter(m=>m.type==='iah-lan-request'&&m.method==='POST').length,1);assert.equal(f.messages.filter(m=>m.type==='iah-lan-cancel').length,1);assert.equal(f.child.closed,true);
});
test('caller cancellation forwards one abort and never retries the request',async t=>{
 const f=await connected(t);f.respond=false;const controller=new AbortController();const pending=f.bridge.fetch(baseUrl+'/v1/pair',{method:'POST',body:'{}',signal:controller.signal});controller.abort();await assert.rejects(pending,{code:'DEVICE_REQUEST_CANCELLED'});assert.equal(f.messages.filter(m=>m.method==='POST').length,1);assert.equal(f.messages.filter(m=>m.type==='iah-lan-cancel').length,1);
});
test('only fixed methods, paths, origin and header names can cross the local window',async t=>{
 const f=await connected(t);for(const [method,path] of [['POST','/configure'],['GET','/v1/identity?x=1'],['DELETE','/v1/binding'],['POST','/v1/targets/a/../pair']])assert.equal(allowedDeviceWindowRequest(method,path),false);
 await assert.rejects(f.bridge.fetch('http://other.local/v1/identity'),{code:'DEVICE_INVALID_ARGUMENT'});await assert.rejects(f.bridge.fetch(baseUrl+'/v1/identity',{headers:{'x-harness-window':'1'}}),{code:'DEVICE_INVALID_ARGUMENT'});
 await assert.rejects(f.bridge.fetch(baseUrl+'/v1/pair',{method:'POST',body:'x'.repeat(8193)}),{code:'DEVICE_INVALID_ARGUMENT'});
 const response=await f.bridge.fetch(baseUrl+'/v1/identity');assert.deepEqual(await response.json(),JSON.parse(identity));
});
test('actual firmware helper script enforces origin, window, nonce and local route before fetch',async()=>{
 const file=await readFile(new URL('../../firmware/IPhoneAutomationHarness/src/LanBridgePage.h',import.meta.url),'utf8');const parts=[...file.matchAll(/R"HTML\(([\s\S]*?)\)HTML"/g)].map(m=>m[1]);const page=parts[0]+JSON.stringify('https://igent.cc')+parts[1];const script=page.match(/<script>([\s\S]*)<\/script>/)[1];
 const nonce='c'.repeat(32),handlers={},sent=[],calls=[],parent={postMessage:value=>sent.push(value),focus(){}};const document={documentElement:{},visibilityState:'hidden',querySelector:()=>({}),addEventListener:(name,handler)=>{handlers['doc:'+name]=handler;}};
 const context={navigator:{languages:['en'],language:'en'},window:{opener:parent},location:{hash:'#nonce='+nonce,pathname:'/harness-link'},history:{replaceState(){}},document,crypto,URLSearchParams,Uint8Array,TextEncoder,TextDecoder,AbortController,setTimeout,clearTimeout,addEventListener:(name,handler)=>{handlers[name]=handler;},fetch:async(path,options)=>{calls.push({path,options});return Response.json({ok:true});}};vm.runInNewContext(script,context);
 assert.equal(sent[0].type,'iah-lan-ready');const data={type:'iah-lan-request',nonce,id:'request-1',method:'POST',path:'/v1/pair',body:'{}',headers:{'content-type':'application/json'}};
 await handlers.message({source:parent,origin:'https://wrong.invalid',data});await handlers.message({source:{},origin:'https://igent.cc',data});await handlers.message({source:parent,origin:'https://igent.cc',data:{...data,path:'/configure'}});assert.equal(calls.length,0);
 await handlers.message({source:parent,origin:'https://igent.cc',data});assert.equal(calls.length,1);assert.equal(calls[0].path,'/v1/pair');assert.equal(calls[0].options.headers['X-Harness-Window'],'1');assert.equal(sent.at(-1).helperVisibility,'hidden');assert.equal(sent.at(-1).status,200);
});
