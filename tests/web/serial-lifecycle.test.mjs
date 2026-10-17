import test from 'node:test';
import assert from 'node:assert/strict';
import {readDeviceSetup,flashFirmware} from '../../apps/web/core/flasher.js';
const setup={format:'iah-setup/1',boardId:'synthetic-board',hostname:'synthetic.local',httpsUrl:'https://synthetic.local',apSsid:'synthetic',apPassword:'synthetic-ap',setupPassword:'synthetic-owner-password',caReady:false};
function fixture(){let input;const calls=[];return {calls,port:{readable:null,writable:null,async open(){calls.push('open');this.readable=new ReadableStream({start(controller){input=controller;}});this.writable=new WritableStream({write(){calls.push('setup-info');input.enqueue(new TextEncoder().encode('IAH_SETUP '+JSON.stringify(setup)+'\n'));}});},async close(){calls.push('close');this.readable=null;this.writable=null;}}};}
test('native chooser time is not charged to the USB I/O deadline',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let select;const {port,calls}=fixture();const pending=readDeviceSetup({serial:{requestPort:()=>new Promise(resolve=>{select=resolve;})},timeoutMs:10});
 t.mock.timers.tick(60000);assert.deepEqual(calls,[]);select(port);assert.equal((await pending).boardId,setup.boardId);assert.deepEqual(calls,['open','setup-info','close']);
});
test('external cancellation while choosing never opens the subsequently chosen port',async()=>{
 let select;const controller=new AbortController(),{port,calls}=fixture(),pending=readDeviceSetup({serial:{requestPort:()=>new Promise(resolve=>{select=resolve;})},signal:controller.signal});controller.abort();select(port);await assert.rejects(pending,{code:'flash_setup_timeout'});assert.deepEqual(calls,[]);
});
test('successful flash pulses reset with DTR clear before returning verified',async()=>{
 const data=new Uint8Array([1,2,3,4]),sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(n=>n.toString(16).padStart(2,'0')).join(''),events=[];
 const profile={id:'esp32c3',chip:'esp32c3',minFlashMB:4,parts:[{path:'esp32c3/application.bin',offset:65536,size:data.length,sha256:sha}]};let options;
 class Transport{constructor(){this.cachedDTR=true;}async setDTR(value){this.cachedDTR=value;events.push(['DTR',value]);}async setRTS(value){events.push(['RTS',value]);await this.setDTR(this.cachedDTR);}async disconnect(){events.push(['disconnect']);}}
 class ESPLoader{chip={CHIP_NAME:'ESP32-C3'};constructor(value){options=value;}async main(){return 'ESP32-C3';}async detectFlashSize(){return '4MB';}flashSizeBytes(){return 4194304;}async writeFlash(){events.push(['write']);}async after(mode){assert.equal(mode,'hard_reset');await options.resetConstructors.hardReset(options.transport,false).reset();}}
 const result=await flashFirmware({profile,manifestUrl:'https://fixture.invalid/firmware/manifest.json',serial:{requestPort:async()=>({})},fetchImpl:async()=>new Response(data),loaderModule:{Transport,ESPLoader},md5Impl:()=> '0'.repeat(32)});
 assert.equal(result.verified,true);assert.deepEqual(events,[['write'],['DTR',false],['RTS',true],['DTR',false],['RTS',false],['DTR',false],['disconnect']]);
});
test('an uncancellable port open that completes after timeout is closed by its original owner',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {port,calls}=fixture(),open=port.open.bind(port);let complete;
 port.open=()=>new Promise(resolve=>{complete=async()=>{await open();resolve();};});const pending=readDeviceSetup({port,timeoutMs:5});
 t.mock.timers.tick(10);await assert.rejects(pending,{code:'flash_setup_timeout'});await complete();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(calls,['open','close']);
});
