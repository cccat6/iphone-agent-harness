import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createDevicePanel} from '../../apps/web/ui/device-panel.js';
import {createDeviceSetupLink} from '../../apps/web/core/device-setup.js';
import {openStore} from '../../apps/web/core/store.js';

const endpoint='http://igent.local',oldRTC={ip:'192.168.0.100',port:18948,fingerprint:'ab'.repeat(32)},newRTC={...oldRTC,ip:'192.168.0.125'};
const link=rtc=>createDeviceSetupLink({boardId:'board-a',httpUrl:endpoint,rtc});
async function fixture(t){
 const previous=new Map(['document','location','history'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),fields=new Map();let busy=false,opens=0;
 const field=key=>{if(!fields.has(key))fields.set(key,{value:'',checked:false,dataset:{},listeners:{},classList:{toggle(){}},addEventListener(name,fn){this.listeners[name]=fn;},replaceChildren(){},append(){},focus(){}});return fields.get(key);};
 const root={isConnected:true,querySelector:field,querySelectorAll:()=>[],closest:()=>null},holder={querySelector:()=>root,contains:node=>node===root},location=new URL('https://igent.cc/');
 const globals={document:{documentElement:{},querySelector:()=>({}),addEventListener(){},removeEventListener(){},createElement:()=>({}),head:{append(){}}},location,history:{replaceState(state,title,url){location.href=new URL(url,location).href;}}};
 for(const[key,value]of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,value});t.after(()=>{for(const[key,value]of previous)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];});
 const store=await openStore({memory:true});await store.saveSettings({deviceEndpoint:endpoint,deviceRTC:oldRTC,deviceBoardId:'board-a'});
 const panel=createDevicePanel({store,capture:{active:false},isBusy:()=>busy,getPanelRoot:()=>holder,openPanel(a,b,html){field('[data-address]').value=/data-address[^>]+value="([^"]*)"/.exec(html)[1];},bridgeFactory:()=>{opens++;throw Error('Import never starts a connection');}});t.after(()=>panel.destroy());await panel.open();
 return {panel,store,location,field,opens:()=>opens,busy:value=>busy=value};
}

test('an already running document imports a new fragment on its next device-panel open',async t=>{
 const f=await fixture(t);f.location.href=link(newRTC);assert.equal(f.panel.receiveSetupLink(),true);assert.equal(f.panel.getState().informationReady,false);assert.equal((await f.store.getSettings()).deviceRTC.ip,oldRTC.ip);assert.ok(f.location.hash);
 await f.panel.open();assert.equal((await f.store.getSettings()).deviceRTC.ip,newRTC.ip);assert.equal(f.location.hash,'');assert.equal(f.panel.hasPendingSetup(),false);assert.equal(f.field('[data-pair]').disabled,false);assert.equal(f.opens(),0);
});

test('busy imports are deferred without settings writes or network calls and retain only the latest link',async t=>{
 const f=await fixture(t);f.busy(true);f.location.href=link(newRTC);f.panel.receiveSetupLink();await f.panel.open();assert.equal((await f.store.getSettings()).deviceRTC.ip,oldRTC.ip);assert.ok(f.location.hash);assert.equal(f.panel.hasPendingSetup(),true);
 const latest={...newRTC,ip:'192.168.0.126'};f.location.href=link(latest);f.panel.receiveSetupLink();f.panel.receiveSetupLink();f.busy(false);await f.panel.open();assert.equal((await f.store.getSettings()).deviceRTC.ip,latest.ip);assert.equal(f.location.hash,'');assert.equal(f.opens(),0);
});

test('failed same-document storage keeps its source fragment available for retry',async t=>{
 const f=await fixture(t),save=f.store.saveSettings;f.location.href=link(newRTC);f.panel.receiveSetupLink();f.store.saveSettings=async()=>{throw Error('storage failed');};await f.panel.open();assert.ok(f.location.hash);assert.equal(f.field('[data-pair]').disabled,true);f.store.saveSettings=save;await f.panel.open();assert.equal((await f.store.getSettings()).deviceRTC.ip,newRTC.ip);assert.equal(f.location.hash,'');
});

const source=fs.readFileSync(new URL('../../apps/web/app.js',import.meta.url),'utf8'),start=source.indexOf('function queueDeviceSetupImport('),end=source.indexOf("document.addEventListener('click',onNavigationClick);",start),navigationCode=source.slice(start,end);
function navigationFixture(){
 const calls=[],listeners={},state={running:false,submitting:false,flashing:false,devicePanel:{receiveSetupLink:()=>true,hasPendingSetup:()=>true},navigation:{pop:async event=>calls.push('pop:'+event.name)}},location={href:link(newRTC)};
 const context={state,location,window:{addEventListener:(name,fn)=>listeners[name]=fn},rememberRouteDraft(){},renderPlatform(){calls.push('render');},showDevices:async()=>calls.push('devices'),report:error=>{throw error;}};vm.createContext(context);vm.runInContext(navigationCode,context);return {state,location,calls,listeners};
}
test('popstate plus hashchange opens the device panel once after restoring history',async()=>{
 const f=navigationFixture();f.listeners.popstate({name:'setup'});f.listeners.hashchange();await f.state.deviceSetupImportTask;assert.deepEqual(f.calls,['pop:setup','devices']);
});
test('hash import does not navigate during an active task and a later import supersedes an older queued one',async()=>{
 const f=navigationFixture();f.state.running=true;f.listeners.hashchange();assert.deepEqual(f.calls,[]);assert.equal(f.state.deviceSetupImportTask,undefined);
 f.state.running=false;f.listeners.hashchange();f.location.href=link({...newRTC,ip:'192.168.0.127'});f.listeners.hashchange();await f.state.deviceSetupImportTask;assert.deepEqual(f.calls,['devices']);
});
