import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {DeviceWindowTransport} from '../../apps/web/core/device-window.js';
import {createDevicePanel} from '../../apps/web/ui/device-panel.js';
import {openStore} from '../../apps/web/core/store.js';
import {createDeviceSetupLink,takeDeviceSetupLink} from '../../apps/web/core/device-setup.js';
import {mountUsbSetup} from '../../apps/web/ui/usb-setup.js';
import {DEVICE_MESSAGES} from '../../apps/web/locales/device.js';
import {getLocale} from '../../apps/web/i18n.js';

const endpoint='http://review-r1.local',harnessOrigin='https://igent.cc';
const next=()=>new Promise(resolve=>setImmediate(resolve));
const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

// Runs the actual firmware script against the actual browser transport. All
// HTTP responses are synthetic; this exercises neither radio nor browser policy.
async function bridgeFixture(t){
 const file=await readFile(new URL('../../firmware/IPhoneAutomationHarness/src/LanBridgePage.h',import.meta.url),'utf8');
 const parts=[...file.matchAll(/R"HTML\(([\s\S]*?)\)HTML"/g)].map(m=>m[1]);
 const script=(parts[0]+JSON.stringify(harnessOrigin)+parts[1]).match(/<script>([\s\S]*)<\/script>/)[1];
 const main=new EventTarget(),doc=new EventTarget(),handlers={},calls=[],fromParent=[],fromHelper=[];
 doc.visibilityState='visible';let bridge,readyScript,disconnected=0,handler=()=>Response.json({boardId:'review-board',bootId:'review-boot'});
 const child={closed:false,close(){this.closed=true;},postMessage(data,origin){assert.equal(origin,endpoint);fromParent.push(data);queueMicrotask(()=>handlers.message({data,source:parent,origin:harnessOrigin}));}};
 const parent={focus(){},postMessage(data,origin){assert.equal(origin,harnessOrigin);fromHelper.push(data);queueMicrotask(()=>{const event=new Event('message');Object.assign(event,{data,source:child,origin:endpoint});main.dispatchEvent(event);});}};
 const helperDoc={documentElement:{},visibilityState:'hidden',querySelector:()=>({}),addEventListener:(name,fn)=>{handlers['doc:'+name]=fn;}};
 main.open=(url)=>{readyScript=()=>vm.runInNewContext(script,{navigator:{languages:['en'],language:'en'},window:{opener:parent},location:{hash:new URL(url).hash,pathname:'/harness-link'},history:{replaceState(){}},document:helperDoc,crypto,URLSearchParams,Uint8Array,TextEncoder,TextDecoder,AbortController,setTimeout,clearTimeout,addEventListener:(name,fn)=>{handlers[name]=fn;},fetch:async(path,options)=>{calls.push({path,options});return handler(path,options);}});return child;};
 bridge=new DeviceWindowTransport({baseUrl:endpoint,windowRef:main,documentRef:doc,timeoutMs:300,connectTimeoutMs:1000,onDisconnect:()=>{disconnected++;}});
 t.after(()=>bridge.close());const opening=bridge.open();readyScript();await opening;
 return {bridge,child,handlers,parent,calls,fromParent,fromHelper,helperDoc,setHandler:fn=>{handler=fn;},get disconnected(){return disconnected;}};
}

test('independent LAN R1: actual helper and transport round-trip only an exact scoped request',async t=>{
 const f=await bridgeFixture(t);assert.equal(f.bridge.ready,true);
 const identity=await(await f.bridge.fetch(endpoint+'/v1/identity')).json();assert.equal(identity.boardId,'review-board');
 f.setHandler((path,options)=>{assert.equal(path,'/v1/pair');assert.equal(options.headers['X-Harness-Window'],'1');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');return Response.json({accepted:true});});
 assert.equal((await(await f.bridge.fetch(endpoint+'/v1/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json()).accepted,true);
 const before=f.calls.length,base={type:'iah-lan-request',nonce:f.bridge.nonce,id:'forged-request',method:'POST',path:'/v1/pair',headers:{},body:'{}'};
 for(const event of [{source:{},origin:harnessOrigin,data:base},{source:f.parent,origin:'https://other.invalid',data:base},{source:f.parent,origin:harnessOrigin,data:{...base,nonce:'d'.repeat(32)}},{source:f.parent,origin:harnessOrigin,data:{...base,path:'/configure'}},{source:f.parent,origin:harnessOrigin,data:{...base,headers:{'x-harness-window':'1'}}}])await f.handlers.message(event);
 assert.equal(f.calls.length,before);
});

test('independent LAN R1: abort reaches actual helper fetch without retry or late-response resurrection',async t=>{
 const f=await bridgeFixture(t),entered=defer();let requestSignal;
 f.setHandler((path,{signal})=>new Promise((resolve,reject)=>{requestSignal=signal;entered.resolve();signal.addEventListener('abort',()=>reject(new Error('synthetic abort')),{once:true});}));
 const abort=new AbortController(),pending=f.bridge.fetch(endpoint+'/v1/pair',{method:'POST',body:'{}',signal:abort.signal});
 await entered.promise;abort.abort();await assert.rejects(pending,{code:'DEVICE_REQUEST_CANCELLED'});await next();
 assert.equal(requestSignal.aborted,true);assert.equal(f.calls.filter(c=>c.path==='/v1/pair').length,1);assert.equal(f.bridge.pending.size,0);
 assert.equal(f.fromParent.filter(m=>m.type==='iah-lan-cancel').length,1);
 f.setHandler(()=>Response.json({ok:true}));assert.equal((await(await f.bridge.fetch(endpoint+'/v1/identity')).json()).ok,true);
});

test('independent LAN R1: helper pagehide aborts pending work and disconnects active transport once',async t=>{
 const f=await bridgeFixture(t),entered=defer();let requestSignal;
 f.setHandler((path,{signal})=>new Promise((resolve,reject)=>{requestSignal=signal;entered.resolve();signal.addEventListener('abort',()=>reject(new Error('synthetic abort')),{once:true});}));
 const pending=f.bridge.fetch(endpoint+'/v1/pair',{method:'POST',body:'{}'});await entered.promise;f.handlers.pagehide();await assert.rejects(pending);await next();
 assert.equal(requestSignal.aborted,true);assert.equal(f.bridge.closed,true);assert.equal(f.bridge.ready,false);assert.equal(f.disconnected,1);assert.equal(f.calls.filter(c=>c.path==='/v1/pair').length,1);
});

test('independent LAN R1: actual helper bounds UTF-8 bytes and rejects malformed UTF-8 before returning JSON',async t=>{
 const f=await bridgeFixture(t);
 for(const bytes of [new TextEncoder().encode('界'.repeat(87382)),new Uint8Array([0xc3,0x28])]){
  f.setHandler(()=>new Response(bytes));await assert.rejects(f.bridge.fetch(endpoint+'/v1/identity'),{code:'DEVICE_WINDOW_REQUEST_FAILED'});
  assert.equal(f.bridge.pending.size,0);assert.equal(f.fromHelper.at(-1).error,'connection_failed');
 }
});

function patch(t,key,value){const old=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});t.after(()=>old?Object.defineProperty(globalThis,key,old):delete globalThis[key]);}
test('independent LAN R1: panel saves bridge information before RTC opens and cancels pending allocation on close',async t=>{
 const fields=new Map(),field=selector=>{if(!fields.has(selector))fields.set(selector,{value:'',checked:false,dataset:{},classList:{toggle(){}},addEventListener(){},replaceChildren(){},append(){}});return fields.get(selector);};
 const root={isConnected:true,querySelector:field,querySelectorAll:()=>[],closest:()=>null},holder={querySelector:()=>root,contains:element=>element===root};
 patch(t,'document',{documentElement:{},querySelector:()=>({}),createElement:()=>({}),head:{append(){}}});
 const store=await openStore({memory:true}),allocation=defer(),entered=defer(),order=[];let factories=0,closed=0;
 await store.saveSettings({deviceEndpoint:endpoint,deviceRTC:{ip:'192.168.0.125',port:18948,fingerprint:'a'.repeat(64)}});
 const save=store.saveSettings.bind(store);store.saveSettings=async value=>{order.push('information');return save(value);};
 store.ensureDeviceClientId=()=>{order.push('storage');entered.resolve();return allocation.promise;};
 const panel=createDevicePanel({store,capture:{active:false},openPanel(){},getPanelRoot:()=>holder,clientFactory:()=>{factories++;throw Error('no client expected');},bridgeFactory:()=>({open({signal}){order.push('rtc');return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{closed++;reject(Error('cancelled'));},{once:true}));},close(){}})});
 t.after(()=>panel.dispose());await panel.open();field('[data-address]').value=endpoint;
 const pending=field('[data-pair]').onclick();await entered.promise;assert.deepEqual(order,['information','rtc','storage']);
 panel.dispose();allocation.resolve('review-client');await pending;assert.equal(closed,1);assert.equal(factories,0);assert.equal(panel.getDevice(),null);
});

test('independent LAN R1: legacy HTTPS USB info stays readable without advertising an unusable return link',async t=>{
 const info={boardId:'review-board',apSsid:'synthetic',apPassword:'synthetic',setupPassword:'d'.repeat(64),httpsUrl:'https://review-r1.local',caReady:true,publicKeyFingerprint:'a'.repeat(64)};
 assert.throws(()=>createDeviceSetupLink(info),/DEVICE_SETUP_UPGRADE_REQUIRED/);
 const fields=new Map(),container={isConnected:true,dataset:{},innerHTML:'',querySelector(selector){if(!fields.has(selector))fields.set(selector,{});return fields.get(selector);},replaceChildren(){}};
 const view=mountUsbSetup({container,canRead:()=>true,readSetup:async()=>info});t.after(()=>view.dispose());await container.querySelector('[data-usb-read]').onclick();
 assert.ok(container.innerHTML.includes(info.httpsUrl));assert.ok(container.innerHTML.includes(DEVICE_MESSAGES[getLocale()].upgradeFirmware));assert.ok(!container.innerHTML.includes(DEVICE_MESSAGES[getLocale()].setupLink));
});

test('independent LAN R1: malformed or legacy incoming setup fragments remain available after rejection',()=>{
 const legacy=btoa(JSON.stringify({v:1,url:'https://review-r1.local',id:'review-board',owner:'e'.repeat(64)})).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
 for(const fragment of ['device=malformed','device='+legacy]){
  let erased=false;const location=new URL(harnessOrigin+'/?lang=en#'+fragment);
  assert.throws(()=>takeDeviceSetupLink(location,{state:null,replaceState(state,title,url){assert.equal(url,'/?lang=en');erased=true;}}));assert.equal(erased,false);assert.equal(location.hash,'#'+fragment);
 }
});
