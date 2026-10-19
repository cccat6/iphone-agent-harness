import {getLocale} from '../../apps/web/i18n.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createDevicePanel} from '../../apps/web/ui/device-panel.js';
import {openStore} from '../../apps/web/core/store.js';

// Handler-level simulation. Native trusted keyboard input and physical Bluetooth
// still require the phone; these tests exercise state, persistence and sequencing.
test('optional test auto-confirms native input; association remains usable without testing',async t=>{
 const prior=Object.getOwnPropertyDescriptor(globalThis,'document'),fields=new Map(),calls=[],documentListeners=new Map();let markup='',offline=false,networkError=false,reads=0,bridgeDisconnect,challengeReply,bindFailure=null;
 t.mock.timers.enable({apis:['setTimeout']});
 const field=selector=>{if(!fields.has(selector))fields.set(selector,{value:'',checked:false,dataset:{},listeners:{},classList:{toggle(){}},addEventListener(n,fn){this.listeners[n]=fn;},replaceChildren(){},append(){},focus(){document.activeElement=this;}});return fields.get(selector);};
 const root={isConnected:true,querySelector:field,querySelectorAll:()=>[],closest:()=>null},holder={querySelector:()=>root,contains:e=>e===root};
 Object.defineProperty(globalThis,'document',{configurable:true,value:{activeElement:null,visibilityState:'visible',documentElement:{},addEventListener:(n,fn)=>documentListeners.set(n,fn),removeEventListener(){},querySelector:()=>({}),createElement:()=>({}),head:{append(){}}}});t.after(()=>prior?Object.defineProperty(globalThis,'document',prior):delete globalThis.document);
 const store=await openStore({memory:true}),endpoint='http://test-bridge.local',fp='b'.repeat(64),capture={active:false,start(){this.active=true;return Promise.resolve();},stop(){this.active=false;}};
 class Client{
  constructor(){this.baseUrl=new URL(endpoint);this.paired=false;this.identityVerified=false;this.bindingVerified=false;this.boardId='board';this.bootId='boot';this.clientId='client';this.targetId=null;}
  async pair({clientId}){calls.push('pair');this.clientId=clientId;this.paired=this.identityVerified=true;}
  restoreCredentials(record){calls.push('restore');this.clientId=record.clientId;this.paired=true;}
  async pinIdentity(){this.identityVerified=true;} async identity(){return this.status();}
  async getBinding(){reads++;if(networkError)throw Error('offline fixture');return {targetId:this.targetId,bindingVerified:this.bindingVerified,targets:[{targetId:'phone',connected:!offline,encrypted:true,hidSubscribed:true}]};}
  async bindTarget(target){calls.push('bind');if(bindFailure)throw bindFailure;this.targetId=target;this.bindingVerified=true;}
  async startChallenge(){calls.push('challenge');return challengeReply?await challengeReply:{challengeId:'test'};}
  async confirmChallenge(targetId,{observedNonce}){assert.equal(observedNonce,'12345678');calls.push('confirm');this.targetId=targetId;this.bindingVerified=true;return {bindingVerified:true};}
  exportCredentials(){return {format:'fixture',baseUrl:endpoint,clientId:this.clientId,token:'saved-local-token',expectedFingerprint:fp};}
  status(){return {boardId:this.boardId,targetId:this.targetId,publicKeyFingerprint:fp};} clearCredentials(){this.paired=false;this.identityVerified=false;}
 }
 await store.saveSettings({deviceEndpoint:endpoint,deviceRTC:{ip:'192.168.0.125',port:18948,fingerprint:'ab'.repeat(32)}});
 const options={store,capture,clientFactory:()=>new Client(),bridgeFactory:({onDisconnect})=>{bridgeDisconnect=onDisconnect;return {open:()=>Promise.resolve(),close(){onDisconnect();}};},openPanel(a,b,html){markup=html;},getPanelRoot:()=>holder};
 const panel=createDevicePanel(options);t.after(()=>panel.destroy());await panel.open();assert.deepEqual(calls,[]);assert.equal(field('[data-test-controls]').hidden,true);assert.equal(markup.includes('data-confirm-challenge'),false);
 field('[data-address]').value=endpoint;await field('[data-pair]').onclick();assert.equal(panel.getState().ready,true);assert.equal(panel.getState().targetBound,true);assert.equal(panel.getState().inputVerified,false);assert.ok(panel.getDevice());assert.deepEqual(calls,['pair','bind']);
 await field('[data-start-sharing]').onclick();assert.equal(capture.active,true);field('[data-stop-sharing]').onclick();assert.equal(capture.active,false);
 const settle=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};
 const digits=(trusted=true)=>{const input=field('[data-nonce]');for(const digit of '12345678'){const event={isTrusted:trusted,key:digit,code:'Digit'+digit,currentTarget:input,preventDefault(){}};input.listeners.keydown(event);input.listeners.keyup(event);}};
 let done=field('[data-start-challenge]').onclick();await settle();digits(false);assert.equal(calls.includes('confirm'),false);digits();await done;assert.equal(panel.getState().inputVerified,true);assert.equal(calls.filter(x=>x==='confirm').length,1);
 // A refresh is an explicit request to test; digits may arrive before start's HTTP reply.
 let release;challengeReply=new Promise(resolve=>release=resolve);done=field('[data-refresh]').onclick();await settle();digits();assert.equal(calls.filter(x=>x==='confirm').length,1);release({challengeId:'slow-start'});await done;challengeReply=null;assert.equal(calls.filter(x=>x==='confirm').length,2);
 done=field('[data-start-challenge]').onclick();await settle();field('[data-nonce]').listeners.blur();await done;assert.equal(panel.getState().ready,true);assert.equal(panel.getState().inputVerified,false);assert.equal(calls.filter(x=>x==='confirm').length,2);
 done=field('[data-start-challenge]').onclick();await settle();document.visibilityState='hidden';documentListeners.get('visibilitychange')();await done;document.visibilityState='visible';assert.equal(panel.getState().inputVerified,false);
 const tests=calls.filter(x=>x==='challenge').length;panel.dispose();t.mock.timers.tick(5000);await settle();assert.equal(calls.filter(x=>x==='challenge').length,tests,'background monitor never types');
 offline=true;await panel.ensureReady();assert.equal(panel.getState().ready,false);offline=false;await panel.open();assert.equal(await panel.ensureReady(),false);documentListeners.get('visibilitychange')();await settle();assert.equal(panel.getState().ready,true);assert.equal(panel.getState().inputVerified,false);assert.equal(calls.filter(x=>x==='challenge').length,tests);
 networkError=true;assert.equal(await panel.ensureReady(),false);assert.equal(panel.getState().connected,false);networkError=false;bridgeDisconnect();assert.equal(panel.getState().ready,false);assert.ok(reads>0);
 // Only a known legacy 404 may retain the connection without an association.
 for(const [code,status] of [['DEVICE_ACCESS_DENIED',403],['DEVICE_TARGET_BUSY',409],['DEVICE_TIMEOUT',undefined]]){
  bindFailure=Object.assign(Error('fixture association failure'),{code,status});await field('[data-pair]').onclick();assert.equal(panel.getState().connected,false);assert.equal(panel.getState().legacyInputTestRequired,false);assert.equal(field('[data-test-controls]').hidden,true);
 }
 bindFailure=Object.assign(Error('legacy endpoint missing'),{code:'DEVICE_HTTP_ERROR',status:404});const beforeLegacy=calls.filter(x=>x==='challenge').length;
 await field('[data-pair]').onclick();assert.equal(panel.getState().connected,true);assert.equal(panel.getState().bluetoothConnected,true);assert.equal(panel.getState().ready,false);assert.equal(panel.getState().targetBound,false);assert.equal(panel.getState().inputVerified,false);assert.equal(panel.getState().legacyInputTestRequired,true);assert.equal(field('[data-test-controls]').hidden,false);assert.equal(field('[data-start-challenge]').disabled,false);assert.equal(calls.filter(x=>x==='challenge').length,beforeLegacy,'legacy connect never injects input');
 done=field('[data-refresh]').onclick();await settle();digits();await done;assert.equal(panel.getState().ready,true);assert.equal(panel.getState().targetBound,true);assert.equal(panel.getState().inputVerified,true);assert.equal(await panel.ensureReady(),true);assert.equal(panel.getState().legacyInputTestRequired,false);

});

test('daily bridge uses default address and legacy protected firmware requires update',async t=>{
 const prior=Object.getOwnPropertyDescriptor(globalThis,'document'),fields=new Map();let markup='',required=false,pairCalls=0,opens=0,restored=null;const rtc={ip:'192.168.0.125',port:18948,fingerprint:'AB:'.repeat(31)+'AB'},bridgeOptions=[];
 const field=selector=>{if(!fields.has(selector))fields.set(selector,{value:'',checked:false,dataset:{},classList:{toggle(){}},addEventListener(){},replaceChildren(){},append(){},focus(){document.activeElement=this;}});return fields.get(selector);};
 const root={isConnected:true,querySelector:field,querySelectorAll:()=>[],closest:()=>null},holder={querySelector:()=>root,contains:e=>e===root};
 Object.defineProperty(globalThis,'document',{configurable:true,value:{documentElement:{},addEventListener(){},removeEventListener(){},querySelector:()=>({}),createElement:()=>({}),head:{append(){}}}});
 t.after(()=>prior?Object.defineProperty(globalThis,'document',prior):delete globalThis.document);
 const store=await openStore({memory:true}),endpoint='http://igent.local',fp='b'.repeat(64);
 class Client{
  constructor(){this.baseUrl=new URL(endpoint);this.paired=false;this.identityVerified=false;this.bindingVerified=false;this.boardId='board';this.clientId='client';}
  async pair({setupPassword}){pairCalls++;if(required)throw Object.assign(Error('firmware update required'),{code:'DEVICE_SETUP_UPGRADE_REQUIRED'});assert.equal(setupPassword,'');this.paired=this.identityVerified=true;}
  async identity(){return this.status();}async getBinding(){return {targets:[]};}
  restoreCredentials(record){restored=record;this.paired=true;}async pinIdentity(value){assert.equal(value,fp);this.identityVerified=true;}
  exportCredentials(){return {format:'fixture',token:'not-used'};}
  status(){return {publicKeyFingerprint:fp,boardId:this.boardId};}clearCredentials(){this.paired=false;}
 }
 const panel=createDevicePanel({store,capture:{active:false},getPanelRoot:()=>holder,openPanel(a,b,html){markup=html;field('[data-address]').value=/data-address[^>]+value="([^"]*)"/.exec(html)[1];},clientFactory:()=>new Client(),bridgeFactory:options=>{bridgeOptions.push(options);return {open(){opens++;return Promise.resolve();},close(){},exportConfiguration:()=>rtc};}});
 t.after(()=>panel.destroy());await panel.open();
 assert.equal(field('[data-address]').value,endpoint);assert.ok(markup.includes('data-configuration'));assert.ok(markup.includes('data-bridge-settings data-device-text'));
 assert.equal(field('[data-pair]').disabled,true);await field('[data-pair]').onclick();assert.equal(opens,0,'No information means no RTC attempt');await store.saveSettings({deviceEndpoint:endpoint,deviceRTC:rtc});await panel.open();await field('[data-pair]').onclick();assert.equal(opens,1);
 assert.equal(pairCalls,1);assert.equal(panel.getState().connected,true);assert.equal(field('[data-bridge-settings]').href,endpoint+'/settings?lang='+encodeURIComponent(getLocale()));assert.equal(field('[data-bridge-settings]').hidden,false);assert.deepEqual((await store.getSettings()).deviceRTC,rtc);assert.deepEqual(bridgeOptions[0].rtc,rtc);assert.ok(markup.includes('data-import-connection'));assert.ok(!markup.includes('harness-link'));
 field('[data-disconnect]').onclick();await store.deleteLocalCredential('device:'+endpoint);required=true;
 await field('[data-pair]').onclick();assert.equal(panel.getState().connected,false);assert.equal(markup.includes('data-owner-password'),false);assert.equal(field('[data-bridge-settings]').hidden,true);
 required=false;await field('[data-pair]').onclick();assert.equal(panel.getState().connected,true);assert.equal(field('[data-configuration]').open,false);assert.equal(pairCalls,3);assert.deepEqual(bridgeOptions.at(-1).rtc,rtc);
 const legacy='http://harness-b0e4b4e05380.local';field('[data-disconnect]').onclick();await store.saveSettings({deviceEndpoint:legacy});await store.deleteLocalCredential('device:'+endpoint);await store.saveLocalCredential('device:'+legacy,{baseUrl:legacy,token:'legacy-token',clientId:'legacy-client',expectedFingerprint:fp});
 await panel.open();assert.equal(field('[data-address]').value,endpoint);await field('[data-pair]').onclick();assert.equal(restored.baseUrl,endpoint);assert.equal(restored.token,'legacy-token');assert.equal(pairCalls,3,'legacy credential avoids owner re-enrollment');assert.equal(panel.getState().connected,true);assert.equal((await store.getSettings()).deviceEndpoint,endpoint);
});
