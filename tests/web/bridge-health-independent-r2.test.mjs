import test from 'node:test';
import assert from 'node:assert/strict';
import {createDevicePanel} from '../../apps/web/ui/device-panel.js';
import {openStore} from '../../apps/web/core/store.js';
import {DeviceError} from '../../apps/web/core/device.js';
const endpoint='http://igent.local',rtc={ip:'192.168.0.125',port:18948,fingerprint:'ab'.repeat(32)};
async function fixture(t,{identityRTC=rtc,bindError=null}={}){
 const previous=new Map(['document','location','history'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),fields=new Map();let pairs=0,binds=0,reads=0,error=null,busy=false;
 const field=key=>{if(!fields.has(key))fields.set(key,{value:'',checked:false,dataset:{},classList:{toggle(){}},listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},replaceChildren(){},append(){},focus(){document.activeElement=this;}});return fields.get(key);};
 const root={isConnected:true,querySelector:field,querySelectorAll:()=>[],closest:()=>null},holder={querySelector:()=>root,contains:value=>value===root};
 const document={visibilityState:'visible',documentElement:{},addEventListener(){},removeEventListener(){},querySelector:()=>({}),createElement:()=>({}),head:{append(){}}};
 for(const[key,value]of Object.entries({document,location:new URL('https://igent.cc/'),history:{replaceState(){}}}))Object.defineProperty(globalThis,key,{configurable:true,value});
 t.after(()=>{for(const[key,value]of previous)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];});
 class Client{
  constructor(){this.baseUrl=new URL(endpoint);this.paired=false;this.identityVerified=false;this.bindingVerified=false;this.boardId='board';this.bootId='boot';this.clientId='client';this.targetId=null;}
  async identity(){return {...this.status(),rtc:identityRTC};}
  async pair(){pairs++;this.paired=this.identityVerified=true;}
  async getBinding(){reads++;if(error)throw error;return {targetId:this.targetId,bindingVerified:this.bindingVerified,targets:[{targetId:'phone',connected:true,encrypted:true,hidSubscribed:true}]};}
  async bindTarget(id){binds++;if(bindError)throw bindError;this.targetId=id;this.bindingVerified=true;}
  clearCredentials(){this.paired=this.identityVerified=false;}
  exportCredentials(){return {format:'fixture',baseUrl:endpoint,clientId:'client',token:'fake-token',expectedFingerprint:'b'.repeat(64)};}
  status(){return {boardId:'board',bootId:'boot',publicKeyFingerprint:'b'.repeat(64)};}
 }
 const store=await openStore({memory:true});await store.saveSettings({deviceEndpoint:endpoint,deviceBoardId:'board',deviceRTC:rtc});
 const panel=createDevicePanel({store,capture:{active:false},isBusy:()=>busy,clientFactory:()=>new Client(),bridgeFactory:()=>({open:async()=>{},close(){this.closed=true;},exportConfiguration:()=>rtc}),getPanelRoot:()=>holder,openPanel(a,b,html){field('[data-address]').value=/data-address[^>]+value="([^"]*)"/.exec(html)[1];}});t.after(()=>panel.destroy());await panel.open();await field('[data-pair]').onclick();
 return {panel,store,field,pairs:()=>pairs,binds:()=>binds,reads:()=>reads,setError:value=>error=value,setBusy:value=>busy=value};
}
test('verified identity RTC address survives the final explicit-connect settings write',async t=>{
 const f=await fixture(t,{identityRTC:{...rtc,ip:'192.168.0.126'}});assert.equal(f.panel.getState().connected,true);assert.equal((await f.store.getSettings()).deviceRTC.ip,'192.168.0.126');assert.equal(new URL(f.field('[data-import-connection]').href).hostname,'192.168.0.126');
});
test('a busy association retains the bridge and later status refresh does not silently retry the mutation',async t=>{
 const f=await fixture(t,{bindError:new DeviceError('DEVICE_TARGET_BUSY','busy',{status:409,serverCode:'target_busy'})});assert.equal(f.panel.getState().connected,true);assert.equal(f.panel.getState().ready,false);assert.equal(f.binds(),1);await f.panel.refreshConnection({force:true});await f.field('[data-refresh]').onclick();assert.equal(f.panel.getState().connected,true);assert.equal(f.binds(),1);assert.equal(f.pairs(),1);assert.equal(f.field('[data-start-challenge]').disabled,false);
});
test('unrecognized 401 and task-busy credential failures cannot trigger background enrollment',async t=>{
 const f=await fixture(t);f.setError(new DeviceError('DEVICE_AUTH_EXPIRED','expired',{status:401,serverCode:'origin_required'}));assert.equal(await f.panel.refreshConnection({force:true}),false);assert.equal(f.pairs(),1);
 f.setError(new DeviceError('DEVICE_AUTH_EXPIRED','expired',{status:401,serverCode:'invalid_client_credential'}));f.setBusy(true);assert.equal(await f.panel.refreshConnection({force:true}),false);assert.equal(f.pairs(),1);
});
