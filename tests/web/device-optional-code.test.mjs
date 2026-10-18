import test from 'node:test';
import assert from 'node:assert/strict';
import {DeviceClient} from '../../apps/web/core/device.js';
import {createDeviceSetupLink,parseDeviceSetupLink} from '../../apps/web/core/device-setup.js';
import {parseDeviceSetupLine} from '../../apps/web/core/flasher.js';

function fixture(required=false,{serverCode}={}){
 const requests=[],identity={boardId:'board-a',bootId:'boot-a',hostname:'igent.local',publicKeyFingerprint:'a'.repeat(64),pairingCodeRequired:required};
 const client=new DeviceClient({baseUrl:'http://igent.local',fetchImpl:async(url,options)=>{
  const path=new URL(url).pathname,body=options.body&&JSON.parse(options.body);requests.push({path,body});
  if(path==='/v1/identity')return Response.json(identity);
  if(path==='/v1/pair')return serverCode?Response.json({error:serverCode},{status:403}):Response.json({...identity,clientId:body.clientId,token:'test-token-without-owner-code'});
  throw Error('Unexpected route');
 }});return {client,requests};
}
test('default local bridge enrollment needs no connection code and grants no phone proof',async()=>{
 const f=fixture();await f.client.pair({clientId:'browser-a',setupPassword:'ignored-legacy-secret'});
 assert.equal(f.requests.find(x=>x.path==='/v1/pair').body.setupPassword,'');assert.equal(f.client.paired,true);assert.equal(f.client.identityVerified,true);assert.equal(f.client.bindingVerified,false);
});
test('legacy protected firmware requires an update, never requests a user secret',async()=>{
 for(const setupPassword of ['', 'obsolete-saved-secret']){const f=fixture(true);await assert.rejects(f.client.pair({clientId:'browser-a',setupPassword}),{code:'DEVICE_SETUP_UPGRADE_REQUIRED'});assert.ok(!f.requests.some(x=>x.path==='/v1/pair'));}
});
test('legacy code errors request firmware update and never send supplied secrets',async()=>{
 for(const serverCode of ['connection_code_required','connection_code_invalid']){
  const f=fixture(false,{serverCode});await assert.rejects(f.client.pair({clientId:'browser-a',setupPassword:'obsolete-saved-secret'}),{code:'DEVICE_SETUP_UPGRADE_REQUIRED'});assert.equal(f.client.paired,false);assert.equal(f.requests.find(x=>x.path==='/v1/pair').body.setupPassword,'');
 }
});
test('setup links never export or import enrollment secrets, including old links',()=>{
 for(const pairingCodeRequired of [undefined,false,true]){
 const info={httpUrl:'http://igent.local',boardId:'board-a',pairingCodeRequired,setupPassword:'must-not-be-exported'};
 const link=createDeviceSetupLink(info),raw=JSON.parse(atob(new URL(link).hash.slice(8).replaceAll('-','+').replaceAll('_','/')));
 assert.equal(raw.owner,undefined);assert.equal(raw.setupPassword,undefined);assert.equal(parseDeviceSetupLink(link).setupPassword,undefined);
 }
 const legacy='https://igent.cc/#device='+btoa(JSON.stringify({v:1,url:'http://igent.local',id:'board-a',owner:'old-owner-secret-1234'})).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
 assert.deepEqual(parseDeviceSetupLink(legacy),{baseUrl:'http://igent.local',boardId:'board-a'});
});
test('USB reads strip legacy secrets and accept new records with no code fields',()=>{
 const info={format:'iah-setup/1',boardId:'board-a',hostname:'igent.local',httpUrl:'http://igent.local',apSsid:'test-setup',apPassword:'test-wifi-password',caReady:false,publicKeyFingerprint:'a'.repeat(64)};
 for(const extra of [{},{setupPassword:'old-secret',owner:'old-secret',pairingCodeRequired:true},{setupPassword:'',pairingCodeRequired:false}]){
 const parsed=parseDeviceSetupLine('IAH_SETUP '+JSON.stringify({...info,...extra}));assert.equal(parsed.boardId,'board-a');assert.equal(parsed.setupPassword,undefined);assert.equal(parsed.owner,undefined);assert.equal(parsed.apPassword,info.apPassword);
 }
});
