import {createDeviceURL,isLocalDeviceHost} from './device.js';
const encoder=new TextEncoder(),UUID=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const MAX_REQUEST=12288,MAX_RESPONSE=16384,CHUNK=256,MAX_FRAME=512;
const error=(code)=>Object.assign(new Error(code),{code});
export function validateRTCConfiguration(value,{fallbackHost=''}={}){
 const host=String(value?.ip||value?.host||fallbackHost).toLowerCase();
 if(!isLocalDeviceHost(host)||!(/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)||/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.local$/.test(host)))throw error('DEVICE_RTC_CONFIG_INVALID');
 const port=value?.port;if(!Number.isInteger(port)||port<1||port>65535)throw error('DEVICE_RTC_CONFIG_INVALID');
 const raw=String(value?.fingerprint||'');if(!/^(?:[a-f\d]{64}|(?:[a-f\d]{2}:){31}[a-f\d]{2})$/i.test(raw))throw error('DEVICE_RTC_CONFIG_INVALID');
 return {...(/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)?{ip:host}:{host}),port,fingerprint:raw.replaceAll(':','').toUpperCase().match(/../g).join(':')};
}
export function deviceRTCAnswer(localSDP,configuration){
 const rtc=validateRTCConfiguration(configuration),host=rtc.ip||rtc.host,lines=String(localSDP).split(/\r?\n/),media=lines.filter(line=>line.startsWith('m='));
 const pwd=lines.find(line=>line.startsWith('a=ice-pwd:'))?.slice(10),mid=lines.find(line=>line.startsWith('a=mid:'))?.slice(6);
 if(media.length!==1||!/^m=application \d+ UDP\/DTLS\/SCTP webrtc-datachannel$/.test(media[0])||!/^[A-Za-z0-9+/]{22,239}$/.test(pwd||'')||!/^[A-Za-z0-9_-]{1,64}$/.test(mid||''))throw error('DEVICE_RTC_SDP_INVALID');
 const credential='libp2p+webrtc+v2/'+pwd,address=rtc.ip||'0.0.0.0';
 return {type:'answer',sdp:['v=0','o=- 0 0 IN IP4 0.0.0.0','s=-','t=0 0','a=ice-lite',`a=group:BUNDLE ${mid}`,`m=application ${rtc.port} UDP/DTLS/SCTP webrtc-datachannel`,`c=IN IP4 ${address}`,`a=mid:${mid}`,`a=ice-ufrag:${credential}`,`a=ice-pwd:${credential}`,`a=fingerprint:sha-256 ${rtc.fingerprint}`,'a=setup:passive','a=sctp-port:5000','a=max-message-size:512',`a=candidate:1 1 UDP 2130706431 ${host} ${rtc.port} typ host`,'a=end-of-candidates',''].join('\r\n')};
}
export function allowedRTCRequest(method,path){
 const target='[A-Za-z0-9][A-Za-z0-9._:-]{0,79}';
 if(method==='GET')return /^\/v1\/(identity|capabilities|clock|binding)$/.test(path)||new RegExp(`^/v1/targets/${target}/(results|clipboard)/${target}$`).test(path);
 if(method==='POST')return path==='/v1/pair'||new RegExp(`^/v1/targets/${target}/(segments|release|cancel|clipboard|clipboard/${target}/(cancel|chunks)|challenge/(start|confirm)|leases/(claim|renew))$`).test(path);
 return false;
}
function base64(bytes){let binary='';for(const value of bytes)binary+=String.fromCharCode(value);return btoa(binary);}
export function encodeRTCFrames(id,value,type='req',n=1){
 if(!UUID.test(id)||!['req','res'].includes(type)||!Number.isInteger(n)||n<1||n>2147483647)throw error('DEVICE_INVALID_ARGUMENT');const bytes=encoder.encode(JSON.stringify(value));
 if(bytes.length>(type==='req'?MAX_REQUEST:MAX_RESPONSE))throw error('DEVICE_REQUEST_TOO_LARGE');
 const frames=[];for(let start=0,seq=0;start<bytes.length;start+=CHUNK,seq++){const frame=JSON.stringify({v:1,type,id,n,seq,end:start+CHUNK>=bytes.length,data:base64(bytes.slice(start,start+CHUNK))});if(encoder.encode(frame).length>MAX_FRAME)throw error('DEVICE_REQUEST_TOO_LARGE');frames.push(frame);}return frames;
}
function decodeFrame(raw){
 if(typeof raw!=='string'||encoder.encode(raw).length>MAX_FRAME)throw error('DEVICE_RTC_PROTOCOL_ERROR');let frame;try{frame=JSON.parse(raw);}catch{throw error('DEVICE_RTC_PROTOCOL_ERROR');}
 if(frame?.v!==1||frame.type!=='res'||!UUID.test(frame.id||'')||!Number.isInteger(frame.n)||frame.n<1||frame.n>2147483647||!Number.isInteger(frame.seq)||frame.seq<0||frame.seq>=MAX_RESPONSE/CHUNK||typeof frame.end!=='boolean'||typeof frame.data!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(frame.data))throw error('DEVICE_RTC_PROTOCOL_ERROR');
 const binary=atob(frame.data);if(binary.length<1||binary.length>CHUNK)throw error('DEVICE_RTC_PROTOCOL_ERROR');return {...frame,bytes:Uint8Array.from(binary,char=>char.charCodeAt(0))};
}
export class DeviceRTCTransport{
 constructor({baseUrl,rtc=null,defaults=null,bootstrapFetch=globalThis.fetch,Peer=globalThis.RTCPeerConnection,onDisconnect=()=>{},connectTimeoutMs=30000,timeoutMs=8000}={}){
  this.baseUrl=createDeviceURL(baseUrl);this.requestedRTC=rtc;this.defaults=defaults;this.bootstrapFetch=bootstrapFetch;this.Peer=Peer;this.onDisconnect=onDisconnect;this.connectTimeoutMs=Math.min(30000,connectTimeoutMs);this.timeoutMs=timeoutMs;this.closed=false;this.ready=false;this.queue=[];this.active=null;this.requestNumber=0;this.fetch=this.fetch.bind(this);
 }
 async configuration(signal){
  if(this.requestedRTC)return validateRTCConfiguration(this.requestedRTC,{fallbackHost:new URL(this.baseUrl).hostname});
  let defaults=this.defaults;
  if(!defaults){const response=await this.bootstrapFetch.call(globalThis,new URL('../firmware/rtc-defaults.json',import.meta.url),{signal,credentials:'omit',cache:'no-store',redirect:'error'});if(!response.ok)throw error('DEVICE_RTC_CONFIG_UNAVAILABLE');const text=await response.text();if(text.length>4096)throw error('DEVICE_RTC_CONFIG_INVALID');try{defaults=JSON.parse(text);}catch{throw error('DEVICE_RTC_CONFIG_INVALID');}}
  if(defaults.version!==1)throw error('DEVICE_RTC_CONFIG_INVALID');return validateRTCConfiguration(defaults,{fallbackHost:new URL(this.baseUrl).hostname});
 }
 exportConfiguration(){return this.rtc?structuredClone(this.rtc):null;}
 open({signal}={}){
  if(this.opening)return this.opening;if(this.closed)return Promise.reject(error('DEVICE_RTC_CLOSED'));
  this.opening=new Promise((resolve,reject)=>{this.resolveOpen=resolve;this.rejectOpen=reject;});this.controller=new AbortController();this.openSignal=signal;this.openAbort=()=>this.close(error('DEVICE_REQUEST_CANCELLED'));signal?.addEventListener('abort',this.openAbort,{once:true});
  if(signal?.aborted){this.openAbort();return this.opening;}
  this.openTimer=setTimeout(()=>this.close(error('DEVICE_RTC_CONNECT_TIMEOUT')),this.connectTimeoutMs);
  (async()=>{
   if(typeof this.Peer!=='function')throw error('DEVICE_RTC_UNSUPPORTED');this.rtc=await this.configuration(this.controller.signal);if(this.closed)return;
   this.pc=new this.Peer({iceServers:[],iceTransportPolicy:'all',bundlePolicy:'max-bundle',iceCandidatePoolSize:0});
   for(const event of ['connectionstatechange','iceconnectionstatechange'])this.pc.addEventListener(event,()=>{
    if(this.closed)return;const states=[this.pc.connectionState,this.pc.iceConnectionState];
    if(states.some(state=>state==='failed'||state==='closed')){this.close(error('DEVICE_RTC_DISCONNECTED'));return;}
    if(states.includes('disconnected')){if(!this.disconnectTimer)this.disconnectTimer=setTimeout(()=>this.close(error('DEVICE_RTC_DISCONNECTED')),Math.min(8000,this.timeoutMs));}
    else{clearTimeout(this.disconnectTimer);this.disconnectTimer=null;}
   });
   this.channel=this.pc.createDataChannel('iah-rpc',{negotiated:true,id:0,ordered:true});
   this.channel.addEventListener('open',()=>{if(this.closed)return;this.ready=true;clearTimeout(this.openTimer);signal?.removeEventListener('abort',this.openAbort);this.resolveOpen(this);});
   this.channel.addEventListener('close',()=>this.close(error('DEVICE_RTC_CLOSED')));this.channel.addEventListener('error',()=>this.close(error('DEVICE_RTC_DISCONNECTED')));this.channel.addEventListener('message',event=>this.receive(event.data));
   const offer=await this.pc.createOffer();if(this.closed)return;await this.pc.setLocalDescription(offer);if(this.closed)return;await this.pc.setRemoteDescription(deviceRTCAnswer(this.pc.localDescription.sdp,this.rtc));
  })().catch(cause=>this.close(cause?.code?cause:error('DEVICE_RTC_CONNECT_FAILED')));
  return this.opening;
 }
 receive(raw){
  if(this.closed)return;try{
   const frame=decodeFrame(raw),entry=this.active;if(!entry||frame.id!==entry.id)return;
   if(frame.n!==entry.n||frame.seq!==entry.seq||(!frame.end&&frame.bytes.length!==CHUNK))throw error('DEVICE_RTC_PROTOCOL_ERROR');entry.seq++;entry.size+=frame.bytes.length;if(entry.size>MAX_RESPONSE)throw error('DEVICE_RTC_PROTOCOL_ERROR');entry.chunks.push(frame.bytes);if(!frame.end)return;
   const bytes=new Uint8Array(entry.size);let offset=0;for(const part of entry.chunks){bytes.set(part,offset);offset+=part.length;}let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw error('DEVICE_RTC_PROTOCOL_ERROR');}
   if(!Number.isInteger(value?.status)||value.status<200||value.status>599||typeof value.body!=='string')throw error('DEVICE_RTC_PROTOCOL_ERROR');
   const response=new Response(value.status===204?null:value.body,{status:value.status,headers:{'content-type':'application/json'}});this.active=null;clearTimeout(entry.timer);entry.signal?.removeEventListener('abort',entry.abort);entry.resolve(response);this.drain();
  }catch(cause){this.close(cause);}
 }
 fetch(url,options={}){
  if(!this.ready||this.closed)return Promise.reject(error('DEVICE_RTC_CLOSED'));let target,headers,envelope,id;
  try{target=new URL(url);const method=options.method||'GET';if(target.origin!==this.baseUrl||target.search||target.hash||!allowedRTCRequest(method,target.pathname)||options.body!==undefined&&typeof options.body!=='string')throw error('DEVICE_INVALID_ARGUMENT');headers={};for(const [name,value]of new Headers(options.headers)){if(!['accept','content-type','authorization','x-request-id'].includes(name)||value.length>512)throw error('DEVICE_INVALID_ARGUMENT');headers[name]=value;}
   id=crypto.randomUUID();envelope={method,path:target.pathname,headers,body:options.body||''};encodeRTCFrames(id,envelope,'req',2147483647);
  }catch(cause){return Promise.reject(cause);}
  if(options.signal?.aborted)return Promise.reject(error('DEVICE_REQUEST_CANCELLED'));if(this.queue.length>=8)return Promise.reject(error('DEVICE_RTC_BUSY'));
  return new Promise((resolve,reject)=>{const entry={id,envelope,resolve,reject,signal:options.signal,seq:0,size:0,chunks:[]};entry.abort=()=>{if(this.active===entry){this.close(error('DEVICE_REQUEST_CANCELLED'));return;}const index=this.queue.indexOf(entry);if(index>=0){this.queue.splice(index,1);entry.signal?.removeEventListener('abort',entry.abort);reject(error('DEVICE_REQUEST_CANCELLED'));}};entry.signal?.addEventListener('abort',entry.abort,{once:true});this.queue.push(entry);this.drain();});
 }
 drain(){
  if(this.closed||this.active||!this.queue.length)return;const entry=this.queue.shift();this.active=entry;entry.timer=setTimeout(()=>this.close(error('DEVICE_RTC_TIMEOUT')),this.timeoutMs);
  try{if(this.channel.readyState!=='open')throw error('DEVICE_RTC_CLOSED');entry.n=++this.requestNumber;if(entry.n>2147483647)throw error('DEVICE_RTC_CLOSED');const frames=encodeRTCFrames(entry.id,entry.envelope,'req',entry.n);for(const frame of frames)this.channel.send(frame);}catch(cause){this.close(cause?.code?cause:error('DEVICE_RTC_DISCONNECTED'));}
 }
 close(reason=error('DEVICE_RTC_CLOSED')){
  if(this.closed)return;const wasReady=this.ready;this.closed=true;this.ready=false;clearTimeout(this.openTimer);clearTimeout(this.disconnectTimer);this.controller?.abort();this.openSignal?.removeEventListener('abort',this.openAbort);
  const pending=[...(this.active?[this.active]:[]),...this.queue];this.active=null;this.queue=[];for(const entry of pending){clearTimeout(entry.timer);entry.signal?.removeEventListener('abort',entry.abort);entry.reject(reason);}try{this.channel?.close();}catch{}try{this.pc?.close();}catch{}this.rejectOpen?.(reason);if(wasReady)this.onDisconnect(reason);
 }
}
