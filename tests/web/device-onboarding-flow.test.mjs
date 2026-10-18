import test from 'node:test';
import assert from 'node:assert/strict';
import {createDevicePanel} from '../../apps/web/ui/device-panel.js';
import {openStore} from '../../apps/web/core/store.js';

// Handler-level simulation. Native trusted keyboard input and physical Bluetooth
// still require the phone; these tests exercise state, persistence and sequencing.
test('connection test gates readiness, saves locally and reconnects without another code',async t=>{
 const prior=Object.getOwnPropertyDescriptor(globalThis,'document'),fields=new Map(),published=[],calls=[];let markup='',bridgeDisconnect,offline=false,networkError=false,reads=0;const documentListeners=new Map(),dialogListeners=new Map();t.mock.timers.enable({apis:['setTimeout']});
 const field=selector=>{if(!fields.has(selector)){const listeners={};fields.set(selector,{value:'',checked:false,dataset:{},listeners,classList:{toggle(){}},addEventListener(n,fn){listeners[n]=fn;},replaceChildren(){},append(){},focus(){document.activeElement=this;}});}return fields.get(selector);};
 const root={isConnected:true,querySelector:field,querySelectorAll:()=>[],closest:selector=>selector==='dialog'?{addEventListener:(name,fn)=>dialogListeners.set(name,fn),removeEventListener:(name)=>dialogListeners.delete(name)}:null},holder={querySelector:()=>root,contains:e=>e===root};
 Object.defineProperty(globalThis,'document',{configurable:true,value:{documentElement:{},visibilityState:'visible',addEventListener:(name,fn)=>documentListeners.set(name,fn),removeEventListener:(name)=>documentListeners.delete(name),querySelector:()=>({}),createElement:()=>({}),head:{append(){}}}});t.after(()=>prior?Object.defineProperty(globalThis,'document',prior):delete globalThis.document);
 const store=await openStore({memory:true}),endpoint='http://test-bridge.local',fp='b'.repeat(64),capture={active:false,start(){this.active=true;return Promise.resolve();},stop(){this.active=false;}};
 class Client{
  constructor(){this.baseUrl=new URL(endpoint);this.paired=false;this.identityVerified=false;this.bindingVerified=false;this.boardId='board';this.bootId='boot';this.clientId='client';this.targetId=null;}
  async pair({clientId,setupPassword}){assert.equal(setupPassword,'first-code');calls.push('pair');this.clientId=clientId;this.paired=this.identityVerified=true;}
  restoreCredentials(record){calls.push('restore');this.clientId=record.clientId;this.paired=true;}
  async pinIdentity(){this.identityVerified=true;}
  async identity(){return this.status();}
  async getBinding(){reads++;if(networkError)throw Error('offline fixture');return {targets:[{targetId:'phone',connected:!offline,encrypted:true,hidSubscribed:true}]};}
  async startChallenge(){return {challengeId:'test'};}
  async confirmChallenge(targetId,{observedNonce}){assert.equal(observedNonce,'12345678');this.targetId=targetId;this.bindingVerified=true;return {bindingVerified:true};}
  exportCredentials(){return {format:'iah-device-credential/1',baseUrl:endpoint,clientId:this.clientId,token:'saved-local-token',expectedFingerprint:fp};}
  status(){return {boardId:this.boardId,targetId:this.targetId,publicKeyFingerprint:fp};}
  clearCredentials(){this.paired=false;this.identityVerified=false;}
 }
 const options={store,capture,clientFactory:()=>new Client(),bridgeFactory:({onDisconnect})=>{bridgeDisconnect=onDisconnect;return {open:()=>Promise.resolve(),close(){onDisconnect();}};},openPanel(a,b,html){markup=html;},getPanelRoot:()=>holder,onDeviceChange:(client,state)=>published.push({client,state})};
 let panel=createDevicePanel(options);t.after(()=>panel.destroy());await panel.open();assert.deepEqual(calls,[]);assert.equal(panel.getState().status,'disconnected');
 assert.equal(field('[data-target]').disabled,true);assert.equal(field('[data-refresh]').disabled,true);assert.equal(field('[data-test-controls]').hidden,true);assert.equal(field('[data-connect-shortcut]').hidden,false);
 await field('[data-connect-shortcut]').onclick();assert.equal(field('[data-configuration]').open,true);assert.equal(document.activeElement,field('[data-address]'));assert.deepEqual(calls,[]);
 assert.equal(/data-device-text="(?:pairTitle|bindTitle|settingsTitle)"/.test(markup),true);assert.ok(markup.includes('data-device-text="wifiOptional"'));
 for(const removed of ['data-keyboard','data-assistive','data-direct','data-vault-password'])assert.equal(markup.includes(removed),false);
 field('[data-address]').value=endpoint;field('[data-owner-password]').value='first-code';await field('[data-pair]').onclick();
 assert.equal(panel.getState().status,'needs-input-test');assert.equal(field('[data-refresh]').disabled,false);assert.equal(field('[data-target]').disabled,false);assert.equal(field('[data-test-controls]').hidden,false);assert.equal(field('[data-connect-shortcut]').hidden,true);assert.equal(panel.getState().bluetoothConnected,true);assert.equal(panel.getDevice(),null);assert.equal((await store.getLocalCredential('device:'+endpoint)).token,'saved-local-token');assert.equal(JSON.stringify(await store.getSettings()).includes('saved-local-token'),false);
 await field('[data-start-sharing]').onclick();assert.equal(capture.active,false);
 const verify=async()=>{await field('[data-start-challenge]').onclick();const nonce=field('[data-nonce]');for(const digit of '12345678')nonce.listeners.keydown({isTrusted:true,key:digit,code:'Digit'+digit,currentTarget:nonce,preventDefault(){}});await field('[data-confirm-challenge]').onclick();};
 await verify();assert.equal(panel.getState().status,'ready');assert.ok(panel.getDevice());
 await field('[data-start-sharing]').onclick();assert.equal(panel.getState().status,'sharing');field('[data-stop-sharing]').onclick();assert.equal(panel.getState().status,'ready');
 const readsBefore=reads;assert.equal(await panel.ensureReady(),true);assert.ok(reads>readsBefore);
 offline=true;assert.equal(await panel.ensureReady(),false);assert.equal(panel.getState().ready,false);assert.equal(panel.getState().bluetoothConnected,false);offline=false;await field('[data-refresh]').onclick();assert.equal(panel.getState().ready,false);await verify();
 networkError=true;await field('[data-refresh]').onclick();assert.equal(panel.getState().ready,false);assert.equal(panel.getState().connected,false);assert.equal(field('[data-refresh]').disabled,true);assert.equal(field('[data-target]').disabled,true);assert.equal(field('[data-test-controls]').hidden,true);assert.equal(field('[data-connect-shortcut]').hidden,false);networkError=false;await field('[data-refresh]').onclick();await verify();
 // Monitoring pauses during native challenge entry and does not clear its digits.
 await field('[data-start-challenge]').onclick();const liveNonce=field('[data-nonce]');liveNonce.listeners.keydown({isTrusted:true,key:'1',code:'Digit1',currentTarget:liveNonce,preventDefault(){}});const readsDuring=reads;t.mock.timers.tick(5000);for(let i=0;i<12;i++)await Promise.resolve();assert.equal(liveNonce.value,'●');assert.equal(reads,readsDuring);for(const digit of '2345678')liveNonce.listeners.keydown({isTrusted:true,key:digit,code:'Digit'+digit,currentTarget:liveNonce,preventDefault(){}});await field('[data-confirm-challenge]').onclick();
 // Close only the panel; background status updates still change the home badge.
 panel.dispose();offline=true;t.mock.timers.tick(5000);for(let i=0;i<16;i++)await Promise.resolve();assert.equal(panel.getState().ready,false);assert.equal(published.at(-1).state.bluetoothConnected,false);
 offline=false;documentListeners.get('visibilitychange')();for(let i=0;i<16;i++)await Promise.resolve();assert.equal(panel.getState().ready,false);assert.equal(panel.getState().bluetoothConnected,true);
 bridgeDisconnect();assert.equal(panel.getState().ready,false);assert.equal(published.at(-1).state.status,'disconnected');
 panel.destroy();panel=createDevicePanel(options);await panel.open();field('[data-address]').value=endpoint;field('[data-owner-password]').value='';assert.ok(markup.includes('data-configuration >'));await field('[data-connect-shortcut]').onclick();assert.deepEqual(calls,['pair','restore']);assert.equal(panel.getState().status,'needs-input-test');assert.equal(panel.getDevice(),null);
});

test('daily bridge starts with a default address and only asks for an enabled connection code',async t=>{
 const prior=Object.getOwnPropertyDescriptor(globalThis,'document'),fields=new Map();let markup='',required=false,pairCalls=0,opens=0,restored=null;
 const field=selector=>{if(!fields.has(selector))fields.set(selector,{value:'',checked:false,dataset:{},classList:{toggle(){}},addEventListener(){},replaceChildren(){},append(){},focus(){document.activeElement=this;}});return fields.get(selector);};
 const root={isConnected:true,querySelector:field,querySelectorAll:()=>[],closest:()=>null},holder={querySelector:()=>root,contains:e=>e===root};
 Object.defineProperty(globalThis,'document',{configurable:true,value:{documentElement:{},addEventListener(){},removeEventListener(){},querySelector:()=>({}),createElement:()=>({}),head:{append(){}}}});
 t.after(()=>prior?Object.defineProperty(globalThis,'document',prior):delete globalThis.document);
 const store=await openStore({memory:true}),endpoint='http://igent.local',fp='b'.repeat(64);
 class Client{
  constructor(){this.baseUrl=new URL(endpoint);this.paired=false;this.identityVerified=false;this.bindingVerified=false;this.boardId='board';this.clientId='client';}
  async pair({setupPassword}){pairCalls++;if(required&&!setupPassword)throw Object.assign(Error('code required'),{code:'DEVICE_CONNECTION_CODE_REQUIRED'});assert.equal(setupPassword,required?'12345678':'');this.paired=this.identityVerified=true;}
  async identity(){return this.status();}async getBinding(){return {targets:[]};}
  restoreCredentials(record){restored=record;this.paired=true;}async pinIdentity(value){assert.equal(value,fp);this.identityVerified=true;}
  exportCredentials(){return {format:'fixture',token:'not-used'};}
  status(){return {publicKeyFingerprint:fp,boardId:this.boardId};}clearCredentials(){this.paired=false;}
 }
 const panel=createDevicePanel({store,capture:{active:false},getPanelRoot:()=>holder,openPanel(a,b,html){markup=html;field('[data-address]').value=/data-address[^>]+value="([^"]*)"/.exec(html)[1];},clientFactory:()=>new Client(),bridgeFactory:()=>({open(){opens++;return Promise.resolve();},close(){}})});
 t.after(()=>panel.destroy());await panel.open();
 assert.equal(field('[data-address]').value,endpoint);assert.ok(markup.includes('data-configuration >'));assert.ok(markup.includes('data-bridge-settings target="_blank" rel="noopener noreferrer"'));
 const pending=field('[data-connect-shortcut]').onclick();assert.equal(opens,1,'window opens in the click before storage awaits');await pending;
 assert.equal(pairCalls,1);assert.equal(panel.getState().connected,true);assert.equal(field('[data-bridge-settings]').href,endpoint+'/settings');assert.equal(field('[data-bridge-settings]').hidden,false);
 field('[data-disconnect]').onclick();await store.deleteLocalCredential('device:'+endpoint);required=true;
 await field('[data-connect-shortcut]').onclick();assert.equal(panel.getState().connected,false);assert.equal(field('[data-configuration]').open,true);assert.equal(document.activeElement,field('[data-owner-password]'));assert.equal(field('[data-bridge-settings]').hidden,true);
 field('[data-owner-password]').value='12345678';await field('[data-pair]').onclick();assert.equal(panel.getState().connected,true);assert.equal(field('[data-configuration]').open,false);assert.equal(pairCalls,3);
 const legacy='http://harness-b0e4b4e05380.local';field('[data-disconnect]').onclick();await store.saveSettings({deviceEndpoint:legacy});await store.deleteLocalCredential('device:'+endpoint);await store.saveLocalCredential('device:'+legacy,{baseUrl:legacy,token:'legacy-token',clientId:'legacy-client',expectedFingerprint:fp});
 await panel.open();assert.equal(field('[data-address]').value,endpoint);await field('[data-connect-shortcut]').onclick();assert.equal(restored.baseUrl,endpoint);assert.equal(restored.token,'legacy-token');assert.equal(pairCalls,3,'legacy credential avoids owner re-enrollment');assert.equal(panel.getState().connected,true);assert.equal((await store.getSettings()).deviceEndpoint,endpoint);
});
