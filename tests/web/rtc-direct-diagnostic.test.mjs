import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDirectConfig,syntheticAnswer,selectedRoute,DirectProbeConnection} from '../../apps/web/diagnostics/rtc-direct-core.js';
const config={version:1,ip:'192.168.0.107',port:18948,fingerprint:'ab'.repeat(32)},password='abcdefghijklmnopqrstuvwx';
const offer={type:'offer',sdp:['v=0','m=application 9 UDP/DTLS/SCTP webrtc-datachannel','a=mid:0','a=ice-ufrag:abcd','a=ice-pwd:'+password,''].join('\r\n')};
class Events{constructor(){this.events=new Map();}addEventListener(name,fn){if(!this.events.has(name))this.events.set(name,[]);this.events.get(name).push(fn);}emit(name,event={}){for(const fn of this.events.get(name)||[])fn(event);}}
class Channel extends Events{readyState='connecting';sent=[];send(body){this.sent.push(body);}close(){this.readyState='closed';this.emit('close');}}
class Peer extends Events{static latest;constructor(options){super();Peer.latest=this;this.options=options;this.channel=new Channel();this.connectionState='new';this.iceConnectionState='new';}createDataChannel(label,options){this.channelOptions=options;return this.channel;}async createOffer(){return offer;}async setLocalDescription(value){this.passedOffer=value;this.localDescription=structuredClone(value);}async setRemoteDescription(value){this.answer=value;this.channel.readyState='open';this.channel.emit('open');}close(){this.connectionState='closed';this.emit('connectionstatechange');}}
test('Direct v2 answer embeds only remote ICE credentials and leaves the local offer unchanged',()=>{
 const before=offer.sdp,answer=syntheticAnswer(offer.sdp,config);assert.equal(offer.sdp,before);assert.equal(answer.type,'answer');assert.ok(answer.sdp.includes('a=ice-ufrag:libp2p+webrtc+v2/'+password+'\r\n'));assert.ok(answer.sdp.includes('a=ice-pwd:libp2p+webrtc+v2/'+password+'\r\n'));assert.ok(answer.sdp.includes('a=ice-lite\r\n'));assert.ok(answer.sdp.includes('a=setup:passive\r\n'));assert.ok(answer.sdp.includes('a=max-message-size:16384'));assert.ok(answer.sdp.includes('192.168.0.107 18948 typ host'));
 for(const invalid of ['tooShort','x'.repeat(240),'bad\r\na=malicious'])assert.throws(()=>syntheticAnswer(offer.sdp.replace(password,invalid),config));
});
test('configuration permits only literal private IPv4, valid ports and SHA-256 fingerprints',()=>{
 assert.equal(validateDirectConfig(config).fingerprint,'AB:'.repeat(31)+'AB');for(const ip of ['8.8.8.8','127.0.0.1','igent.local','192.168.0.999','192.168.00.1','172.32.0.1','192.168.0.1\r\na=x'])assert.throws(()=>validateDirectConfig({...config,ip}));for(const port of [0,65536,'18948'])assert.throws(()=>validateDirectConfig({...config,port}));assert.throws(()=>validateDirectConfig({...config,fingerprint:'ab'}));
});
test('connection uses no ICE servers, no SDP munging and negotiated ordered channel zero',async()=>{
 const client=new DirectProbeConnection(config,{Peer});await client.open();const peer=Peer.latest;assert.deepEqual(peer.options.iceServers,[]);assert.equal(peer.passedOffer,offer);assert.deepEqual(peer.channelOptions,{negotiated:true,id:0,ordered:true});client.close();assert.equal(peer.channel.readyState,'closed');assert.equal(peer.connectionState,'closed');
});
test('echo resolves only the exact nonce; malformed or oversized messages close the connection',async()=>{
 const client=new DirectProbeConnection(config,{Peer});await client.open();const peer=Peer.latest,pending=client.echo(),body=JSON.parse(peer.channel.sent[0]);let resolved=false;pending.then(()=>resolved=true);peer.channel.emit('message',{data:JSON.stringify({probe:true,nonce:'other',phoneInputSent:false})});await Promise.resolve();assert.equal(resolved,false);peer.channel.emit('message',{data:JSON.stringify({...body,phoneInputSent:false})});assert.equal((await pending).nonceMatched,true);const rejected=client.echo();peer.channel.emit('message',{data:'x'.repeat(513)});await assert.rejects(rejected);assert.equal(client.closed,true);assert.equal(peer.connectionState,'closed');
});
test('connect timeout and cancellation reject pending work and close peer',async()=>{
 class PendingPeer extends Peer{async setRemoteDescription(value){this.answer=value;}}
 const timeout=new DirectProbeConnection(config,{Peer:PendingPeer,timeoutMs:5});await assert.rejects(timeout.open(),/超时/);assert.equal(Peer.latest.connectionState,'closed');
 const client=new DirectProbeConnection(config,{Peer});await client.open();const echo=client.echo();client.close();await assert.rejects(echo,/停止/);assert.equal(client.pending.size,0);
});
test('stats expose selected route, reject relay and do not guess when no pair exists',()=>{
 const rows=new Map([['t',{type:'transport',selectedCandidatePairId:'p'}],['p',{type:'candidate-pair',state:'succeeded',localCandidateId:'l',remoteCandidateId:'r'}],['l',{type:'local-candidate',address:'192.168.0.10',port:23456,protocol:'udp',candidateType:'host'}],['r',{type:'remote-candidate',address:config.ip,port:config.port,protocol:'udp',candidateType:'host'}]]);assert.equal(selectedRoute(rows).verified,true);assert.equal(selectedRoute(rows).remote.address,config.ip);rows.get('l').candidateType='relay';assert.throws(()=>selectedRoute(rows),/中继/);assert.equal(selectedRoute(new Map()).verified,false);
});

test('route requires visible remote IP, port and UDP protocol, and rejects mismatched port',async()=>{
 const client=new DirectProbeConnection(config,{Peer});await client.open();const peer=Peer.latest;
 const stats=new Map([['p',{type:'candidate-pair',nominated:true,state:'succeeded',localCandidateId:'l',remoteCandidateId:'r'}],['l',{candidateType:'host'}],['r',{address:config.ip,port:config.port,protocol:'udp',candidateType:'host'}]]);peer.getStats=async()=>stats;
 assert.equal((await client.route()).verified,true);
 for(const field of ['address','port','protocol']){const value=stats.get('r')[field];delete stats.get('r')[field];assert.equal((await client.route()).verified,false);stats.get('r')[field]=value;}
 stats.get('r').port++;await assert.rejects(client.route(),/端口/);client.close();
});
