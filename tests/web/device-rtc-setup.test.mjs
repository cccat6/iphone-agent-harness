import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeviceSetupLink,parseDeviceSetupLink,takeDeviceSetupLink} from '../../apps/web/core/device-setup.js';
import {parseDeviceSetupLine} from '../../apps/web/core/flasher.js';
const rtc={ip:'192.168.0.125',port:18948,fingerprint:'ab'.repeat(32)},info={format:'iah-setup/1',boardId:'board',hostname:'igent.local',httpUrl:'http://igent.local',apSsid:'test',apPassword:'test-only-password',caReady:false,rtc};
test('USB and one-time setup links preserve only public RTC metadata and erase incoming fragment',()=>{
 const usb=parseDeviceSetupLine('IAH_SETUP '+JSON.stringify({...info,owner:'not-exported',setupPassword:'not-exported'})),link=createDeviceSetupLink(usb),parsed=parseDeviceSetupLink(link);assert.equal(parsed.rtc.ip,rtc.ip);assert.equal(parsed.rtc.port,18948);assert.equal(parsed.rtc.fingerprint,'AB:'.repeat(31)+'AB');assert.equal(parsed.baseUrl,info.httpUrl);assert.equal(parsed.boardId,info.boardId);assert.equal(usb.owner,undefined);assert.equal(usb.setupPassword,undefined);
 const raw=JSON.parse(Buffer.from(new URL(link).hash.slice(8),'base64url').toString());assert.equal(raw.owner,undefined);assert.equal(raw.rtc.ip,rtc.ip);let replaced='';const taken=takeDeviceSetupLink(new URL(link),{replaceState(state,title,value){replaced=value;}});assert.equal(replaced,'/');assert.deepEqual(taken,parsed);
});
test('malformed RTC metadata is rejected before USB or setup link imports',()=>{
 for(const invalid of [{...rtc,ip:'8.8.8.8'},{...rtc,port:-1},{...rtc,fingerprint:'bad'}]){assert.throws(()=>parseDeviceSetupLine('IAH_SETUP '+JSON.stringify({...info,rtc:invalid})),{code:'flash_setup_invalid'});assert.throws(()=>createDeviceSetupLink({...info,rtc:invalid}));}
});
