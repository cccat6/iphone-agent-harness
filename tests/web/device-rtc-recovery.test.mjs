import {getLocale} from '../../apps/web/i18n.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createDevicePanel} from '../../apps/web/ui/device-panel.js';
import {createDeviceSetupLink} from '../../apps/web/core/device-setup.js';
import {openStore} from '../../apps/web/core/store.js';

test('stale saved RTC IP recovers by hostname settings import and persists the new IP for later reconnect',async t=>{
 const baseUrl='http://igent.local',fingerprint='c'.repeat(64),oldRTC={ip:'192.168.0.100',port:18948,fingerprint:'ab'.repeat(32)},newRTC={...oldRTC,ip:'192.168.0.125'},calls=[],bridges=[];
 const previous=new Map(['document','location','history'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)])),fields=new Map();
 const field=key=>{if(!fields.has(key))fields.set(key,{value:'',checked:false,dataset:{},classList:{toggle(){}},addEventListener(){},replaceChildren(){},append(){}});return fields.get(key);};
 const root={isConnected:true,querySelector:field,querySelectorAll:()=>[],closest:()=>null},holder={querySelector:()=>root,contains:node=>node===root};
 Object.defineProperty(globalThis,'document',{configurable:true,value:{documentElement:{},addEventListener(){},removeEventListener(){},querySelector:()=>({}),createElement:()=>({}),head:{append(){}}}});
 const location=new URL('https://igent.cc/');Object.defineProperty(globalThis,'location',{configurable:true,value:location});Object.defineProperty(globalThis,'history',{configurable:true,value:{replaceState(s,t,path){location.href=new URL(path,location).href;}}});
 t.after(()=>{for(const[key,value]of previous)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];});
 const store=await openStore({memory:true});await store.saveSettings({deviceEndpoint:baseUrl,deviceRTC:oldRTC,deviceFingerprint:fingerprint});await store.saveLocalCredential('device:'+baseUrl,{format:'iah-device-credential/1',baseUrl,boardId:'expected-board',clientId:'browser',token:'a'.repeat(64),hostname:'igent.local',publicKeyFingerprint:fingerprint,expectedFingerprint:fingerprint});
 const identity={boardId:'expected-board',bootId:'boot',hostname:'igent.local',publicKeyFingerprint:fingerprint};
 const options={store,capture:{active:false},getPanelRoot:()=>holder,openPanel(a,b,html){field('[data-address]').value=/data-address[^>]+value="([^"]*)"/.exec(html)[1];},bridgeFactory:options=>{bridges.push(options);return {open:()=>options.rtc.ip===oldRTC.ip?Promise.reject(Object.assign(Error('stale IP'),{code:'DEVICE_RTC_CONNECT_TIMEOUT'})):Promise.resolve(),close(){},exportConfiguration:()=>options.rtc,fetch:async(url)=>{const path=new URL(url).pathname;calls.push(path);if(path==='/v1/identity')return Response.json(identity);if(path==='/v1/binding')return Response.json({...identity,clientId:'browser',targetId:null,bindingVerified:false,targets:[]});throw Error('Unexpected mutation '+path);}};}};
 let panel=createDevicePanel(options);t.after(()=>panel.destroy());await panel.open();await field('[data-pair]').onclick();assert.equal(panel.getState().connected,false);assert.equal(field('[data-import-connection]').href,baseUrl+'/settings?lang='+encodeURIComponent(getLocale()));assert.equal(calls.length,0);panel.destroy();
 location.href=createDeviceSetupLink({boardId:'expected-board',httpUrl:baseUrl,rtc:newRTC});panel=createDevicePanel(options);await panel.open();assert.equal(location.hash,'');assert.equal(field('[data-address]').value,baseUrl);await field('[data-pair]').onclick();assert.equal(panel.getState().connected,true);assert.equal(bridges.at(-1).rtc.ip,newRTC.ip);assert.equal((await store.getSettings()).deviceRTC.ip,newRTC.ip);assert.equal(calls.includes('/v1/pair'),false);panel.destroy();
 panel=createDevicePanel(options);await panel.open();await field('[data-pair]').onclick();assert.equal(panel.getState().connected,true);assert.equal(bridges.at(-1).rtc.ip,newRTC.ip);assert.equal(calls.includes('/v1/pair'),false);
});
