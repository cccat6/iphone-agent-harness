import test from 'node:test';
import assert from 'node:assert/strict';
import {DeviceClient} from '../../apps/web/core/device.js';
import {DeviceRTCTransport,encodeRTCFrames} from '../../apps/web/core/device-rtc.js';
import {createDeviceClipboard} from '../../apps/web/core/device-clipboard.js';
const origin='http://igent.local',fingerprint='c'.repeat(64),identity={boardId:'board',bootId:'boot',hostname:'igent.local',publicKeyFingerprint:fingerprint};
const samples={quotes:'"'.repeat(110000),newlines:'\n'.repeat(110000),mixed:'你🙂\0\x01\n"\\'.repeat(11000)};
class Events{listeners=new Map();addEventListener(name,fn){this.listeners.set(name,[...(this.listeners.get(name)||[]),fn]);}emit(name,event={}){for(const fn of this.listeners.get(name)||[])fn(event);}}
test('real DeviceClient and RTC framing stream over 100KB without replay through a simulated single-slot HTTP consumer',async()=>{
 for(const [name,text]of Object.entries(samples)){
  let job,slot=null,hold=false;const output=[],offsets=new Set(),bodies=[];const progress=()=>({...identity,...job,chunkPending:slot!==null,chunkBytes:1024});
  class Channel extends Events{
   readyState='connecting';parts=[];
   send(raw){assert.ok(Buffer.byteLength(raw)<=512);const frame=JSON.parse(raw);this.parts.push(frame);if(!frame.end)return;const bytes=Buffer.concat(this.parts.map(f=>Buffer.from(f.data,'base64')));this.parts=[];assert.ok(bytes.length<=12288);const envelope=JSON.parse(bytes.toString()),body=envelope.body?JSON.parse(envelope.body):{};let response=identity;
    if(envelope.path==='/v1/binding')response={...identity,clientId:'browser',targetId:'phone',bindingVerified:true,targets:[{targetId:'phone',connected:true,encrypted:true,hidSubscribed:true,inputState:'released'}]};
    else if(envelope.path==='/v1/targets/phone/clipboard'){assert.equal(body.text,undefined);assert.equal(body.textBase64,undefined);job={clientId:'browser',targetId:'phone',requestId:body.requestId,sessionId:body.sessionId,status:'pending',jobToken:'a'.repeat(64),expiresAtDeviceMs:120000,totalBytes:body.totalBytes,nextOffset:0};response=progress();}
    else if(envelope.path.endsWith('/chunks')){assert.equal(slot,null);assert.equal(body.offset,job.nextOffset);assert.equal(offsets.has(body.offset),false,'an accepted chunk is never sent twice');offsets.add(body.offset);slot=Buffer.from(body.textBase64,'base64');assert.ok(slot.length>0&&slot.length<=1024);new TextDecoder('utf-8',{fatal:true}).decode(slot);hold=true;bodies.push(body);response=progress();}
    else if(envelope.path===`/v1/targets/phone/clipboard/${job?.requestId}`){if(job.status==='pending')job.status='streaming';else if(slot){if(hold)hold=false;else{output.push(slot);job.nextOffset+=slot.length;slot=null;if(job.nextOffset===job.totalBytes)job.status='delivered';}}else if(job.status==='delivered'){job.status='copied';job.copiedAtDeviceMs=200;}response=progress();}
    else if(envelope.path.endsWith('/cancel'))response={...progress(),status:'cancelled'};
    queueMicrotask(()=>{for(const reply of encodeRTCFrames(frame.id,{status:200,body:JSON.stringify(response)},'res',frame.n))this.emit('message',{data:reply});});
   }
   close(){this.readyState='closed';this.emit('close');}
  }
  class Peer extends Events{constructor(){super();this.channel=new Channel();this.connectionState='new';this.iceConnectionState='new';}createDataChannel(){return this.channel;}async createOffer(){return {type:'offer',sdp:'v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=mid:0\r\na=ice-pwd:abcdefghijklmnopqrstuvwx\r\n'};}async setLocalDescription(v){this.localDescription=v;}async setRemoteDescription(){this.channel.readyState='open';this.channel.emit('open');}close(){this.connectionState='closed';this.emit('connectionstatechange');}}
  const transport=new DeviceRTCTransport({baseUrl:origin,rtc:{ip:'192.168.0.125',port:18948,fingerprint},Peer});await transport.open();
  try{const client=new DeviceClient({baseUrl:origin,fetchImpl:transport.fetch});client.restoreCredentials({format:'iah-device-credential/1',baseUrl:origin,clientId:'browser',token:'a'.repeat(64),boardId:'board',hostname:'igent.local',publicKeyFingerprint:fingerprint,expectedFingerprint:fingerprint});await client.identity();await client.getBinding();const adapter=createDeviceClipboard({getDevice:()=>client,sleep:async()=>{},now:()=>100});assert.ok(Buffer.byteLength(text)>100*1024);assert.ok(text.length>20000);
   await adapter.prepare({requestId:'job-'+name,sessionId:'session',targetId:'phone',text});assert.equal(bodies.length,0,'no text leaves before the HTTP consumer starts');const receipt=await adapter.start().completion;assert.equal(receipt.status,'copied');assert.equal(job.nextOffset,Buffer.byteLength(text));assert.deepEqual(Buffer.concat(output),Buffer.from(text));assert.ok(bodies.length>100);assert.equal(adapter.getSnapshot().transferredBytes,job.totalBytes);assert.equal(transport.ready,true);
  }finally{transport.close();}
 }
});
