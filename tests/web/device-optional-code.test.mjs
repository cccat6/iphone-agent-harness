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
 const f=fixture();await f.client.pair({clientId:'browser-a'});
 assert.equal(f.requests.find(x=>x.path==='/v1/pair').body.setupPassword,'');assert.equal(f.client.paired,true);assert.equal(f.client.identityVerified,true);assert.equal(f.client.bindingVerified,false);
});
test('enabled connection code is requested before enrollment POST',async()=>{
 const f=fixture(true);await assert.rejects(f.client.pair({clientId:'browser-a'}),{code:'DEVICE_CONNECTION_CODE_REQUIRED'});assert.ok(!f.requests.some(x=>x.path==='/v1/pair'));
 await f.client.pair({clientId:'browser-a',setupPassword:'correct-test-code'});assert.equal(f.client.paired,true);
});
test('a code enabled after identity, or an incorrect code, retains actionable server reason',async()=>{
 for(const [serverCode,expected] of [['connection_code_required','DEVICE_CONNECTION_CODE_REQUIRED'],['connection_code_invalid','DEVICE_CONNECTION_CODE_INVALID']]){
  const f=fixture(false,{serverCode});await assert.rejects(f.client.pair({clientId:'browser-a',setupPassword:serverCode.endsWith('invalid')?'wrong':''}),{code:expected});assert.equal(f.client.paired,false);
 }
});
test('optional-code setup links carry no owner secret and old protected links remain supported',()=>{
 const info={httpUrl:'http://igent.local',boardId:'board-a',pairingCodeRequired:false,setupPassword:'must-not-be-exported'};
 const link=createDeviceSetupLink(info),raw=JSON.parse(atob(new URL(link).hash.slice(8).replaceAll('-','+').replaceAll('_','/')));
 assert.equal(raw.owner,undefined);assert.equal(parseDeviceSetupLink(link).setupPassword,'');
 assert.equal(parseDeviceSetupLink(createDeviceSetupLink({...info,pairingCodeRequired:true,setupPassword:'x'.repeat(32)})).setupPassword,'x'.repeat(32));
});

test('USB setup accepts an empty code only when the bridge explicitly disabled it',()=>{
 const info={format:'iah-setup/1',boardId:'board-a',hostname:'igent.local',httpUrl:'http://igent.local',apSsid:'test-setup',apPassword:'test-wifi-password',setupPassword:'',pairingCodeRequired:false,caReady:false,publicKeyFingerprint:'a'.repeat(64)};
 assert.equal(parseDeviceSetupLine('IAH_SETUP '+JSON.stringify(info)).pairingCodeRequired,false);
 assert.throws(()=>parseDeviceSetupLine('IAH_SETUP '+JSON.stringify({...info,pairingCodeRequired:true})));assert.throws(()=>parseDeviceSetupLine('IAH_SETUP '+JSON.stringify({...info,pairingCodeRequired:undefined})));
});
