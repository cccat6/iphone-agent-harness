import test from 'node:test';
import assert from 'node:assert/strict';
import {createDevicePanel} from '../../apps/web/ui/device-panel.js';
import {createDeviceSetupLink} from '../../apps/web/core/device-setup.js';
import {openStore} from '../../apps/web/core/store.js';
import {DeviceError} from '../../apps/web/core/device.js';

const endpoint='http://igent.local';
const rtc={ip:'192.168.0.125',port:18948,fingerprint:'ab'.repeat(32)};

async function fixture(t,{openError,clientFactory}={}){
 const descriptors=new Map(['document','location','history','addEventListener','removeEventListener'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),fields=new Map();let opens=0;
 const field=key=>{if(!fields.has(key))fields.set(key,{value:'',checked:false,dataset:{},listeners:{},classList:{toggle(){}},addEventListener(name,fn){this.listeners[name]=fn;},replaceChildren(){},append(){},focus(){}});return fields.get(key);};
 const root={isConnected:true,querySelector:field,querySelectorAll:()=>[],closest:()=>null},holder={querySelector:()=>root,contains:node=>node===root};
 const globals={document:{documentElement:{},querySelector:()=>({}),addEventListener(){},removeEventListener(){},createElement:()=>({}),head:{append(){}}},location:new URL('https://igent.cc/'),history:{replaceState(){}},addEventListener(){},removeEventListener(){}};
 for(const[key,value]of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,value});
 t.after(()=>{for(const[key,value]of descriptors)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];});
 const store=await openStore({memory:true}),panel=createDevicePanel({store,capture:{active:false},getPanelRoot:()=>holder,openPanel(a,b,html){field('[data-address]').value=/data-address[^>]+value="([^"]*)"/.exec(html)[1];},...(clientFactory?{clientFactory}:{}),bridgeFactory:()=>{opens++;if(openError)return {open:async()=>{throw openError;},close(){}};if(clientFactory)return {open:async()=>{},close(){},exportConfiguration:()=>rtc};throw Error('Unexpected connection before explicit readiness');}});
 t.after(()=>panel.destroy());await panel.open();return {store,panel,field,opens:()=>opens};
}

test('manual import storage failure keeps connection blocked; the same link can be retried',async t=>{
 const f=await fixture(t),save=f.store.saveSettings;let fail=true;f.store.saveSettings=patch=>fail?Promise.reject(Error('storage unavailable')):save(patch);
 const input=f.field('[data-address]');input.value=createDeviceSetupLink({boardId:'board-a',httpUrl:endpoint,rtc});await input.listeners.input();
 assert.equal(f.field('[data-pair]').disabled,true);assert.equal(f.panel.getState().informationReady,false);await f.field('[data-pair]').onclick();assert.equal(f.opens(),0);assert.equal((await f.store.getSettings()).deviceRTC,undefined);
 fail=false;await input.listeners.input();assert.equal(f.field('[data-pair]').disabled,false);assert.equal(f.panel.getState().informationReady,true);assert.equal((await f.store.getSettings()).deviceBoardId,'board-a');assert.equal(f.opens(),0);
});

test('clearing the address while manual import is saving keeps subsequent controls blocked',async t=>{
 const f=await fixture(t),save=f.store.saveSettings;let release;f.store.saveSettings=patch=>new Promise(resolve=>{release=()=>save(patch).then(resolve);});
 const input=f.field('[data-address]');input.value=createDeviceSetupLink({boardId:'board-a',httpUrl:endpoint,rtc});const pending=input.listeners.input();assert.equal(f.field('[data-pair]').disabled,true);
 input.value='';await input.listeners.input();await release();await pending;
 assert.equal(f.field('[data-pair]').disabled,true);assert.equal(f.panel.getState().informationReady,false);assert.equal(f.field('[data-start-challenge]').disabled,true);assert.equal(f.field('[data-start-sharing]').disabled,true);await f.field('[data-pair]').onclick();assert.equal(f.opens(),0);
});

test('successive valid imports serialize persistence and enable only the latest saved information',async t=>{
 const f=await fixture(t),save=f.store.saveSettings,releases=[],written=[];f.store.saveSettings=patch=>{written.push(patch.deviceBoardId);return new Promise(resolve=>releases.push(()=>save(patch).then(resolve)));};
 const input=f.field('[data-address]');input.value=createDeviceSetupLink({boardId:'board-a',httpUrl:endpoint,rtc});const a=input.listeners.input();
 input.value=createDeviceSetupLink({boardId:'board-b',httpUrl:endpoint,rtc:{...rtc,ip:'192.168.0.126'}});const b=input.listeners.input();
 assert.deepEqual(written,['board-a']);assert.equal(f.field('[data-pair]').disabled,true);await releases[0]();await a;
 assert.deepEqual(written,['board-a','board-b']);assert.equal(f.field('[data-pair]').disabled,true);await releases[1]();await b;
 assert.equal(f.field('[data-pair]').disabled,false);const stored=await f.store.getSettings();assert.equal(stored.deviceBoardId,'board-b');assert.equal(stored.deviceRTC.ip,'192.168.0.126');assert.equal(f.opens(),0);
});

test('connection failure exposes optional safe details and clears them during an explicit retry',async t=>{
 const failure=new DeviceError('DEVICE_CLIENT_CAPACITY','DO_NOT_RENDER_RAW_SECRET',{status:409,serverCode:'client_capacity'}),f=await fixture(t,{openError:failure});
 await f.store.saveSettings({deviceEndpoint:endpoint,deviceRTC:rtc});await f.panel.open();assert.equal(f.field('[data-connection-error-details]').hidden,true);
 await f.field('[data-pair]').onclick();assert.equal(f.field('[data-connection-error-details]').hidden,false);assert.equal(f.field('[data-connection-error-details]').open,true);assert.equal(f.field('[data-connection-error-content]').textContent,'DEVICE_CLIENT_CAPACITY\nHTTP 409\nclient_capacity');assert.doesNotMatch(f.field('[data-progress-message]').textContent,/DO_NOT_RENDER_RAW_SECRET/);
 const retry=f.field('[data-pair]').onclick();assert.equal(f.field('[data-connection-error-details]').hidden,true);assert.equal(f.field('[data-connection-error-content]').textContent,'');await retry;assert.equal(f.opens(),2);
});

async function refreshFixture(t){
 let stalled=false,readSignal;
 class Client{
  constructor(){this.baseUrl=new URL(endpoint);this.paired=false;this.identityVerified=false;this.bindingVerified=false;this.boardId='board-a';this.bootId='boot-a';this.clientId='browser-a';}
  async identity({signal}={}){if(!stalled)return this.status();readSignal=signal;return new Promise((resolve,reject)=>{const cancel=()=>reject(new DeviceError('DEVICE_REQUEST_CANCELLED'));signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();});}
  async pair(){this.paired=this.identityVerified=true;}
  async getBinding(){return {targets:[]};}
  clearCredentials(){this.paired=this.identityVerified=false;}
  exportCredentials(){return {format:'test',token:'not-real',clientId:this.clientId};}
  status(){return {boardId:this.boardId,bootId:this.bootId,publicKeyFingerprint:'ab'.repeat(32)};}
 }
 const f=await fixture(t,{clientFactory:()=>new Client()});await f.store.saveSettings({deviceEndpoint:endpoint,deviceRTC:rtc});await f.panel.open();await f.field('[data-pair]').onclick();assert.equal(f.panel.getState().connected,true);
 return {...f,stall(){stalled=true;},readSignal:()=>readSignal};
}

test('refresh internal deadline reports a connection timeout rather than user cancellation',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=await refreshFixture(t);f.stall();const pending=f.field('[data-refresh]').onclick();assert.equal(f.readSignal().aborted,false);
 t.mock.timers.tick(8000);await pending;assert.equal(f.panel.getState().connected,false);assert.equal(f.field('[data-connection-error-content]').textContent,'DEVICE_TIMEOUT');assert.doesNotMatch(f.field('[data-progress-message]').textContent,/cancelled|取消/i);assert.equal(f.field('[data-pair]').disabled,false);
});

test('closing the panel keeps a caller-owned refresh alive and preserves its error',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=await refreshFixture(t);f.stall();const pending=f.field('[data-refresh]').onclick();assert.equal(f.readSignal().aborted,false);
 f.panel.dispose();assert.equal(f.readSignal().aborted,false);t.mock.timers.tick(8000);await pending;await f.panel.open();assert.equal(f.field('[data-connection-error-details]').hidden,false);assert.equal(f.field('[data-connection-error-content]').textContent,'DEVICE_TIMEOUT');assert.equal(f.field('[data-pair]').disabled,false);
});
