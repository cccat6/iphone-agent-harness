import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {DeviceWindowTransport} from '../../apps/web/core/device-window.js';

const origin='http://review-r2.local',site='https://igent.cc';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const identity=()=>Response.json({boardId:'review-board',bootId:'review-boot'});

// Actual transport and firmware JavaScript, synthetic fetch and browser events.
// This fixture makes no network requests and does not establish Safari behavior.
async function fixture(t,{foreground=false,holdFirst=false}={}){
 const source=await readFile(new URL('../../firmware/IPhoneAutomationHarness/src/LanBridgePage.h',import.meta.url),'utf8');
 const parts=[...source.matchAll(/R"HTML\(([\s\S]*?)\)HTML"/g)].map(m=>m[1]);
 const script=(parts[0]+JSON.stringify(site)+parts[1]).match(/<script>([\s\S]*)<\/script>/)[1];
 const win=new EventTarget(),doc=new EventTarget(),handlers={},sent=[],calls=[];
 doc.visibilityState='visible';let bridge,launch,firstResolve,firstResponse,handler=()=>identity();
 const helperDoc={documentElement:{},visibilityState:foreground?'visible':'hidden',querySelector:()=>({}),addEventListener:(name,fn)=>handlers['doc:'+name]=fn};
 const child={closed:false,close(){this.closed=true;},postMessage(data,target){assert.equal(target,origin);queueMicrotask(()=>handlers.message({source:parent,origin:site,data}));}};
 const deliver=data=>{const event=new Event('message');Object.assign(event,{source:child,origin,data});win.dispatchEvent(event);};
 const parent={focus(){},postMessage(data,target){assert.equal(target,site);sent.push(data);if(holdFirst&&data.type==='iah-lan-response'&&!firstResponse){firstResponse=data;return;}queueMicrotask(()=>deliver(data));}};
 win.open=url=>{launch=()=>vm.runInNewContext(script,{navigator:{languages:['en'],language:'en'},window:{opener:parent},location:{hash:new URL(url).hash,pathname:'/harness-link'},history:{replaceState(){}},document:helperDoc,crypto,URLSearchParams,Uint8Array,TextEncoder,TextDecoder,AbortController,setTimeout,clearTimeout,addEventListener:(name,fn)=>handlers[name]=fn,fetch:async(path,options)=>{calls.push({path,options});if(holdFirst&&calls.length===1)return new Promise(resolve=>firstResolve=resolve);return handler(path,options);}});return child;};
 bridge=new DeviceWindowTransport({baseUrl:origin,windowRef:win,documentRef:doc,timeoutMs:1000,connectTimeoutMs:2000});
 t.after(()=>bridge.close());const opening=bridge.open();launch();await tick();
 return {bridge,opening,doc,helperDoc,handlers,parent,sent,calls,deliver,setHandler:fn=>handler=fn,resolveFirst:()=>firstResolve(identity()),deliverFirst:()=>deliver(firstResponse)};
}

test('independent LAN R2: visibility event queued during foreground probe retries real identity before ready',async t=>{
 const f=await fixture(t,{foreground:true,holdFirst:true});assert.equal(f.bridge.ready,false);
 // Finish the first fetch while visible, then change visibility before its
 // postMessage reaches the parent. This forces the probeRequested race path.
 f.resolveFirst();await tick();assert.equal(f.bridge.probing,true);
 f.helperDoc.visibilityState='hidden';f.handlers['doc:visibilitychange']();
 await tick();assert.equal(f.bridge.probeRequested,true);f.deliverFirst();
 await f.opening;assert.equal(f.bridge.ready,true);
 assert.equal(f.calls.length,2);assert.equal(f.sent.filter(m=>m.type==='iah-lan-response')[0].helperVisibility,'visible');
 assert.equal(f.sent.filter(m=>m.type==='iah-lan-response')[1].helperVisibility,'hidden');
});

test('independent LAN R2: eight in-flight requests bound the parent; overflow sends no ninth mutation',async t=>{
 const f=await fixture(t);await f.opening;const waiting=[];
 f.setHandler((path,options)=>new Promise((resolve,reject)=>{waiting.push(resolve);options.signal.addEventListener('abort',()=>reject(Error('abort')),{once:true});}));
 const requests=Array.from({length:8},()=>f.bridge.fetch(origin+'/v1/pair',{method:'POST',body:'{}'}));
 await tick();assert.equal(waiting.length,8);
 await assert.rejects(f.bridge.fetch(origin+'/v1/pair',{method:'POST',body:'{}'}),{code:'DEVICE_INVALID_ARGUMENT'});
 assert.equal(f.calls.filter(c=>c.path==='/v1/pair').length,8);
 waiting.forEach(resolve=>resolve(Response.json({accepted:true})));await Promise.all(requests);
 assert.equal(f.bridge.pending.size,0);assert.equal(f.bridge.ready,true);
});

test('independent LAN R2: helper separately rejects overflow, and mismatched response instance cannot settle request',async t=>{
 const f=await fixture(t);await f.opening;const waiting=[];
 f.setHandler((path,options)=>new Promise((resolve,reject)=>{waiting.push(resolve);options.signal.addEventListener('abort',()=>reject(Error('abort')),{once:true});}));
 const tasks=[];
 for(let i=0;i<9;i++)tasks.push(f.handlers.message({source:f.parent,origin:site,data:{type:'iah-lan-request',nonce:f.bridge.nonce,id:'helper-'+i,method:'GET',path:'/v1/identity',body:'',headers:{}}}));
 assert.equal(waiting.length,8);assert.ok(f.sent.some(m=>m.id==='helper-8'&&m.error==='busy'));
 waiting.splice(0).forEach(resolve=>resolve(identity()));await Promise.all(tasks);
 let settled=false;const request=f.bridge.fetch(origin+'/v1/identity').then(value=>{settled=true;return value;});await tick();
 const id=[...f.bridge.pending.keys()][0];f.deliver({type:'iah-lan-response',nonce:f.bridge.nonce,instance:'f'.repeat(32),id,status:200,body:'{}'});await tick();
 assert.equal(settled,false);assert.equal(f.bridge.pending.size,1);
 waiting[0](identity());assert.equal((await(await request).json()).boardId,'review-board');
});
