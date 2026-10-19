import test from 'node:test';
import assert from 'node:assert/strict';
import {createDevicePanel} from '../../apps/web/ui/device-panel.js';
import {openStore} from '../../apps/web/core/store.js';
import {createDeviceSetupLink,parseDeviceSetupLink,takeDeviceSetupLink,bridgeImportURL,rememberDeviceSetupReturn,pendingDeviceSetupReturn} from '../../apps/web/core/device-setup.js';
const rtc={ip:'192.168.0.125',port:18948,fingerprint:'ab'.repeat(32)},endpoint='http://igent.local';
function fixture(t,{href='https://igent.cc/',open=async()=>{},saved={},storageError=false}={}){
 const previous=new Map(['document','location','history','addEventListener','removeEventListener','sessionStorage'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)])),fields=new Map(),events=new Map(),values=new Map();let markup='',opens=0;
 const field=key=>{if(!fields.has(key))fields.set(key,{value:'',checked:false,dataset:{},listeners:{},classList:{toggle(){}},addEventListener(name,fn){this.listeners[name]=fn;},replaceChildren(){},append(){}});return fields.get(key);};
 const root={isConnected:true,querySelector:field,querySelectorAll:()=>[],closest:()=>null},holder={querySelector:()=>root,contains:node=>node===root};
 const location=new URL(href);
 const globals={document:{documentElement:{},addEventListener(){},removeEventListener(){},querySelector:()=>({}),createElement:()=>({}),head:{append(){}}},location,history:{replaceState(s,t,path){location.href=new URL(path,location).href;}},addEventListener:(k,fn)=>events.set(k,fn),removeEventListener:(k,fn)=>{if(events.get(k)===fn)events.delete(k);},sessionStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}};
 for(const[k,value]of Object.entries(globals))Object.defineProperty(globalThis,k,{configurable:true,value});
 t.after(()=>{for(const[k,v]of previous)if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];});
 const make=async(store)=>{await store.saveSettings(saved);if(storageError)store.saveSettings=async()=>{throw Error('storage closed');};const panel=createDevicePanel({store,capture:{active:false},getPanelRoot:()=>holder,openPanel(a,b,html){markup=html;field('[data-address]').value=/data-address[^>]+value="([^"]*)"/.exec(html)[1];},bridgeFactory:options=>{opens++;return {open:()=>open(options),close(){},exportConfiguration:()=>options.rtc};}});t.after(()=>panel.destroy());return panel;};
 return {make,field,events,location,storage:globals.sessionStorage,markup:()=>markup,opens:()=>opens};
}
test('fresh browser must get information first; later controls cannot start a connection',async t=>{
 const f=fixture(t),store=await openStore({memory:true}),panel=await f.make(store);await panel.open();assert.equal(f.field('[data-info-step]').hidden,false);assert.equal(f.field('[data-pair]').disabled,true);assert.equal(panel.getState().informationReady,false);await f.field('[data-pair]').onclick();assert.equal(f.opens(),0);assert.equal(f.field('[data-start-challenge]').disabled,true);assert.equal(f.field('[data-start-sharing]').disabled,true);assert.ok(!f.markup().includes('data-connect-shortcut'));
 const url=new URL(f.field('[data-import-connection]').href);assert.equal(url.searchParams.get('import'),'1');f.field('[data-import-connection]').onclick();assert.equal(pendingDeviceSetupReturn({storage:f.storage}),true);
});
test('information is durable before connecting, survives failed connection and reload',async t=>{
 const link=createDeviceSetupLink({boardId:'board-a',httpUrl:endpoint,rtc}),f=fixture(t,{href:link,open:async options=>{options.onProgress({phase:'handshake'});throw Object.assign(Error('unreachable'),{code:'DEVICE_RTC_CONNECT_FAILED'});}}),store=await openStore({memory:true});let panel=await f.make(store);await panel.open();assert.equal(f.location.hash,'');assert.equal((await store.getSettings()).deviceRTC.ip,rtc.ip);assert.equal((await store.getSettings()).deviceBoardId,'board-a');assert.equal(f.opens(),0);assert.equal(f.field('[data-info-step]').hidden,false);assert.equal(f.field('[data-pair]').disabled,false);await f.field('[data-pair]').onclick();assert.equal(panel.getState().connected,false);assert.equal((await store.getSettings()).deviceRTC.ip,rtc.ip);assert.match(f.field('[data-progress-message]').textContent,/failed|失败/i);panel.destroy();panel=await f.make(store);await panel.open();assert.equal(f.field('[data-info-step]').hidden,false);assert.equal(f.field('[data-pair]').disabled,false);
});
test('failed information save cannot enable a connection or discard its source',async t=>{
 const link=createDeviceSetupLink({boardId:'board-a',httpUrl:endpoint,rtc}),f=fixture(t,{href:link,storageError:true}),store=await openStore({memory:true}),panel=await f.make(store);await panel.open();assert.equal(f.opens(),0);assert.equal(f.field('[data-pair]').disabled,true);await f.field('[data-pair]').onclick();assert.equal(f.opens(),0);assert.equal(panel.getState().connected,false);
});
test('persisted pagehide suspends rather than permanently disposing a device panel',async t=>{
 const f=fixture(t,{saved:{deviceEndpoint:endpoint,deviceRTC:rtc},open:async()=>{throw Error('expected probe');}}),store=await openStore({memory:true}),panel=await f.make(store);await panel.open();f.events.get('pagehide')({persisted:true});await panel.open();await f.field('[data-pair]').onclick();assert.equal(f.opens(),1);assert.equal(f.field('[data-pair]').disabled,false);
});
test('return intent is tab-local and consumed; invalid imports do not erase their fragment',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};rememberDeviceSetupReturn({storage,now:1000});assert.equal(pendingDeviceSetupReturn({storage,now:1100}),true);assert.equal(pendingDeviceSetupReturn({storage,now:1100,consume:true}),true);assert.equal(pendingDeviceSetupReturn({storage,now:1100}),false);
 let touched=false;assert.throws(()=>takeDeviceSetupLink(new URL('https://igent.cc/#device=invalid'),{replaceState(){touched=true;}}));assert.equal(touched,false);
 const url=new URL(bridgeImportURL(endpoint,'zh-Hans','https://igent.cc/?session=test#old'));assert.equal(url.searchParams.get('return'),'https://igent.cc/?session=test');assert.equal(url.searchParams.get('lang'),'zh-Hans');assert.equal(parseDeviceSetupLink(createDeviceSetupLink({boardId:'board-a',httpUrl:endpoint,rtc})).boardId,'board-a');
});

test('pasted setup link enables connect only after its information is stored',async t=>{
 const f=fixture(t),store=await openStore({memory:true}),panel=await f.make(store);await panel.open();const save=store.saveSettings;let release;store.saveSettings=patch=>new Promise(resolve=>release=()=>save(patch).then(resolve));
 const input=f.field('[data-address]');input.value=createDeviceSetupLink({boardId:'board-a',httpUrl:endpoint,rtc});const done=input.listeners.input();assert.equal(f.field('[data-pair]').disabled,true);assert.equal(f.opens(),0);await release();await done;assert.equal(f.field('[data-pair]').disabled,false);assert.equal((await store.getSettings()).deviceRTC.ip,rtc.ip);
});
test('late information save cannot enable the address the user has since changed',async t=>{
 const f=fixture(t),store=await openStore({memory:true}),panel=await f.make(store);await panel.open();const save=store.saveSettings;let release;store.saveSettings=patch=>new Promise(resolve=>release=()=>save(patch).then(resolve));
 const input=f.field('[data-address]');input.value=createDeviceSetupLink({boardId:'board-a',httpUrl:endpoint,rtc});const old=input.listeners.input();input.value='http://other.local';await input.listeners.input();await release();await old;assert.equal(f.field('[data-pair]').disabled,true);await f.field('[data-pair]').onclick();assert.equal(f.opens(),0);
});
