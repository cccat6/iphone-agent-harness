/** Direct LAN requests through a user-opened device window. No cloud forwarding. */
import {createDeviceURL} from './device.js';
const REQUEST_ID=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/;
export function allowedDeviceWindowRequest(method,path){
 if(typeof method!=='string'||typeof path!=='string')return false;
 if(method==='GET')return /^\/v1\/(identity|capabilities|clock|binding)$/.test(path)||/^\/v1\/targets\/[A-Za-z0-9][A-Za-z0-9._:-]{0,79}\/results\/[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(path);
 if(method==='POST')return path==='/v1/pair'||/^\/v1\/targets\/[A-Za-z0-9][A-Za-z0-9._:-]{0,79}\/(segments|release|cancel|challenge\/(start|confirm)|leases\/(claim|renew))$/.test(path);
 return false;
}
const error=(code,message=code)=>Object.assign(new Error(message),{code});
export class DeviceWindowTransport {
 constructor({baseUrl,windowRef=globalThis.window,documentRef=globalThis.document,onDisconnect=()=>{},timeoutMs=8000,connectTimeoutMs=90000,locale=''}={}){
  this.locale=['en','zh-Hans','zh-Hant','ja','ru','de','fr','es'].includes(locale)?locale:'';this.baseUrl=createDeviceURL(baseUrl);if(!this.baseUrl.startsWith('http:'))throw error('DEVICE_INVALID_URL');
  this.window=windowRef;this.document=documentRef;this.onDisconnect=onDisconnect;this.timeoutMs=timeoutMs;this.connectTimeoutMs=connectTimeoutMs;this.nonce=crypto.randomUUID().replaceAll('-','');this.pending=new Map();this.ready=false;this.closed=false;this.instance='';this.probing=false;
  this.message=event=>this.receive(event);this.visibility=()=>this.probe();this.unload=()=>this.close();this.fetch=this.fetch.bind(this);
 }
 /** Must be called synchronously from the Connect button's user gesture. */
 open({signal}={}){
  if(this.opening)return this.opening;if(this.closed)return Promise.reject(error('DEVICE_WINDOW_CLOSED'));
  this.opening=new Promise((resolve,reject)=>{this.resolveOpen=resolve;this.rejectOpen=reject;});
  this.window.addEventListener('message',this.message);this.document.addEventListener('visibilitychange',this.visibility);this.window.addEventListener('pagehide',this.unload);
  this.openAbort=()=>this.close(error('DEVICE_REQUEST_CANCELLED'));this.openSignal=signal;signal?.addEventListener('abort',this.openAbort,{once:true});
  if(signal?.aborted){this.openAbort();return this.opening;}
  // Every connection gets a different name: an orphan tab must never be reused by hash-only navigation.
  this.child=this.window.open(this.baseUrl+'/harness-link#nonce='+this.nonce+(this.locale?'&lang='+encodeURIComponent(this.locale):''),'iah-lan-'+this.nonce);
  if(!this.child){this.close(error('DEVICE_WINDOW_BLOCKED'));return this.opening;}
  this.openTimer=setTimeout(()=>this.close(error('DEVICE_WINDOW_NOT_READY')),this.connectTimeoutMs);
  this.closedTimer=setInterval(()=>{if(this.child?.closed)this.close(error('DEVICE_WINDOW_CLOSED'));},1000);
  return this.opening;
 }
 receive(event){
  if(this.closed||event.source!==this.child||event.origin!==this.baseUrl||event.data?.nonce!==this.nonce)return;
  const data=event.data;
  if(data.type==='iah-lan-ready'){
   if(typeof data.instance!=='string'||!/^[a-f0-9]{32}$/.test(data.instance))return;
   if(this.instance&&this.instance!==data.instance){this.close(error('DEVICE_WINDOW_RELOADED'));return;}
   this.instance=data.instance;this.probe();return;
  }
  if(data.type==='iah-lan-closed'){this.close(error('DEVICE_WINDOW_CLOSED'));return;}
  if(data.type!=='iah-lan-response'||data.instance!==this.instance||!REQUEST_ID.test(data.id||''))return;
  const entry=this.pending.get(data.id);if(!entry)return;this.pending.delete(data.id);clearTimeout(entry.timer);entry.signal?.removeEventListener('abort',entry.abort);
  if(data.error){entry.reject(error('DEVICE_WINDOW_REQUEST_FAILED'));return;}
  if(!Number.isInteger(data.status)||data.status<200||data.status>599||typeof data.body!=='string'||new TextEncoder().encode(data.body).length>262144){entry.reject(error('DEVICE_RESPONSE_INVALID'));return;}
  entry.resolve(data);
 }
 async probe(){
  if(this.probing){this.probeRequested=true;return;}
  if(this.closed||this.ready||!this.instance||this.document.visibilityState!=='visible')return;
  this.probing=true;
  try{
   const response=await this.request({method:'GET',path:'/v1/identity',headers:{accept:'application/json'},body:''});
   if(response.status!==200)throw error('DEVICE_WINDOW_REQUEST_FAILED');
   // A foreground helper response does not demonstrate that it can serve the Harness tab.
   if(response.helperVisibility!=='hidden'||this.document.visibilityState!=='visible')return;
   const identity=JSON.parse(response.body);if(!identity?.boardId||!identity?.bootId)throw error('DEVICE_RESPONSE_INVALID');
   this.ready=true;clearTimeout(this.openTimer);this.openSignal?.removeEventListener('abort',this.openAbort);this.resolveOpen(this);
  }catch(cause){if(!this.closed)this.close(cause);}finally{this.probing=false;if(this.probeRequested){this.probeRequested=false;queueMicrotask(()=>this.probe());}}
 }
 request({method,path,headers,body,signal}){
  if(this.closed||!this.child||this.child.closed)return Promise.reject(error('DEVICE_WINDOW_CLOSED'));
  if(!allowedDeviceWindowRequest(method,path)||new TextEncoder().encode(body||'').length>8192||this.pending.size>=8)return Promise.reject(error('DEVICE_INVALID_ARGUMENT'));
  const id=crypto.randomUUID();return new Promise((resolve,reject)=>{
   const abort=()=>{const entry=this.pending.get(id);if(!entry)return;clearTimeout(entry.timer);this.pending.delete(id);signal?.removeEventListener('abort',abort);try{this.child.postMessage({type:'iah-lan-cancel',nonce:this.nonce,id},this.baseUrl);}catch{}reject(error('DEVICE_REQUEST_CANCELLED'));};
   if(signal?.aborted){reject(error('DEVICE_REQUEST_CANCELLED'));return;}
   const timer=setTimeout(()=>{const entry=this.pending.get(id);if(!entry)return;this.pending.delete(id);signal?.removeEventListener('abort',abort);try{this.child.postMessage({type:'iah-lan-cancel',nonce:this.nonce,id},this.baseUrl);}catch{}reject(error('DEVICE_WINDOW_TIMEOUT'));this.close(error('DEVICE_WINDOW_TIMEOUT'));},this.timeoutMs);
   this.pending.set(id,{resolve,reject,timer,abort,signal});signal?.addEventListener('abort',abort,{once:true});
   try{this.child.postMessage({type:'iah-lan-request',nonce:this.nonce,id,method,path,headers,body:body||''},this.baseUrl);}catch{clearTimeout(timer);this.pending.delete(id);signal?.removeEventListener('abort',abort);reject(error('DEVICE_WINDOW_CLOSED'));this.close(error('DEVICE_WINDOW_CLOSED'));}
  });
 }
 async fetch(url,options={}){
  if(!this.ready)throw error('DEVICE_WINDOW_NOT_READY');const target=new URL(url);
  if(target.origin!==this.baseUrl||target.search||target.hash)throw error('DEVICE_INVALID_ARGUMENT');
  const headers={};for(const [name,value] of new Headers(options.headers)){if(!['accept','content-type','authorization','x-request-id'].includes(name)||value.length>512)throw error('DEVICE_INVALID_ARGUMENT');headers[name]=value;}
  const response=await this.request({method:options.method||'GET',path:target.pathname,headers,body:options.body||'',signal:options.signal});
  return new Response(response.status===204?null:response.body,{status:response.status,headers:{'content-type':'application/json'}});
 }
 close(reason=error('DEVICE_WINDOW_CLOSED')){
  if(this.closed)return;const wasReady=this.ready;this.closed=true;this.ready=false;clearTimeout(this.openTimer);clearInterval(this.closedTimer);this.openSignal?.removeEventListener('abort',this.openAbort);
  this.window.removeEventListener('message',this.message);this.document.removeEventListener('visibilitychange',this.visibility);this.window.removeEventListener('pagehide',this.unload);
  for(const value of this.pending.values()){clearTimeout(value.timer);value.signal?.removeEventListener('abort',value.abort);value.reject(reason);}this.pending.clear();try{this.child?.close();}catch{}this.rejectOpen?.(reason);if(wasReady)this.onDisconnect(reason);
 }
}
