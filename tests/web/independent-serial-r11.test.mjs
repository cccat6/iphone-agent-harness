import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {flashFirmware,readDeviceSetup} from '../../apps/web/core/flasher.js';
import {ESPLoader,Transport} from '../../apps/web/vendor/esptool-js/bundle.js';
import md5 from '../../apps/web/vendor/js-md5/md5.js';

const bytes=new Uint8Array([5,8,13,21]);
const profile={id:'independent-r11',chip:'esp32c3',minFlashMB:4,parts:[{path:'esp32c3/app.bin',offset:65536,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}]};
const information={format:'iah-setup/1',boardId:'independent-r11',hostname:'independent.local',httpsUrl:'https://independent.local',apSsid:'independent',apPassword:'synthetic-ap',setupPassword:'synthetic-owner-password',caReady:false};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
async function until(predicate){for(let i=0;i<1000&&!predicate();i++)await turn();assert.ok(predicate(),'expected lifecycle stage was reached');}
function loaderFixture({otg=false,signalFailure,chip='ESP32-C3',capacity='4MB',writeFailure}={}){
  const events=[];
  const port={readable:null,writable:null,getInfo:()=>({usbVendorId:0x303a,usbProductId:0x1001}),async setSignals(value){events.push(value);if(signalFailure?.(value))throw new Error('signal failure');},async close(){events.push('close');}};
  class Loader extends ESPLoader{
    async main(){this.chip={CHIP_NAME:chip};await this.transport.setDTR(true);return chip;}
    async detectFlashSize(){return capacity;}
    async usesUsbOtg(){return otg;}
    async writeFlash(options){events.push('write');assert.equal(options.eraseAll,false);assert.equal(options.compress,true);assert.equal(options.flashSize,'4MB');assert.equal(options.flashMode,'dio');assert.equal(options.flashFreq,'40m');assert.deepEqual(options.fileArray,[{data:bytes,address:65536}]);assert.equal(options.calculateMD5Hash(bytes),createHash('md5').update(bytes).digest('hex'));if(writeFailure)throw new Error('device MD5 mismatch');}
  }
  return {events,port,run:(extra={})=>flashFirmware({profile,manifestUrl:'https://fixture.invalid/firmware/manifest.json',serial:{requestPort:async()=>port},fetchImpl:async()=>new Response(bytes),loaderModule:{ESPLoader:Loader,Transport},md5Impl:md5,...extra})};
}
function setupPort(){
  const events=[];let input;
  const port={readable:null,writable:null,async open(){events.push('open');this.readable=new ReadableStream({start(controller){input=controller;}});this.writable=new WritableStream({write(value){events.push(JSON.parse(new TextDecoder().decode(value)).op);input.enqueue(new TextEncoder().encode('IAH_SETUP '+JSON.stringify(information)+'\n'));}});},async close(){events.push('close');this.readable=null;this.writable=null;}};
  return {events,port};
}

for(const otg of [false,true])test(`actual vendor hard-reset hook clears cached DTR and awaits ${otg?'USB OTG settle':'RTS pulse'}`,async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const fixture=loaderFixture({otg});let complete=false;
  const pending=fixture.run().then(result=>{complete=true;return result;});await until(()=>fixture.events.some(e=>e?.requestToSend===true));await turn();
  assert.deepEqual(fixture.events,[{dataTerminalReady:true},'write',{dataTerminalReady:false},{requestToSend:true},{dataTerminalReady:false}]);
  t.mock.timers.tick(199);await turn();assert.equal(complete,false);assert.equal(fixture.events.includes('close'),false);
  t.mock.timers.tick(1);await turn();
  assert.deepEqual(fixture.events.slice(5),[{requestToSend:false},{dataTerminalReady:false},...(otg?[]:['close'])]);
  if(otg){assert.equal(complete,false);t.mock.timers.tick(199);await turn();assert.equal(complete,false);t.mock.timers.tick(1);}
  const result=await pending;assert.equal(result.verified,true);assert.equal(result.port,fixture.port);assert.equal(fixture.events.at(-1),'close');
});

test('actual vendor reset signal rejection never returns verified and still disconnects',async()=>{
  for(const signalFailure of [v=>v.dataTerminalReady===false,v=>v.requestToSend===true,v=>v.requestToSend===false]){
    const fixture=loaderFixture({signalFailure});await assert.rejects(fixture.run(),/signal failure/);
    assert.equal(fixture.events.at(-1),'close');assert.equal(fixture.events.filter(e=>e==='close').length,1);
  }
  const fixture=loaderFixture();assert.equal((await fixture.run()).verified,true);
});

test('hash, chip, capacity and write verification failures retain pre-write gates and cleanup',async()=>{
  const fixture=loaderFixture();await assert.rejects(fixture.run({fetchImpl:async()=>new Response(new Uint8Array([0,0,0,0]))}),{code:'flash_integrity'});assert.deepEqual(fixture.events,[]);
  for(const [options,code]of [[{chip:'ESP32-S3'},'flash_chip_mismatch'],[{capacity:'2MB'},'flash_capacity']]){
    const invalid=loaderFixture(options);await assert.rejects(invalid.run(),{code});assert.equal(invalid.events.includes('write'),false);assert.equal(invalid.events.at(-1),'close');
  }
  const invalid=loaderFixture({writeFailure:true});await assert.rejects(invalid.run(),/device MD5 mismatch/);assert.equal(invalid.events.some(e=>e?.requestToSend===true),false);assert.equal(invalid.events.at(-1),'close');
});

test('a pre-aborted setup request never invokes chooser or open and releases the operation guard',async()=>{
  const controller=new AbortController();controller.abort();let chosen=false;
  await assert.rejects(readDeviceSetup({signal:controller.signal,serial:{requestPort(){chosen=true;throw new Error('unexpected chooser');}}}),{code:'flash_setup_timeout'});assert.equal(chosen,false);
  const fixture=setupPort();assert.equal((await readDeviceSetup({port:fixture.port})).boardId,information.boardId);assert.deepEqual(fixture.events,['open','setup-info','close']);
});

test('cancelled chooser never touches a late borrowed port or its current stream owner',async()=>{
  const fixture=setupPort();await fixture.port.open();const reader=fixture.port.readable.getReader(),writer=fixture.port.writable.getWriter();let select;
  const controller=new AbortController(),pending=readDeviceSetup({signal:controller.signal,serial:{requestPort:()=>new Promise(resolve=>{select=resolve;})}});controller.abort();select(fixture.port);
  await assert.rejects(pending,{code:'flash_setup_timeout'});assert.deepEqual(fixture.events,['open']);assert.equal(fixture.port.readable.locked,true);assert.equal(fixture.port.writable.locked,true);
  reader.releaseLock();writer.releaseLock();await fixture.port.close();
});

test('late open fulfillment closes only the timed-out request port while a new request succeeds',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const late=setupPort(),other=setupPort(),open=late.port.open.bind(late.port);let finish;
  late.port.open=()=>new Promise(resolve=>{finish=async()=>{await open();resolve();};});
  const pending=readDeviceSetup({port:late.port,timeoutMs:10});const rejected=assert.rejects(pending,{code:'flash_setup_timeout'});t.mock.timers.tick(10);await rejected;
  assert.equal((await readDeviceSetup({port:other.port})).boardId,information.boardId);await finish();await turn();
  assert.deepEqual(late.events,['open','close']);assert.deepEqual(other.events,['open','setup-info','close']);
});

test('late open rejection is consumed without closing an unacquired port',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let rejectOpen,closed=0;
  const port={readable:null,open:()=>new Promise((_,reject)=>{rejectOpen=reject;}),async close(){closed++;}};
  const pending=readDeviceSetup({port,timeoutMs:10});const rejected=assert.rejects(pending,{code:'flash_setup_timeout'});t.mock.timers.tick(10);await rejected;rejectOpen(new Error('late native open failure'));await turn();assert.equal(closed,0);
  const fixture=setupPort();assert.equal((await readDeviceSetup({port:fixture.port})).boardId,information.boardId);
});

test('setup read unlocks a borrowed open port without closing it',async()=>{
  const fixture=setupPort();await fixture.port.open();assert.equal((await readDeviceSetup({port:fixture.port})).boardId,information.boardId);
  assert.deepEqual(fixture.events,['open','setup-info']);assert.equal(fixture.port.readable.locked,false);assert.equal(fixture.port.writable.locked,false);await fixture.port.close();
});
