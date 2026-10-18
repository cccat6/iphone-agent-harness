import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {DeviceWindowTransport} from '../../apps/web/core/device-window.js';

const origin='https://igent.cc',endpoint='http://igent.local',nonce='1'.repeat(32);
const source=await readFile(new URL('../../firmware/IPhoneAutomationHarness/src/LanBridgePage.h',import.meta.url),'utf8');
const parts=[...source.matchAll(/R"HTML\(([\s\S]*?)\)HTML"/g)].map(m=>m[1]);
const script=(parts[0]+JSON.stringify(origin)+parts[1]).match(/<script>([\s\S]*)<\/script>/)[1];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function helper({hash='#nonce='+nonce,opener=null,fetchImpl=async()=>Response.json({boardId:'board',bootId:'boot'})}={}){
 const handlers={},elements=new Map(),calls=[];
 const element=key=>{if(!elements.has(key))elements.set(key,{});return elements.get(key);};
 const location={hash,pathname:'/harness-link'};let historyWrites=0;
 const document={documentElement:{},visibilityState:'hidden',querySelector:element,addEventListener:(key,fn)=>{handlers['doc:'+key]=fn;}};
 const context={navigator:{languages:['zh-CN']},window:{opener},location,history:{replaceState(){historyWrites++;}},document,crypto,URLSearchParams,Uint8Array,TextEncoder,TextDecoder,AbortController,setTimeout,clearTimeout,addEventListener:(key,fn)=>{handlers[key]=fn;},fetch:async(...args)=>{calls.push(args);return fetchImpl(...args);}};
 vm.runInNewContext(script,context);
 return {handlers,element,location,calls,document,get historyWrites(){return historyWrites;}};
}

test('actual helper without opener binds only a matching Harness hello, then pins that source',async()=>{
 const f=helper(),sent=[],parent={postMessage(data,target){assert.equal(target,origin);sent.push(data);}},other={postMessage(){throw Error('wrong source');}};
 const hello={type:'iah-lan-connect',nonce};
 for(const event of [{source:parent,origin:'https://other.invalid',data:hello},{source:parent,origin,data:{...hello,nonce:'2'.repeat(32)}},{source:null,origin,data:hello}])await f.handlers.message(event);
 assert.equal(sent.length,0);assert.match(f.element('#status').textContent,/正在等待/);
 await f.handlers.message({source:parent,origin,data:hello});assert.equal(sent[0].type,'iah-lan-ready');assert.match(f.element('#status').textContent,/本地通道已准备/);assert.equal(f.element('#back').hidden,true);
 await f.handlers.message({source:other,origin,data:hello});
 const request={type:'iah-lan-request',nonce,id:'one',method:'GET',path:'/v1/identity',headers:{},body:''};
 await f.handlers.message({source:other,origin,data:request});assert.equal(f.calls.length,0);
 await f.handlers.message({source:parent,origin,data:request});assert.equal(f.calls.length,1);assert.equal(sent.at(-1).status,200);
 assert.equal(f.historyWrites,0);assert.equal(f.location.hash,'#nonce='+nonce);
 const reloaded=helper({hash:f.location.hash});await reloaded.handlers.message({source:parent,origin,data:hello});assert.notEqual(sent.at(-1).instance,sent[0].instance);
});

test('missing nonce cannot be supplied later by a message; the fallback is a real new-tab Harness link',async()=>{
 const f=helper({hash:''});assert.equal(f.element('#back').hidden,false);assert.equal(f.element('#back').href,origin);assert.match(parts[0],/id="back" hidden target="_blank" rel="noopener noreferrer"/);
 await f.handlers.message({source:{postMessage(){throw Error('should not bind');}},origin,data:{type:'iah-lan-connect',nonce}});assert.equal(f.calls.length,0);assert.match(f.element('#status').textContent,/没有连接信息/);
});

test('parent retries a lost initial hello and connects to the actual openerless helper',async t=>{
 const main=new EventTarget(),doc=new EventTarget(),sent=[];doc.visibilityState='visible';let page,transport,url;
 const parent={postMessage(data,target){assert.equal(target,origin);queueMicrotask(()=>{const event=new Event('message');Object.assign(event,{source:child,origin:endpoint,data});main.dispatchEvent(event);});}};
 const child={closed:false,close(){this.closed=true;},postMessage(data,target){assert.equal(target,endpoint);sent.push(data);if(page)queueMicrotask(()=>page.handlers.message({source:parent,origin,data}));}};
 main.open=value=>{url=value;return child;};transport=new DeviceWindowTransport({baseUrl:endpoint,windowRef:main,documentRef:doc,helloIntervalMs:20,connectTimeoutMs:400,timeoutMs:200});t.after(()=>transport.close());
 const opening=transport.open();assert.equal(sent[0].type,'iah-lan-connect');await sleep(25);page=helper({hash:new URL(url).hash});await opening;
 assert.equal(transport.ready,true);assert.ok(sent.filter(m=>m.type==='iah-lan-connect').length>=2);assert.equal(transport.helloTimer,undefined);
 const count=sent.length;await sleep(50);assert.equal(sent.length,count,'successful handshake has no recurring hello');
 doc.dispatchEvent(new Event('visibilitychange'));await tick();assert.equal(sent.at(-1).type,'iah-lan-connect');
 const reloaded=helper({hash:page.location.hash});page=reloaded;doc.dispatchEvent(new Event('visibilitychange'));await tick();assert.equal(transport.closed,true,'new helper instance invalidates old session');
 assert.equal(sent.filter(m=>m.type==='iah-lan-request'&&m.method==='POST').length,0);
});

test('connection cancellation and deadline both stop handshake retries',async()=>{
 for(const cancel of [false,true]){
  const main=new EventTarget(),doc=new EventTarget(),messages=[];doc.visibilityState='visible';const child={closed:false,close(){this.closed=true;},postMessage:data=>messages.push(data)};main.open=()=>child;
  const transport=new DeviceWindowTransport({baseUrl:endpoint,windowRef:main,documentRef:doc,helloIntervalMs:20,connectTimeoutMs:55});const controller=new AbortController(),opening=transport.open({signal:controller.signal});if(cancel)controller.abort();
  await assert.rejects(opening,{code:cancel?'DEVICE_REQUEST_CANCELLED':'DEVICE_WINDOW_NOT_READY'});const count=messages.length;await sleep(50);doc.dispatchEvent(new Event('visibilitychange'));assert.equal(messages.length,count);assert.equal(transport.helloTimer,undefined);assert.equal(child.closed,true);
 }
});
