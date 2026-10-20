import test from 'node:test';
import assert from 'node:assert/strict';
import {createDevicePanel} from '../../apps/web/ui/device-panel.js';
import {allowedRTCRequest} from '../../apps/web/core/device-rtc.js';
import {openStore} from '../../apps/web/core/store.js';
const settle=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
async function fixture(t,{bound=null,targets=['phone-a']}={}){
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document'),fields=new Map(),calls=[];
 const field=selector=>{if(!fields.has(selector))fields.set(selector,{value:'',dataset:{},listeners:{},classList:{toggle(){}},addEventListener(event,handler){this.listeners[event]=handler;},replaceChildren(){},append(){},focus(){document.activeElement=this;}});return fields.get(selector);};
 const root={isConnected:true,querySelector:field,querySelectorAll:()=>[],closest:()=>null},holder={querySelector:()=>root,contains:value=>value===root};
 Object.defineProperty(globalThis,'document',{configurable:true,value:{activeElement:null,visibilityState:'visible',addEventListener(){},removeEventListener(){},querySelector:()=>({}),createElement:()=>({})}});
 t.after(()=>previous?Object.defineProperty(globalThis,'document',previous):delete globalThis.document);
 const state={targets:targets.map(targetId=>({targetId,connected:true,encrypted:true,hidSubscribed:true})),start:null};
 const client={baseUrl:new URL('http://igent.local'),paired:false,identityVerified:false,bindingVerified:!!bound,targetId:bound,boardId:'board-a',bootId:'boot-a',clientId:'client-a',
  async pair(){this.paired=this.identityVerified=true;},async identity(){},async getBinding(){return {targetId:this.targetId,bindingVerified:this.bindingVerified,targets:state.targets};},
  async bindTarget(target){calls.push('bind:'+target);if(state.bindError)throw state.bindError;this.targetId=target;this.bindingVerified=true;},
  async startChallenge(){calls.push('start');return state.start?await state.start:{challengeId:'challenge-a'};},
  async cancelChallenge(target){calls.push('cancel:'+target);return {status:'cancelled'};},
  async confirmChallenge(target,{observedNonce}){calls.push('confirm:'+target+':'+observedNonce);return {bindingVerified:true};},
  exportCredentials(){return {synthetic:true};},status(){return {publicKeyFingerprint:'a'.repeat(64)};},clearCredentials(){this.paired=false;}};
 const store=await openStore({memory:true});await store.saveSettings({deviceEndpoint:'http://igent.local',deviceRTC:{ip:'192.168.0.125',port:18948,fingerprint:'a'.repeat(64)}});
 const panel=createDevicePanel({store,capture:{active:false},getPanelRoot:()=>holder,clientFactory:()=>client,bridgeFactory:()=>({open:async()=>{},close(){}}),openPanel(a,b,html){field('[data-address]').value=/data-address[^>]+value="([^"]*)"/.exec(html)[1];}});
 t.after(()=>{panel.destroy();store.close();});await panel.open();await field('[data-pair]').onclick();
 function key(type,digit,trusted=true){field('[data-nonce]').listeners[type]({currentTarget:field('[data-nonce]'),key:digit,code:'Digit'+digit,isTrusted:trusted,preventDefault(){}});}
 return {state,panel,field,calls,key};
}

test('independent optional binding: two available phones require selection; reconnect never switches away from a bound offline phone',async t=>{
 const f=await fixture(t,{bound:'phone-a',targets:['phone-a','phone-b']});
 assert.equal(f.panel.getState().ready,true);assert.equal(f.panel.getState().inputVerified,false);assert.deepEqual(f.calls,[]);
 f.state.targets[0].connected=false;assert.equal(await f.panel.ensureReady(),false);assert.equal(f.panel.getState().targetId,null);assert.deepEqual(f.calls,[]);
});

test('independent optional binding: no unique target means no automatic association or keyboard injection',async t=>{
 const f=await fixture(t,{targets:['phone-a','phone-b']});
 assert.equal(f.panel.getState().connected,true);assert.equal(f.panel.getState().ready,false);assert.deepEqual(f.calls,[]);
 f.field('[data-target]').value='phone-b';await f.field('[data-target]').onchange();
 assert.equal(f.panel.getState().targetId,'phone-b');assert.deepEqual(f.calls,['bind:phone-b']);
});

test('independent optional binding: last digit must be released before automatic confirmation',async t=>{
 const f=await fixture(t),done=f.field('[data-start-challenge]').onclick();await settle();
 for(const digit of '1234567'){f.key('keydown',digit);f.key('keyup',digit);}f.key('keydown','8');await settle();
 assert.equal(f.calls.some(value=>value.startsWith('confirm')),false);
 f.key('keyup','7');await settle();assert.equal(f.calls.some(value=>value.startsWith('confirm')),false);
 f.key('keyup','8',false);await settle();assert.equal(f.calls.some(value=>value.startsWith('confirm')),false);
 f.key('keyup','8');await done;assert.equal(f.panel.getState().inputVerified,true);
 assert.deepEqual(f.calls,['bind:phone-a','start','confirm:phone-a:12345678']);
});

test('independent optional binding: focus loss before a delayed challenge reply cannot confirm stale digits',async t=>{
 const f=await fixture(t);let reply;f.state.start=new Promise(resolve=>reply=resolve);
 const done=f.field('[data-start-challenge]').onclick();await settle();
 for(const digit of '12345678'){f.key('keydown',digit);f.key('keyup',digit);}
 f.field('[data-nonce]').listeners.blur();reply({challengeId:'delayed-old-test'});await done;
 assert.equal(f.panel.getState().inputVerified,false);assert.equal(f.panel.getState().ready,true);
 assert.deepEqual(f.calls.slice(0,2),['bind:phone-a','start']);
 assert.ok(f.calls.filter(value=>value==='cancel:phone-a').length>=1,'focus loss cancels the board-side challenge even while its start response is pending');
 assert.equal(f.calls.some(value=>value.startsWith('confirm')),false);
});

test('independent optional binding: RTC allows only the exact POST association route',()=>{
 assert.equal(allowedRTCRequest('POST','/v1/targets/phone-a/bind'),true);
 assert.equal(allowedRTCRequest('POST','/v1/targets/phone-a/challenge/cancel'),true);
 for(const [method,path] of [['GET','/v1/targets/phone-a/bind'],['POST','/v1/targets/phone-a/bind/extra'],['POST','/v1/targets/../bind'],['POST','/v1/targets/phone-a/bind?x=1']])assert.equal(allowedRTCRequest(method,path),false);
});

test('explicit dropdown change moves the selected phone; a failed change returns selection to the actual binding',async t=>{
 const f=await fixture(t,{bound:'phone-a',targets:['phone-a','phone-b']});
 f.field('[data-target]').value='phone-b';await f.field('[data-target]').onchange();assert.equal(f.panel.getState().targetId,'phone-b');assert.equal(f.field('[data-target]').value,'phone-b');
 f.state.bindError=Object.assign(new Error('DEVICE_TARGET_BUSY'),{code:'DEVICE_TARGET_BUSY',status:409,serverCode:'target_busy'});f.field('[data-target]').value='phone-a';await f.field('[data-target]').onchange();
 assert.equal(f.panel.getState().ready,true);assert.equal(f.panel.getState().targetId,'phone-b');assert.equal(f.field('[data-target]').value,'phone-b');assert.deepEqual(f.calls,['bind:phone-b','bind:phone-a']);
});

test('green connection-test confirmation requires current physical proof and disappears on disconnect or target change',async t=>{
 const f=await fixture(t,{bound:'phone-a',targets:['phone-a','phone-b']});
 const success=()=>f.field('[data-test-success]');
 assert.equal(f.panel.getState().ready,true);assert.equal(success().hidden,true,'binding alone is not a passed test');
 const verify=async()=>{const done=f.field('[data-start-challenge]').onclick();await settle();for(const digit of '12345678'){f.key('keydown',digit);f.key('keyup',digit);}await done;assert.equal(f.panel.getState().inputVerified,true);assert.equal(success().hidden,false);};
 await verify();f.state.targets[0].connected=false;await f.field('[data-refresh]').onclick();assert.equal(success().hidden,true);
 f.state.targets[0].connected=true;await f.field('[data-refresh]').onclick();assert.equal(success().hidden,true,'Bluetooth reconnect does not revive stale proof');
 await verify();f.field('[data-target]').value='phone-b';await f.field('[data-target]').onchange();assert.equal(success().hidden,true,'a different phone needs its own proof');
 await verify();const retry=f.field('[data-start-challenge]').onclick();await settle();assert.equal(success().hidden,true,'a new test clears the previous result');f.field('[data-nonce]').listeners.blur();await retry;assert.equal(success().hidden,true,'an interrupted test cannot display success');
 await verify();await f.field('[data-disconnect]').onclick();assert.equal(success().hidden,true);
});
