import test from 'node:test';
import assert from 'node:assert/strict';
import {DeviceRTCTransport,validateRTCConfiguration,encodeRTCFrames} from '../../apps/web/core/device-rtc.js';
import {createDeviceSetupLink,parseDeviceSetupLink} from '../../apps/web/core/device-setup.js';
const baseUrl='http://igent.local',rtc={ip:'192.168.0.125',port:18948,ports:[18948,18949],fingerprint:'ab'.repeat(32)};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class Events{events=new Map();addEventListener(name,fn){if(!this.events.has(name))this.events.set(name,[]);this.events.get(name).push(fn);}emit(name,event={}){for(const fn of this.events.get(name)||[])fn(event);}}
class Channel extends Events{readyState='connecting';frames=[];send(raw){assert.equal(this.readyState,'open');this.frames.push(JSON.parse(raw));}open(){this.readyState='open';this.emit('open');}close(){if(this.readyState==='closed')return;this.readyState='closed';this.emit('close');}}
function peerClass({auto=true,failPorts=[],occupied=new Map()}={}){
 return class Peer extends Events{
  static instances=[];
  constructor(options){super();this.options=options;this.number=this.constructor.instances.push(this);this.channel=new Channel();this.connectionState='new';this.iceConnectionState='new';}
  createDataChannel(label,options){this.channelOptions=options;return this.channel;}
  async createOffer(){return {type:'offer',sdp:`v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=mid:0\r\na=ice-pwd:credentials${String(this.number).padStart(22,'0')}\r\n`};}
  async setLocalDescription(value){this.localDescription=structuredClone(value);}
  async setRemoteDescription(value){this.answer=value;this.port=Number(/m=application (\d+)/.exec(value.sdp)[1]);if(failPorts.includes(this.port)){this.connectionState='failed';this.emit('connectionstatechange');return;}if(auto&&!occupied.has(this.port)){occupied.set(this.port,this);this.channel.open();}}
  close(){if(this.connectionState==='closed')return;this.connectionState='closed';if(occupied.get(this.port)===this)occupied.delete(this.port);this.channel.close();this.emit('connectionstatechange');}
 };
}
function reply(peer){const frame=peer.channel.frames.at(-1);for(const wire of encodeRTCFrames(frame.id,{status:200,body:'{}'},'res',frame.n))peer.channel.emit('message',{data:wire});}
test('two-port setup metadata is validated and survives phone setup-link import',()=>{
 for(const ports of [[],[18948,18948],[18949],[0,18948],[18948,65536],[18948,'18949'],[18948,18949,18950],{}])assert.throws(()=>validateRTCConfiguration({...rtc,ports}),{code:'DEVICE_RTC_CONFIG_INVALID'});
 const value=validateRTCConfiguration(rtc);assert.deepEqual(value.ports,[18948,18949]);const link=createDeviceSetupLink({boardId:'bridge',httpUrl:baseUrl,rtc},'https://igent.cc');assert.deepEqual(parseDeviceSetupLink(link).rtc.ports,[18948,18949]);
 assert.equal(validateRTCConfiguration({...rtc,ports:undefined}).ports,undefined);
});
test('two browser transports find different slots and every probe has separate ICE credentials',async()=>{
 const Peer=peerClass(),first=new DeviceRTCTransport({baseUrl,rtc,Peer,hedgeDelayMs:5}),second=new DeviceRTCTransport({baseUrl,rtc,Peer,hedgeDelayMs:5});
 try{
  await first.open();await second.open();assert.equal(first.pc.port,18948);assert.equal(second.pc.port,18949);assert.equal(first.ready,true);assert.equal(second.ready,true);
  assert.equal(Peer.instances.length,3);assert.equal(Peer.instances[1].connectionState,'closed');assert.equal(new Set(Peer.instances.map(peer=>peer.localDescription.sdp)).size,3);
  assert.ok(Peer.instances.every(peer=>peer.channel.frames.length===0));assert.deepEqual(second.exportConfiguration().ports,[18948,18949]);
  const pending=second.fetch(baseUrl+'/v1/identity');reply(second.pc);assert.equal((await pending).status,200);assert.equal(first.channel.frames.length,0);assert.equal(Peer.instances[1].channel.frames.length,0);
 }finally{first.close();second.close();}
});
test('the first ready channel wins; late losing events never disconnect it or send RPC',async()=>{
 const Peer=peerClass({auto:false});let lost=0;const transport=new DeviceRTCTransport({baseUrl,rtc,Peer,hedgeDelayMs:1,onDisconnect:()=>lost++});
 const opening=transport.open();await sleep(8);assert.equal(Peer.instances.length,2);await assert.rejects(transport.fetch(baseUrl+'/v1/identity'),{code:'DEVICE_RTC_CLOSED'});
 const [first,second]=Peer.instances;second.channel.open();first.channel.open();await opening;
 assert.equal(transport.pc,second);assert.equal(first.connectionState,'closed');first.channel.emit('close');first.emit('connectionstatechange');assert.equal(transport.ready,true);assert.equal(lost,0);assert.ok(Peer.instances.every(peer=>peer.channel.frames.length===0));
 transport.close();assert.equal(lost,1);assert.equal(second.connectionState,'closed');
});
test('failed primary starts fallback immediately and only winner loss reaches the owner',async()=>{
 const Peer=peerClass({failPorts:[18948]});let lost=0;const transport=new DeviceRTCTransport({baseUrl,rtc,Peer,hedgeDelayMs:5000,connectTimeoutMs:100,onDisconnect:()=>lost++});
 await transport.open();assert.equal(transport.pc.port,18949);assert.equal(lost,0);assert.equal(Peer.instances[0].channel.frames.length,0);
 transport.pc.connectionState='failed';transport.pc.emit('connectionstatechange');assert.equal(transport.closed,true);assert.equal(lost,1);
});
test('one connection deadline and caller cancellation close every probe without owner disconnect',async()=>{
 for(const cancel of [false,true]){
  const Peer=peerClass({auto:false}),controller=new AbortController();let lost=0;
  const transport=new DeviceRTCTransport({baseUrl,rtc,Peer,connectTimeoutMs:40,hedgeDelayMs:5,onDisconnect:()=>lost++});
  const result=assert.rejects(transport.open({signal:controller.signal}),{code:cancel?'DEVICE_REQUEST_CANCELLED':'DEVICE_RTC_CONNECT_TIMEOUT'});
  await sleep(12);assert.equal(Peer.instances.length,2);if(cancel)controller.abort();await result;
  assert.equal(transport.closed,true);assert.equal(lost,0);assert.ok(Peer.instances.every(peer=>peer.connectionState==='closed'&&peer.channel.frames.length===0));
 }
});
test('single-port custom metadata opens exactly one peer and progress exceptions are isolated',async()=>{
 const Peer=peerClass(),transport=new DeviceRTCTransport({baseUrl,rtc:{...rtc,port:19001,ports:undefined},Peer,onProgress(){throw Error('observer failure');}});
 await transport.open();assert.equal(Peer.instances.length,1);assert.equal(transport.ready,true);transport.close();
});

test('old saved standard-port links use the second slot without reimporting metadata',async()=>{
 const occupied=new Map([[18948,{}]]),Peer=peerClass({occupied});
 const transport=new DeviceRTCTransport({baseUrl,rtc:{...rtc,ports:undefined},Peer,hedgeDelayMs:1});
 await transport.open();assert.equal(transport.pc.port,18949);assert.deepEqual(transport.exportConfiguration().ports,[18948,18949]);assert.equal(Peer.instances[0].connectionState,'closed');assert.ok(Peer.instances.every(peer=>peer.channel.frames.length===0));transport.close();
});
