import test from 'node:test';
import assert from 'node:assert/strict';
import {DeviceClient,createDeviceURL} from '../../apps/web/core/device.js';
import {createDeviceSetupLink,parseDeviceSetupLink,takeDeviceSetupLink} from '../../apps/web/core/device-setup.js';
import {parseDeviceSetupLine} from '../../apps/web/core/flasher.js';
const identity={boardId:'board-local',bootId:'boot-local',hostname:'harness-local.local',publicKeyFingerprint:'a'.repeat(64),transport:'http',tls:false,requiresManualTrust:false};
test('private LAN HTTP pairing needs no CA, opts into LNA and never enables control before phone proof',async()=>{
 const calls=[];const client=new DeviceClient({baseUrl:'http://harness-local.local',fetchImpl:async(url,options)=>{calls.push({url:String(url),...options});if(url.pathname==='/v1/identity')return Response.json(identity);if(url.pathname==='/v1/pair'){const body=JSON.parse(options.body);return Response.json({...identity,clientId:body.clientId,token:'b'.repeat(64)});}throw Error('Unexpected request');}});
 await client.pair({clientId:'browser-local',setupPassword:'c'.repeat(64)});
 assert.equal(client.paired,true);assert.equal(client.bindingVerified,false);assert.equal(client.leaseVerified,false);
 assert.equal(calls.filter(v=>v.url.endsWith('/v1/pair')).length,1);assert.ok(calls.every(v=>v.targetAddressSpace==='local'&&v.url.startsWith('http:')));assert.equal(client.status().publicKeyFingerprint,identity.publicKeyFingerprint);
});
test('only local HTTP origins are accepted; no public, localhost or credential URLs',()=>{
 for(const value of ['http://10.0.0.2','http://172.16.1.4','http://172.31.1.4','http://192.168.1.2','http://harness-board.local'])assert.equal(createDeviceURL(value),value);
 for(const value of ['http://172.15.1.4','http://172.32.1.4','http://8.8.8.8','http://localhost','http://127.0.0.1','http://example.com','http://user:pw@harness.local','http://harness.local/path','http://harness.local?secret=x'])assert.throws(()=>createDeviceURL(value));
});
test('phone setup link contains address and identity only and removes fragment on entry',()=>{
 const info={httpUrl:'http://harness-local.local',boardId:'board-local',setupPassword:'c'.repeat(64)},link=createDeviceSetupLink(info);const u=new URL(link);
 assert.equal(u.search,'');assert.equal(u.pathname,'/');assert.equal(parseDeviceSetupLink(link).setupPassword,undefined);assert.ok(!JSON.stringify(parseDeviceSetupLink(link)).includes(info.setupPassword));
 let replaced;const result=takeDeviceSetupLink(u,{state:null,replaceState(...args){replaced=args[2];}});assert.equal(replaced,'/');assert.equal(result.baseUrl,info.httpUrl);assert.equal(result.boardId,info.boardId);
 assert.throws(()=>parseDeviceSetupLink('https://igent.cc/#device=invalid'));
});
test('new USB info accepts LAN HTTP without certificate; rejects path and unrelated-host substitution',()=>{
 const info={format:'iah-setup/1',boardId:'board-local',hostname:'harness-local.local',apSsid:'iPhone-Harness-local',apPassword:'test-only-password',setupPassword:'c'.repeat(64),httpUrl:'http://harness-local.local',httpsUrl:null,caReady:false,publicKeyFingerprint:identity.publicKeyFingerprint};
 assert.equal(parseDeviceSetupLine('IAH_SETUP '+JSON.stringify(info)).httpUrl,info.httpUrl);
 for(const httpUrl of ['http://another.local','http://harness-local.local/path','http://harness-local.local?key=x'])assert.throws(()=>parseDeviceSetupLine('IAH_SETUP '+JSON.stringify({...info,httpUrl})));
});

test('legacy HTTPS firmware does not produce a current no-CA setup link',()=>{
 assert.throws(()=>createDeviceSetupLink({httpsUrl:'https://harness-local.local',boardId:'board-local',setupPassword:'c'.repeat(64)}),/DEVICE_SETUP_UPGRADE_REQUIRED/);
});
