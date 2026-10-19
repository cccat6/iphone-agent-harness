import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {flashFirmware,validateFirmwareManifest} from '../../apps/web/core/flasher.js';

test('the browser installer accepts Wi-Fi/BLE family profiles and excludes S2 without Bluetooth',()=>{
 for(const chip of ['esp32','esp32c2','esp32c3','esp32c5','esp32c6','esp32s3'])assert.doesNotThrow(()=>validateFirmwareManifest({schemaVersion:1,profiles:[{id:chip,chip,...(chip==='esp32c2'?{xtalMHz:26}:{}),minFlashMB:chip==='esp32c2'?2:4,flashFreq:chip==='esp32c2'?'60m':'80m',parts:[{path:chip+'/application.bin',offset:65536,size:100,sha256:'a'.repeat(64)}]}]}));
 assert.throws(()=>validateFirmwareManifest({schemaVersion:1,profiles:[{id:'esp32s2',chip:'esp32s2',minFlashMB:4,parts:[{path:'s2.bin',offset:0,size:100,sha256:'a'.repeat(64)}]}]}));
});

for(const chip of ['esp32c2','esp32c5'])test(chip+' writes its checked images at the declared offsets without rewriting C2 clock metadata',async()=>{
 const data=new Uint8Array([233,1,2,3]),sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(n=>n.toString(16).padStart(2,'0')).join(''),offset=chip==='esp32c5'?8192:0;
 const profile={id:chip,chip,...(chip==='esp32c2'?{xtalMHz:26}:{}),minFlashMB:chip==='esp32c2'?2:4,flashFreq:chip==='esp32c2'?'60m':'80m',parts:[{path:chip+'/bootloader.bin',offset,size:data.length,sha256:sha}]};let written,disconnected=false;
 class Transport{async disconnect(){disconnected=true;}}
 class ESPLoader{chip={CHIP_NAME:chip==='esp32c5'?'ESP32-C5':'ESP32-C2',getCrystalFreq:async()=>26};async main(){return this.chip.CHIP_NAME;}async detectFlashSize(){return '4MB';}flashSizeBytes(){return 4194304;}async writeFlash(value){written=value;}async after(){}}
 const result=await flashFirmware({profile,manifestUrl:'https://fixture.invalid/firmware/manifest.json',serial:{requestPort:async()=>({})},fetchImpl:async()=>new Response(data),loaderModule:{Transport,ESPLoader},md5Impl:()=> '0'.repeat(32)});
 assert.equal(result.verified,true);assert.equal(written.fileArray[0].address,offset);assert.deepEqual(written.fileArray[0].data,data);assert.equal(written.flashFreq,chip==='esp32c2'?'keep':'80m');assert.equal(disconnected,true);
});

test('the bundled Espressif loader contains the C2 and C5 ROM identifiers and flashing stubs',async()=>{
 const source=await readFile(new URL('../../apps/web/vendor/esptool-js/bundle.js',import.meta.url),'utf8');for(const chip of ['ESP32-C2','ESP32-C5']){assert.ok(source.includes('case"'+chip+'"'));assert.ok(source.includes('CHIP_NAME="'+chip+'"'));}
});

async function c2Fixtures(){
 const profiles=[],data=new Map();for(const xtalMHz of [26,40]){const body=new Uint8Array([233,xtalMHz,2,3]),sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',body))].map(n=>n.toString(16).padStart(2,'0')).join(''),id=xtalMHz===26?'esp32c2':'esp32c2-40',path=id+'/application.bin';data.set(path,body);profiles.push({id,chip:'esp32c2',xtalMHz,flashFreq:'60m',minFlashMB:2,parts:[{path,offset:65536,size:body.length,sha256}]});}return {profiles,data};
}

test('C2 installer verifies both downloads before reset and chooses the actual 40 MHz ROM variant automatically',async()=>{
 const {profiles,data}=await c2Fixtures(),events=[];let written;
 class Transport{async disconnect(){events.push('disconnect');}}
 class ESPLoader{chip={CHIP_NAME:'ESP32-C2',getCrystalFreq:async()=>40};async main(){events.push('reset');return this.chip.CHIP_NAME;}async detectFlashSize(){return '4MB';}flashSizeBytes(){return 4194304;}async writeFlash(value){written=value;events.push('write');}async after(){}}
 const result=await flashFirmware({profile:profiles[0],profiles,manifestUrl:'https://fixture.invalid/manifest.json',serial:{requestPort:async()=>({})},fetchImpl:async url=>{const path=new URL(url).pathname.slice(1);events.push(path);return new Response(data.get(path));},loaderModule:{Transport,ESPLoader},md5Impl:()=> '0'.repeat(32)});
 assert.deepEqual(events,['esp32c2/application.bin','esp32c2-40/application.bin','reset','write','disconnect']);assert.equal(result.profileId,'esp32c2-40');assert.deepEqual(written.fileArray[0].data,data.get('esp32c2-40/application.bin'));assert.equal(written.flashFreq,'keep');
});

test('C2 installer never writes a 26 MHz image to a detected 40 MHz board when that variant is unavailable',async()=>{
 const {profiles,data}=await c2Fixtures();let writes=0,closed=false;
 class Transport{async disconnect(){closed=true;}}
 class ESPLoader{chip={CHIP_NAME:'ESP32-C2',getCrystalFreq:async()=>40};async main(){return this.chip.CHIP_NAME;}async writeFlash(){writes++;}}
 await assert.rejects(flashFirmware({profile:profiles[0],manifestUrl:'https://fixture.invalid/manifest.json',serial:{requestPort:async()=>({})},fetchImpl:async()=>new Response(data.get('esp32c2/application.bin')),loaderModule:{Transport,ESPLoader},md5Impl:()=> '0'.repeat(32)}),{code:'flash_crystal'});assert.equal(writes,0);assert.equal(closed,true);
});

test('a corrupted automatic C2 variant blocks installation before the loader can reset the board',async()=>{
 const {profiles,data}=await c2Fixtures();let reset=0;
 class Transport{}
 class ESPLoader{async main(){reset++;}}
 await assert.rejects(flashFirmware({profile:profiles[0],profiles,manifestUrl:'https://fixture.invalid/manifest.json',serial:{requestPort:async()=>({})},fetchImpl:async url=>new Response(new URL(url).pathname.includes('-40')?new Uint8Array([0,0,0,0]):data.get('esp32c2/application.bin')),loaderModule:{Transport,ESPLoader},md5Impl:()=> '0'.repeat(32)}),{code:'flash_integrity'});assert.equal(reset,0);
});

test('C2 has one automatic installer choice while both verified crystal images remain available',async()=>{
 const {firmwareInstallerChoices}=await import('../../apps/web/core/flasher.js'),{profiles}=await c2Fixtures(),others=[{id:'esp32c3',chip:'esp32c3'},{id:'esp32c5',chip:'esp32c5'}],all=[...profiles,...others],choices=firmwareInstallerChoices(all);assert.deepEqual(choices.map(p=>p.id),['esp32c2','esp32c3','esp32c5']);assert.equal(all.length,4);assert.deepEqual(all.filter(p=>p.chip==='esp32c2').map(p=>p.xtalMHz),[26,40]);
});

test('2 MB C2 images retain their declared flash size, while undersized devices are rejected',async()=>{
 const {profiles,data}=await c2Fixtures();for(const megabytes of [1,2]){let written=false;
 class Transport{async disconnect(){}}
 class ESPLoader{chip={CHIP_NAME:'ESP32-C2',getCrystalFreq:async()=>26};async main(){return this.chip.CHIP_NAME;}async detectFlashSize(){return megabytes+'MB';}flashSizeBytes(){return megabytes*1048576;}async writeFlash(options){written=options.flashSize;}async after(){}}
 const result=flashFirmware({profile:profiles[0],manifestUrl:'https://fixture.invalid/manifest.json',serial:{requestPort:async()=>({})},fetchImpl:async()=>new Response(data.get('esp32c2/application.bin')),loaderModule:{Transport,ESPLoader},md5Impl:()=> '0'.repeat(32)});
 if(megabytes===1){await assert.rejects(result,{code:'flash_capacity_c2'});assert.equal(written,false);}else{assert.equal((await result).verified,true);assert.equal(written,'2MB');}
 }
 const invalid={...profiles[0],parts:[{...profiles[0].parts[0],offset:2*1048576}]};assert.throws(()=>validateFirmwareManifest({schemaVersion:1,profiles:[invalid]}));
 assert.throws(()=>validateFirmwareManifest({schemaVersion:1,profiles:[{...profiles[0],id:'esp32c3',chip:'esp32c3'}]}));
});
