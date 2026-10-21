import test from 'node:test';
import assert from 'node:assert/strict';
import {createDevicePanel} from '../../apps/web/ui/device-panel.js';
import {localizeError} from '../../apps/web/i18n.js';
import {openStore} from '../../apps/web/core/store.js';
import {createDeviceSetupLink,rememberDeviceSetupReturn,pendingDeviceSetupReturn,bridgeImportURL} from '../../apps/web/core/device-setup.js';
const endpoint='http://igent.local',rtc={ip:'192.168.0.125',port:18948,fingerprint:'ab'.repeat(32)};
async function fixture(t,{href='https://igent.cc/?session=active',store,failOpen=false,failRead=false}={}){
 const saved=new Map(['document','location','history','sessionStorage','addEventListener','removeEventListener'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const fields=new Map(),pageEvents=new Map(),cache=new Map(),calls=[],bridges=[];
 const field=key=>{if(!fields.has(key))fields.set(key,{value:'',checked:false,dataset:{},listeners:{},classList:{toggle(){}},addEventListener(event,callback){this.listeners[event]=callback;},replaceChildren(){},append(){},focus(){document.activeElement=this;}});return fields.get(key);};
 const root={isConnected:true,querySelector:field,querySelectorAll:()=>[],closest:()=>null},holder={querySelector:()=>root,contains:node=>node===root};
 Object.defineProperties(globalThis,{document:{configurable:true,value:{documentElement:{},querySelector:()=>({}),addEventListener(){},removeEventListener(){},createElement:()=>({}),head:{append(){}}}},location:{configurable:true,writable:true,value:new URL(href)},history:{configurable:true,value:{replaceState(state,title,url){globalThis.location=new URL(url,location.href);}}},sessionStorage:{configurable:true,value:{getItem:key=>cache.get(key)||null,setItem:(key,value)=>cache.set(key,value),removeItem:key=>cache.delete(key)}},addEventListener:{configurable:true,value:(name,callback)=>pageEvents.set(name,callback)},removeEventListener:{configurable:true,value:name=>pageEvents.delete(name)}});
 t.after(()=>{for(const[key,value]of saved)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];});
 store||=await openStore({memory:true});
 class Client{
  constructor(){this.baseUrl=new URL(endpoint);this.paired=false;this.identityVerified=false;this.bindingVerified=false;this.boardId='board';this.bootId='boot';this.clientId='client';}
  async identity(){calls.push('identity');if(failRead)throw Object.assign(new Error('DEVICE_IDENTITY_MISMATCH'),{code:'DEVICE_IDENTITY_MISMATCH'});return this.status();}
  async pair(){calls.push('pair');this.paired=this.identityVerified=true;}
  async getBinding(){calls.push('binding');return {targets:[]};}
  async pinIdentity(){this.identityVerified=true;}
  restoreCredentials(){this.paired=true;}
  exportCredentials(){return {format:'fixture',baseUrl:endpoint,clientId:'client',token:'local',expectedFingerprint:'c'.repeat(64)};}
  clearCredentials(){this.paired=this.identityVerified=false;}
  status(){return {boardId:this.boardId,bootId:this.bootId,publicKeyFingerprint:'c'.repeat(64)};}
 }
 const panel=createDevicePanel({store,capture:{active:false},getPanelRoot:()=>holder,openPanel(a,b,html){field('[data-address]').value=/data-address[^>]+value="([^"]*)"/.exec(html)[1];},clientFactory:()=>new Client(),bridgeFactory:options=>{
  const bridge={closed:false,async open(){calls.push('open');options.onProgress({phase:'network'});if(failOpen)throw Object.assign(new Error('DEVICE_RTC_CONNECT_TIMEOUT'),{code:'DEVICE_RTC_CONNECT_TIMEOUT'});options.onProgress({phase:'ready'});},close(){this.closed=true;options.onDisconnect(Object.assign(new Error('DEVICE_RTC_CLOSED'),{code:'DEVICE_RTC_CLOSED'}));},exportConfiguration:()=>rtc};bridges.push(bridge);return bridge;
 }});t.after(()=>panel.destroy());await panel.open();return {panel,store,field,calls,bridges,pageEvents,cache};
}
test('fresh setup blocks connection and later input; bridge import is a same-tab information step',async t=>{
 const f=await fixture(t);assert.equal(f.panel.getState().informationReady,false);assert.equal(f.field('[data-info-step]').hidden,false);assert.equal(f.field('[data-pair]').disabled,true);assert.equal(f.field('[data-start-sharing]').disabled,true);
 await f.field('[data-pair]').onclick();assert.deepEqual(f.calls,[]);const link=new URL(f.field('[data-import-connection]').href);assert.equal(link.origin,endpoint);assert.equal(link.pathname,'/settings');assert.equal(link.searchParams.get('import'),'1');assert.equal(link.searchParams.get('return'),'https://igent.cc/?session=active');
 f.field('[data-import-connection]').onclick();assert.equal(pendingDeviceSetupReturn(),true);
});
test('import is durable before first RTC attempt; failed connect retains usable metadata and original failure',async t=>{
 const href=createDeviceSetupLink({boardId:'board',httpUrl:endpoint,rtc});const f=await fixture(t,{href,failRead:true});
 assert.equal(location.hash,'');assert.equal(f.panel.getState().informationReady,true);assert.equal(f.field('[data-info-step]').hidden,false);assert.equal(f.field('[data-pair]').disabled,false);assert.deepEqual(f.calls,[]);
 const persisted=await f.store.getSettings();assert.equal(persisted.deviceRTC.ip,rtc.ip);assert.equal(persisted.deviceBoardId,'board');
 await f.field('[data-pair]').onclick();assert.equal(f.panel.getState().connected,false);assert.equal(f.bridges[0].closed,true);assert.equal(f.field('[data-connection-progress]').hidden,false);assert.ok(f.field('[data-progress-message]').textContent.endsWith(localizeError({code:'DEVICE_IDENTITY_MISMATCH'})));assert.ok(!f.field('[data-progress-message]').textContent.endsWith(localizeError({code:'DEVICE_RTC_CLOSED'})));assert.equal(f.field('[data-pair]').disabled,false);assert.equal(f.field('[data-start-challenge]').disabled,true);assert.equal(await f.store.getLocalCredential('device:'+endpoint),null);
 await f.panel.open();assert.equal(f.field('[data-info-step]').hidden,false);assert.equal(f.panel.getState().informationReady,true);assert.equal((await f.store.getSettings()).deviceRTC.ip,rtc.ip);
});
test('timeout before data-channel readiness leaves retry available and the error visible',async t=>{
 const href=createDeviceSetupLink({boardId:'board',httpUrl:endpoint,rtc});const f=await fixture(t,{href,failOpen:true});await f.field('[data-pair]').onclick();assert.equal(f.panel.getState().status,'error');assert.equal(f.field('[data-pair]').disabled,false);assert.equal(f.field('[data-connection-progress]').hidden,false);assert.ok(f.field('[data-progress-message]').textContent.endsWith(localizeError({code:'DEVICE_RTC_CONNECT_TIMEOUT'})));assert.equal(f.bridges[0].closed,true);
});
test('pagehide drops RTC but retains information and return intent; reopening reconnects explicitly',async t=>{
 const href=createDeviceSetupLink({boardId:'board',httpUrl:endpoint,rtc});const f=await fixture(t,{href});await f.field('[data-pair]').onclick();assert.equal(f.panel.getState().connected,true);f.field('[data-bridge-settings]').onclick();f.pageEvents.get('pagehide')();assert.equal(f.panel.getState().connected,false);assert.equal(f.bridges[0].closed,true);assert.equal(pendingDeviceSetupReturn({consume:true}),true);assert.equal(pendingDeviceSetupReturn(),false);await f.panel.open();assert.equal(f.panel.getState().informationReady,true);assert.equal(f.field('[data-info-step]').hidden,false);assert.equal(f.field('[data-pair]').disabled,false);assert.equal(f.calls.filter(value=>value==='open').length,1,'Return does not silently reconnect');await f.field('[data-pair]').onclick();assert.equal(f.panel.getState().connected,true);
});
test('return marker is tab-local, bounded and language/address return helper keeps the session URL',()=>{
 const map=new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};rememberDeviceSetupReturn({storage,now:1000});assert.equal(pendingDeviceSetupReturn({storage,now:1001}),true);assert.equal(pendingDeviceSetupReturn({storage,now:86401000}),false);assert.equal(map.size,0);const url=new URL(bridgeImportURL(endpoint,'zh-Hant','https://igent.cc/?session=active#old'));assert.equal(url.searchParams.get('lang'),'zh-Hant');assert.equal(url.searchParams.get('return'),'https://igent.cc/?session=active');
});
