import test from 'node:test';
import assert from 'node:assert/strict';
import {createDevicePanel} from '../../apps/web/ui/device-panel.js';
import {createDeviceSetupLink} from '../../apps/web/core/device-setup.js';
import {openStore} from '../../apps/web/core/store.js';

test('one-time RTC import retains board identity even when form shows only local URL',async t=>{
 const endpoint='http://igent.local',rtc={ip:'192.168.0.125',port:18948,fingerprint:'ab'.repeat(32)};
 const href=createDeviceSetupLink({boardId:'expected-board',httpUrl:endpoint,rtc});
 const previous=new Map(['document','location','history'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const fields=new Map();const field=key=>{if(!fields.has(key))fields.set(key,{value:'',checked:false,dataset:{},classList:{toggle(){}},addEventListener(){},replaceChildren(){},append(){},focus(){}});return fields.get(key);};
 const root={isConnected:true,querySelector:field,querySelectorAll:()=>[],closest:()=>null},holder={querySelector:()=>root,contains:v=>v===root};
 Object.defineProperty(globalThis,'document',{configurable:true,value:{documentElement:{},addEventListener(){},removeEventListener(){},querySelector:()=>({}),createElement:()=>({}),head:{append(){}}}});
 Object.defineProperty(globalThis,'location',{configurable:true,value:new URL(href)});
 Object.defineProperty(globalThis,'history',{configurable:true,value:{replaceState(){}}});
 t.after(()=>{for(const[k,v]of previous)if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];});
 const store=await openStore({memory:true});let cleared=false,pairCalls=0;
 const client={baseUrl:new URL(endpoint),paired:false,identityVerified:false,bindingVerified:false,boardId:'unexpected-board',bootId:'boot',clientId:'client',targetId:null,async pair(){pairCalls++;this.paired=this.identityVerified=true;},async identity(){return this.status();},async getBinding(){return {targets:[]};},status(){return {boardId:this.boardId,publicKeyFingerprint:'c'.repeat(64)};},exportCredentials(){return {format:'fixture',token:'must-not-save'};},clearCredentials(){cleared=true;this.paired=false;this.identityVerified=false;}};
 const panel=createDevicePanel({store,capture:{active:false},getPanelRoot:()=>holder,openPanel(a,b,html){field('[data-address]').value=/data-address[^>]+value="([^"]*)"/.exec(html)[1];},clientFactory:()=>client,bridgeFactory:()=>({open:()=>Promise.resolve(),close(){},exportConfiguration:()=>rtc})});
 t.after(()=>panel.destroy());await panel.open();assert.equal(field('[data-address]').value,endpoint);await field('[data-pair]').onclick();
 assert.equal(panel.getState().connected,false,'An imported board ID must reject another board at the imported address');
 assert.equal(pairCalls,0,'Wrong imported identity is rejected before enrollment');assert.equal(cleared,true);assert.equal(await store.getLocalCredential('device:'+endpoint),null);
 await field('[data-pair]').onclick();assert.equal(panel.getState().connected,false,'Retry must retain the imported board ID');assert.equal(pairCalls,0,'Retry must not enroll the wrong board');assert.equal(await store.getLocalCredential('device:'+endpoint),null);assert.equal((await store.getSettings()).deviceEndpoint,undefined);
});
