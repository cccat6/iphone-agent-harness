// Uses the WebRTC Direct v2 connection establishment described in libp2p/specs.
// This diagnostic exchanges JSON echoes, not libp2p application streams or Noise.
const utf8=new TextEncoder(),PREFIX='libp2p+webrtc+v2/';
export function validateDirectConfig(value){
 if(value?.version!==1)throw Error('测试配置版本不正确');
 const ip=String(value.ip||value.host||''),parts=ip.split('.');
 if(parts.length!==4||parts.some(v=>!/^\d{1,3}$/.test(v)||String(Number(v))!==v||Number(v)>255))throw Error('仅支持本地 IPv4 地址');
 const [a,b]=parts.map(Number);if(!(a===10||a===192&&b===168||a===172&&b>=16&&b<=31))throw Error('仅支持本地 IPv4 地址');
 const port=value.port;if(!Number.isInteger(port)||port<1||port>65535)throw Error('UDP 端口不正确');
 const raw=String(value.fingerprint||value.fingerprintSHA256||'');if(!/^(?:[a-f\d]{64}|(?:[a-f\d]{2}:){31}[a-f\d]{2})$/i.test(raw))throw Error('SHA-256 指纹不正确');
 return {version:1,ip,port,fingerprint:raw.replaceAll(':','').toUpperCase().match(/../g).join(':')};
}
export function syntheticAnswer(localSDP,input){
 const config=validateDirectConfig(input),lines=String(localSDP).split(/\r?\n/),media=lines.filter(line=>line.startsWith('m='));
 if(media.length!==1||!/^m=application \d+ UDP\/DTLS\/SCTP webrtc-datachannel$/.test(media[0]))throw Error('浏览器没有生成预期的数据通道 SDP');
 const password=lines.find(line=>line.startsWith('a=ice-pwd:'))?.slice(10),mid=lines.find(line=>line.startsWith('a=mid:'))?.slice(6);
 if(!/^[A-Za-z0-9+/]{22,239}$/.test(password||''))throw Error('浏览器 ICE 密码不符合 Direct v2 要求');
 if(!/^[A-Za-z0-9_-]{1,64}$/.test(mid||''))throw Error('浏览器 SDP 缺少媒体标识');
 const credential=PREFIX+password;
 return {type:'answer',sdp:['v=0',`o=- 0 0 IN IP4 ${config.ip}`,'s=-','t=0 0','a=ice-lite',`a=group:BUNDLE ${mid}`,`m=application ${config.port} UDP/DTLS/SCTP webrtc-datachannel`,`c=IN IP4 ${config.ip}`,`a=mid:${mid}`,`a=ice-ufrag:${credential}`,`a=ice-pwd:${credential}`,`a=fingerprint:sha-256 ${config.fingerprint}`,'a=setup:passive','a=sctp-port:5000','a=max-message-size:16384',`a=candidate:1 1 UDP 2130706431 ${config.ip} ${config.port} typ host`,'a=end-of-candidates',''].join('\r\n')};
}
export function selectedRoute(stats){
 const rows=Array.from(stats.values()),transport=rows.find(row=>row.type==='transport'&&row.selectedCandidatePairId);
 const pair=transport?stats.get(transport.selectedCandidatePairId):rows.find(row=>row.type==='candidate-pair'&&(row.selected===true||row.nominated===true&&row.state==='succeeded'));
 if(!pair)return {verified:false,reason:'selected-pair-unavailable'};
 const local=stats.get(pair.localCandidateId),remote=stats.get(pair.remoteCandidateId);
 const describe=value=>value?{address:value.address||value.ip||null,port:value.port??null,protocol:value.protocol||null,candidateType:value.candidateType||null}:null;
 if(local?.candidateType==='relay'||remote?.candidateType==='relay')throw Error('发现中继候选，测试停止');
 const remoteAddress=remote?.address||remote?.ip;return {verified:Boolean(local?.candidateType&&remote?.candidateType&&remoteAddress&&Number.isInteger(remote.port)&&remote.protocol),state:pair.state,local:describe(local),remote:describe(remote)};
}
export class DirectProbeConnection{
 constructor(config,{Peer=globalThis.RTCPeerConnection,onState=()=>{},timeoutMs=30000,echoTimeoutMs=8000}={}){this.config=validateDirectConfig(config);this.Peer=Peer;this.onState=onState;this.timeoutMs=Math.min(30000,timeoutMs);this.echoTimeoutMs=echoTimeoutMs;this.closed=false;this.ready=false;this.pending=new Map();}
 snapshot(){return {ice:this.pc?.iceConnectionState||'new',gathering:this.pc?.iceGatheringState||'new',connection:this.pc?.connectionState||'new',dtls:this.pc?.sctp?.transport?.state||'new',channel:this.channel?.readyState||'closed',closed:this.closed};}
 publish(){this.onState(this.snapshot());}
 open(){
 if(this.opening)return this.opening;if(this.closed)return Promise.reject(Error('连接已关闭'));
 this.opening=new Promise((resolve,reject)=>{this.resolveOpen=resolve;this.rejectOpen=reject;});
 try{
  this.pc=new this.Peer({iceServers:[],iceTransportPolicy:'all',bundlePolicy:'max-bundle',iceCandidatePoolSize:0});
  for(const name of ['iceconnectionstatechange','icegatheringstatechange','connectionstatechange','signalingstatechange'])this.pc.addEventListener(name,()=>{this.publish();if(['failed','closed'].includes(this.pc.connectionState)||this.pc.iceConnectionState==='failed')this.close(Error('WebRTC 连接失败'));});
  this.channel=this.pc.createDataChannel('iah-probe',{negotiated:true,id:0,ordered:true});
  this.channel.addEventListener('open',()=>{if(this.closed)return;this.ready=true;clearTimeout(this.timer);this.publish();this.resolveOpen(this);});
  this.channel.addEventListener('close',()=>this.close(Error('数据通道已关闭')));
  this.channel.addEventListener('error',()=>this.close(Error('数据通道发生错误')));
  this.channel.addEventListener('message',event=>this.receive(event.data));
  this.timer=setTimeout(()=>this.close(Error('WebRTC 连接超时（30 秒）')),this.timeoutMs);
  (async()=>{const offer=await this.pc.createOffer();if(this.closed)return;await this.pc.setLocalDescription(offer);if(this.closed)return;const answer=syntheticAnswer(this.pc.localDescription.sdp,this.config);await this.pc.setRemoteDescription(answer);if(this.closed)return;this.pc.sctp?.transport?.addEventListener('statechange',()=>this.publish());this.publish();})().catch(error=>this.close(error));
 }catch(error){this.close(error);}
 return this.opening;
 }
 receive(raw){
  if(this.closed)return;if(typeof raw!=='string'||utf8.encode(raw).length>512){this.close(Error('响应超过限制或不是文本'));return;}
  let data;try{data=JSON.parse(raw);}catch{this.close(Error('回传内容不是 JSON'));return;}
  if(!data||typeof data.nonce!=='string'||data.probe!==true||data.phoneInputSent!==false){this.close(Error('回传格式不正确'));return;}
  const pending=this.pending.get(data.nonce);if(!pending)return;this.pending.delete(data.nonce);clearTimeout(pending.timer);pending.resolve({nonceMatched:true,phoneInputSent:false,elapsedMs:Math.round(performance.now()-pending.started)});
 }
 echo(){
  if(this.closed||!this.ready||this.channel.readyState!=='open')return Promise.reject(Error('数据通道尚未连接'));
  if(this.pending.size)return Promise.reject(Error('上一轮回传尚未结束'));
  const nonce=crypto.randomUUID(),body=JSON.stringify({probe:true,nonce});if(utf8.encode(body).length>512)return Promise.reject(Error('请求超过限制'));
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>this.close(Error('回传超时')),this.echoTimeoutMs);this.pending.set(nonce,{resolve,reject,timer,started:performance.now()});try{this.channel.send(body);}catch(error){this.close(error);}});
 }
 async route(){const route=selectedRoute(await this.pc.getStats());if(route.remote?.address&&route.remote.address!==this.config.ip)throw Error('实际远端地址与配置不一致');if(route.remote?.port!==null&&route.remote?.port!==undefined&&route.remote.port!==this.config.port)throw Error('实际远端端口与配置不一致');if(route.remote?.protocol&&route.remote.protocol.toLowerCase()!=='udp')throw Error('实际通道不是 UDP');if(!route.verified)route.reason='candidate-details-unavailable';return route;}
 close(reason=Error('测试已停止')){if(this.closed)return;this.closed=true;this.ready=false;clearTimeout(this.timer);for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(reason);}this.pending.clear();try{this.channel?.close();}catch{}try{this.pc?.close();}catch{}this.rejectOpen?.(reason);this.publish();}
}
