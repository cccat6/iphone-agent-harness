import test from 'node:test';
import assert from 'node:assert/strict';
import {createDevicePanel} from '../../apps/web/ui/device-panel.js';
import {openStore} from '../../apps/web/core/store.js';
import {DeviceError} from '../../apps/web/core/device.js';
const endpoint='http://igent.local',rtc={ip:'192.168.0.125',port:18948,fingerprint:'ab'.repeat(32)};
async function fixture(t){
 const descriptors=new Map(['document','location','history'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),fields=new Map(),updates=[],documentEvents=new Map();let reads=0,identities=0,pairs=0,bindings=0,opens=0,phone=true,subscribed=true,failure=null,pending=null,bridge=null,expired=false,challenges=0,cancellation=null,cancels=0,startErrors=[],busy=false,transportDisconnect;
 const field=key=>{if(!fields.has(key))fields.set(key,{value:'',checked:false,dataset:{},listeners:{},classList:{toggle(){}},addEventListener(name,fn){this.listeners[name]=fn;},replaceChildren(){},append(){},focus(){document.activeElement=this;}});return fields.get(key);};
 const root={isConnected:true,querySelector:field,querySelectorAll:()=>[],closest:()=>null},holder={querySelector:()=>root,contains:node=>node===root};
 Object.defineProperty(globalThis,'document',{configurable:true,value:{visibilityState:'visible',documentElement:{},querySelector:()=>({}),addEventListener(name,fn){documentEvents.set(name,fn);},removeEventListener(name){documentEvents.delete(name);},createElement:()=>({}),head:{append(){}}}});Object.defineProperty(globalThis,'location',{configurable:true,value:new URL('https://igent.cc/?session=saved')});Object.defineProperty(globalThis,'history',{configurable:true,value:{replaceState(){}}});
 t.after(()=>{for(const[key,value]of descriptors)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];});
 class Client{
  constructor(){this.baseUrl=new URL(endpoint);this.paired=false;this.identityVerified=false;this.bindingVerified=false;this.boardId='board';this.bootId='boot';this.clientId='browser';this.targetId=null;}
  async pair(){pairs++;this.paired=this.identityVerified=true;}
  restoreCredentials(){this.paired=true;}
  async pinIdentity(){this.identityVerified=true;}
  async identity(){identities++;if(pending)await pending;if(failure)throw failure;return this.status();}
  async getBinding(){reads++;if(failure)throw failure;if(expired){expired=false;throw new DeviceError('DEVICE_AUTH_EXPIRED','expired',{status:401,serverCode:'invalid_client_credential'});}return {targetId:this.targetId,bindingVerified:this.bindingVerified,targets:[{targetId:'phone',connected:phone,encrypted:phone,hidSubscribed:phone&&subscribed}]};}
  async startChallenge(){challenges++;if(startErrors.length)throw startErrors.shift();return {challengeId:'challenge-'+challenges};}
  async cancelChallenge(){cancels++;if(cancellation)await cancellation;return {status:'cancelled'};}
  async bindTarget(id){bindings++;this.targetId=id;this.bindingVerified=true;}
  clearCredentials(){this.paired=this.identityVerified=false;}
  exportCredentials(){return {format:'fixture',baseUrl:endpoint,clientId:this.clientId,token:'fixture-token'};}
  status(){return {boardId:this.boardId,bootId:this.bootId,targetId:this.targetId,publicKeyFingerprint:'b'.repeat(64)};}
 }
 const store=await openStore({memory:true});await store.saveSettings({deviceEndpoint:endpoint,deviceRTC:rtc,deviceBoardId:'board'});
 const panel=createDevicePanel({store,capture:{active:false},isBusy:()=>busy,onDeviceChange:(device,summary)=>updates.push({...summary}),getPanelRoot:()=>holder,openPanel(a,b,html){field('[data-address]').value=/data-address[^>]+value="([^"]*)"/.exec(html)[1];},clientFactory:()=>new Client(),bridgeFactory:options=>{opens++;transportDisconnect=options.onDisconnect;bridge={open:async()=>{},close(){this.closed=true;},exportConfiguration:()=>rtc};return bridge;}});t.after(()=>panel.destroy());await panel.open();await field('[data-pair]').onclick();
 return {panel,field,updates,reads:()=>reads,identities:()=>identities,pairs:()=>pairs,bindings:()=>bindings,opens:()=>opens,closeTransport:()=>bridge.close(),disconnectTransport:()=>{bridge.close();transportDisconnect(new DeviceError('DEVICE_RTC_DISCONNECTED'));},setBusy:value=>busy=value,foreground:()=>documentEvents.get('visibilitychange')?.(),setPhone:value=>phone=value,setSubscribed:value=>subscribed=value,expireCredential(){expired=true;},startErrors:values=>startErrors=values,challenges:()=>challenges,cancels:()=>cancels,stallCancellation(){let resolve;cancellation=new Promise(done=>resolve=done);return ()=>{cancellation=null;resolve();};},setFailure:value=>failure=value,stall(){let resolve;pending=new Promise(done=>resolve=done);return ()=>{pending=null;resolve();};}};
}
test('lifecycle status refresh rechecks an unavailable phone and recovers without input or re-enrollment',async t=>{
 const f=await fixture(t);assert.equal(f.panel.getState().ready,true);f.panel.dispose();f.setPhone(false);assert.equal(await f.panel.refreshConnection({force:true}),false);assert.equal(f.panel.getState().connected,true);assert.equal(f.panel.getState().bluetoothConnected,false);
 f.setPhone(true);assert.equal(await f.panel.refreshConnection({force:true}),true);assert.equal(f.panel.getState().ready,true);assert.equal(f.pairs(),1);assert.equal(f.bindings(),1);assert.equal(f.opens(),1);
});
test('lifecycle refresh stays visually ready, shares one probe and publishes a real failure',async t=>{
 const f=await fixture(t),before=f.identities(),updateStart=f.updates.length,release=f.stall();const first=f.panel.refreshConnection({force:true}),second=f.panel.refreshConnection({force:true});assert.equal(f.panel.getState().checking,false);assert.equal(f.panel.getState().ready,true);assert.equal(f.identities(),before+1);release();assert.equal(await first,true);assert.equal(await second,true);assert.equal(f.panel.getState().checking,false);assert.ok(f.updates.slice(updateStart).every(row=>!row.checking&&row.ready));
 f.setFailure(new DeviceError('DEVICE_RTC_TIMEOUT'));assert.equal(await f.panel.refreshConnection({force:true}),false);assert.equal(f.panel.getState().connected,false);assert.equal(f.panel.getState().checking,false);assert.equal(f.pairs(),1);
 f.setFailure(null);assert.equal(await f.panel.refreshConnection({force:true}),true);assert.equal(f.panel.getState().ready,true);
});
test('explicit disconnect survives lifecycle refresh and LAN links retain the configured hostname',async t=>{
 const f=await fixture(t);assert.equal(new URL(f.field('[data-import-connection]').href).origin,endpoint);assert.equal(new URL(f.field('[data-bridge-settings]').href).origin,endpoint);const reads=f.identities();f.field('[data-disconnect]').onclick();assert.equal(await f.panel.refreshConnection({force:true}),false);assert.equal(f.identities(),reads);assert.equal(f.opens(),1);assert.equal(f.panel.getState().connected,false);
});

test('connected Bluetooth awaiting HID is distinct from disconnected and refresh never starts an input test',async t=>{
 const f=await fixture(t);f.setSubscribed(false);await f.panel.refreshConnection({force:true});assert.equal(f.panel.getState().connected,true);assert.equal(f.panel.getState().bluetoothConnected,true);assert.equal(f.panel.getState().phoneInputReady,false);assert.equal(f.panel.getState().ready,false);assert.equal(f.field('[data-start-challenge]').disabled,true);
 f.setSubscribed(true);await f.field('[data-refresh]').onclick();assert.equal(f.panel.getState().ready,true);assert.equal(f.panel.getState().phoneInputReady,true);assert.equal(f.field('[data-start-challenge]').disabled,false);assert.equal(f.panel.getState().inputVerified,false);assert.equal(f.pairs(),1);assert.equal(f.bindings(),1);
});
test('an explicit expired credential renews in place after identity check without reimport or input',async t=>{
 const f=await fixture(t);f.expireCredential();assert.equal(await f.panel.refreshConnection({force:true}),true);assert.equal(f.pairs(),2);assert.equal(f.opens(),1);assert.equal(f.bindings(),1);assert.equal(f.panel.getState().ready,true);
});

test('a cancelled input test completes its cancellation before a new explicit start; duplicate taps do not replay',async t=>{
 const f=await fixture(t),settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
 const first=f.field('[data-start-challenge]').onclick();await settle();assert.equal(f.challenges(),1);const release=f.stallCancellation();f.field('[data-nonce]').listeners.blur();await first;await settle();assert.equal(f.cancels(),1);
 const next=f.field('[data-start-challenge]').onclick();await settle();assert.equal(f.challenges(),1,'no new start until cancellation is acknowledged');assert.equal(f.field('[data-start-challenge]').onclick(),undefined,'duplicate tap is ignored while working');release();await settle();assert.equal(f.challenges(),2);f.field('[data-nonce]').listeners.blur();await next;assert.equal(f.challenges(),2);assert.equal(f.panel.getState().ready,true);
});

const knownBusy=()=>new DeviceError('DEVICE_CHALLENGE_BUSY','busy',{status:429,serverCode:'challenge_busy_or_rate_limited'});
test('explicit input test retries a known unsent 429 once after visible cooldown; nonce deadline begins after acceptance',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=await fixture(t),settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};f.startErrors([knownBusy()]);const pending=f.field('[data-start-challenge]').onclick();await settle();assert.equal(f.challenges(),1);assert.match(f.field('[data-progress-message]').textContent,/30/);assert.doesNotMatch(f.field('[data-progress-message]').textContent,/\{seconds\}/);t.mock.timers.tick(1000);await settle();assert.match(f.field('[data-progress-message]').textContent,/29/);
 for(let i=0;i<28;i++){t.mock.timers.tick(1000);await settle();}assert.equal(f.challenges(),1);t.mock.timers.tick(1000);await settle();assert.equal(f.challenges(),2);assert.equal(f.field('[data-start-challenge]').onclick(),undefined);assert.equal(f.panel.getState().inputVerified,false);
 t.mock.timers.tick(29000);await settle();assert.equal(f.panel.getState().status,'connecting','accepted test still has its own full nonce timeout');f.field('[data-nonce]').listeners.blur();await pending;assert.equal(f.challenges(),2);
});
test('cooldown stops on focus loss and never repeats a second known rejection',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=await fixture(t),settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};f.startErrors([knownBusy()]);let pending=f.field('[data-start-challenge]').onclick();await settle();f.field('[data-nonce]').listeners.blur();await pending;t.mock.timers.tick(30000);await settle();assert.equal(f.challenges(),1);assert.equal(f.cancels(),0,'known rejected start does not cancel another test');
 f.startErrors([knownBusy(),knownBusy()]);pending=f.field('[data-start-challenge]').onclick();await settle();for(let i=0;i<30;i++){t.mock.timers.tick(1000);await settle();}await pending;assert.equal(f.challenges(),3);t.mock.timers.tick(30000);await settle();assert.equal(f.challenges(),3);assert.match(f.field('[data-connection-error-content]').textContent,/HTTP 429/);assert.match(f.field('[data-connection-error-content]').textContent,/challenge_busy_or_rate_limited/);assert.equal(f.field('[data-connection-error-details]').open,true);
});
test('closing a panel aborts cooldown; an unknown start failure is never retried',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=await fixture(t),settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};f.startErrors([knownBusy()]);let pending=f.field('[data-start-challenge]').onclick();await settle();f.panel.dispose();await pending;t.mock.timers.tick(30000);await settle();assert.equal(f.challenges(),1);
 await f.panel.open();await settle();f.startErrors([new DeviceError('DEVICE_RTC_TIMEOUT','unknown',{unknown:true})]);pending=f.field('[data-start-challenge]').onclick();await settle();await pending;t.mock.timers.tick(30000);await settle();assert.equal(f.challenges(),2);
});

test('periodic heartbeat remains silent, shares a navigation probe and detects an actually closed peer',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=await fixture(t),settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};f.panel.dispose();const initial=f.identities(),index=f.updates.length,release=f.stall();t.mock.timers.tick(5000);await settle();assert.equal(f.identities(),initial+1);assert.equal(f.panel.getState().ready,true);assert.equal(f.panel.getState().checking,false);const navigated=f.panel.refreshConnection({force:true});assert.equal(f.identities(),initial+1);release();await navigated;await settle();assert.ok(f.updates.slice(index).every(value=>value.ready&&!value.checking));assert.equal(f.opens(),1);assert.equal(f.pairs(),1);
 f.closeTransport();t.mock.timers.tick(5000);await settle();assert.equal(f.panel.getState().connected,false);assert.equal(f.panel.getState().ready,false);assert.equal(f.opens(),1);assert.equal(f.identities(),initial+1,'closed transport is reported without reconnecting or another read');
});
test('a completed heartbeat coalesces immediate focus and navigation reads',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=await fixture(t),settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();},before=f.identities();t.mock.timers.tick(5000);await settle();assert.equal(f.identities(),before+1);await Promise.all([f.panel.refreshConnection(),f.panel.refreshConnection()]);assert.equal(f.identities(),before+1);assert.equal(f.opens(),1);assert.equal(f.challenges(),0);
});
test('running tasks skip only periodic duplicate reads; foreground checks and idle polling remain available',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:10000});const f=await fixture(t),settle=async()=>{for(let i=0;i<40;i++)await Promise.resolve();},initial={identity:f.identities(),binding:f.reads()};f.panel.dispose();f.setBusy(true);
 for(let i=0;i<3;i++){t.mock.timers.tick(5000);await settle();}
 assert.equal(f.identities(),initial.identity);assert.equal(f.reads(),initial.binding);assert.equal(f.panel.getState().ready,true);assert.equal(f.challenges(),0);
 f.foreground();await settle();assert.equal(f.identities(),initial.identity+1,'returning to foreground still checks the bridge during a task');assert.equal(f.reads(),initial.binding+1);
 assert.equal(await f.panel.refreshConnection({force:true}),true);assert.equal(f.identities(),initial.identity+2,'explicit lifecycle refresh is not disabled by the timer gate');
 f.setBusy(false);t.mock.timers.tick(5000);await settle();assert.equal(f.identities(),initial.identity+3);assert.equal(f.reads(),initial.binding+3);assert.equal(f.opens(),1);assert.equal(f.pairs(),1);assert.equal(f.challenges(),0);
});
test('transport disconnect still immediately revokes readiness while periodic task reads are suppressed',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=await fixture(t),initial=f.identities();f.setBusy(true);f.disconnectTransport();assert.equal(f.panel.getState().connected,false);assert.equal(f.panel.getState().ready,false);assert.equal(f.updates.at(-1).ready,false);
 t.mock.timers.tick(15000);for(let i=0;i<40;i++)await Promise.resolve();assert.equal(f.identities(),initial);assert.equal(f.opens(),1);
});
test('explicit device refresh still exposes progress while fresh readiness checks stay silent',async t=>{
 const f=await fixture(t),release=f.stall(),request=f.field('[data-refresh]').onclick();assert.equal(f.panel.getState().status,'connecting');assert.equal(f.panel.getState().checking,true);release();await request;assert.equal(f.panel.getState().ready,true);assert.equal(f.panel.getState().checking,false);const again=f.stall(),ready=f.panel.ensureReady();assert.equal(f.panel.getState().checking,false);again();assert.equal(await ready,true);
});
test('RTC loss during a task keeps idle recovery queued after its panel closes',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=await fixture(t);const settle=async()=>{for(let i=0;i<80;i++)await Promise.resolve();};
 f.panel.dispose();f.setBusy(true);f.disconnectTransport();assert.equal(f.panel.getState().ready,false);
 t.mock.timers.tick(15000);await settle();assert.equal(f.opens(),1);
 f.setBusy(false);t.mock.timers.tick(1000);await settle();t.mock.timers.tick(500);await settle();
 assert.equal(f.opens(),2);assert.equal(f.panel.getState().ready,true);
 f.field('[data-disconnect]').onclick();t.mock.timers.tick(30000);await settle();assert.equal(f.opens(),2);assert.equal(f.panel.getState().ready,false);
});
