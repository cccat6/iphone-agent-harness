import test from 'node:test';
import assert from 'node:assert/strict';
import {DeviceClient} from '../../apps/web/core/device.js';
import {createDevicePanel} from '../../apps/web/ui/device-panel.js';
import {openStore} from '../../apps/web/core/store.js';

for(const scenario of ['expired','protected','denied','different-board','still-expired'])test('saved bridge credential recovery: '+scenario,async t=>{
 const prior=Object.getOwnPropertyDescriptor(globalThis,'document'),fields=new Map(),calls=[];
 const field=selector=>{if(!fields.has(selector))fields.set(selector,{value:'',checked:false,dataset:{},classList:{toggle(){}},addEventListener(){},replaceChildren(){},append(){},focus(){document.activeElement=this;}});return fields.get(selector);};
 const root={isConnected:true,querySelector:field,querySelectorAll:()=>[],closest:()=>null},holder={querySelector:()=>root,contains:e=>e===root};
 Object.defineProperty(globalThis,'document',{configurable:true,value:{documentElement:{},addEventListener(){},removeEventListener(){},querySelector:()=>({}),createElement:()=>({}),head:{append(){}}}});
 t.after(()=>prior?Object.defineProperty(globalThis,'document',prior):delete globalThis.document);
 const store=await openStore({memory:true}),baseUrl='http://igent.local',fp='a'.repeat(64),identity={boardId:'board-a',bootId:'boot-a',hostname:'igent.local',publicKeyFingerprint:fp,pairingCodeRequired:scenario==='protected'};
 await store.saveLocalCredential('device:'+baseUrl,{format:'iah-device-credential/1',baseUrl,clientId:'saved-client',token:'stale-token-abcdefghijkl',boardId:'board-a',hostname:'igent.local',publicKeyFingerprint:fp,expectedFingerprint:fp});
 const fetchImpl=async(url,options)=>{const path=new URL(url).pathname;calls.push(path);if(path==='/v1/identity')return Response.json(scenario==='different-board'?{...identity,boardId:'other-board',publicKeyFingerprint:'b'.repeat(64)}:identity);if(path==='/v1/pair'){const body=JSON.parse(options.body);assert.equal(body.clientId,'saved-client');assert.equal(body.setupPassword,'');return Response.json({...identity,clientId:body.clientId,token:'replacement-token-abcdefghijkl'});}if(path==='/v1/binding'){if(scenario==='denied')return Response.json({error:'origin_not_allowed'},{status:403});if(scenario==='still-expired'||options.headers.Authorization==='Bearer stale-token-abcdefghijkl')return Response.json({error:'invalid_client_credential'},{status:401});return Response.json({...identity,clientId:'saved-client',targetId:null,targets:[],bindingVerified:false});}throw Error(path);};
 const panel=createDevicePanel({store,capture:{active:false},getPanelRoot:()=>holder,openPanel(a,b,html){field('[data-address]').value=/data-address[^>]+value="([^"]*)"/.exec(html)[1];},clientFactory:options=>new DeviceClient({...options,fetchImpl}),bridgeFactory:()=>({open:()=>Promise.resolve(),close(){}})});
 t.after(()=>panel.destroy());await panel.open();await field('[data-connect-shortcut]').onclick();
 if(scenario==='expired'){
 assert.equal(panel.getState().connected,true,'expired local token should not permanently block a code-free reconnect');
 assert.equal(calls.filter(path=>path==='/v1/pair').length,1,'retry enrollment once only');
 assert.equal((await store.getLocalCredential('device:'+baseUrl)).token,'replacement-token-abcdefghijkl');
 }else{assert.equal(panel.getState().connected,false);assert.equal(calls.filter(path=>path==='/v1/pair').length,scenario==='still-expired'?1:0);if(scenario==='protected'){assert.equal(field('[data-configuration]').open,true);assert.equal(document.activeElement,field('[data-owner-password]'));}}
 assert.equal(panel.getState().inputVerified,false,'re-enrollment never substitutes for phone input test');
});
