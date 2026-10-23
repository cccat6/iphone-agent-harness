const failure=(code,status)=>Object.assign(new Error(code),{code,...(status?{status}:{})});
const encoder=new TextEncoder();
// A browser-owned channel with one active response. The relay authenticates on
// the encrypted first frame; URLs and protocols never contain credentials.
export class ResponseSocket{
 constructor({url,token,sessionId,Socket=globalThis.WebSocket,connectTimeoutMs=30000}={}){
  this.record=null;this.closed=false;this.socket=new Socket(url);this.opening=new Promise((resolve,reject)=>{this.resolveOpen=resolve;this.rejectOpen=reject;});
  void this.opening.catch(()=>{});
  this.timer=setTimeout(()=>this.close(failure('RESPONSE_SOCKET_CONNECT_TIMEOUT')),connectTimeoutMs);
  this.socket.addEventListener('open',()=>{if(this.closed)return;try{this.socket.send(JSON.stringify({type:'iah.authenticate',authorization:'Bearer '+token,sessionId}));}catch{this.close(failure('RESPONSE_SOCKET_CLOSED'));}finally{token=null;}});
  this.socket.addEventListener('message',event=>this.receive(event.data));
  this.socket.addEventListener('close',()=>this.close(failure('RESPONSE_SOCKET_CLOSED')));
  this.socket.addEventListener('error',()=>this.close(failure('RESPONSE_SOCKET_CLOSED')));
 }
 receive(raw){
  if(this.closed)return;
  let value;try{if(typeof raw!=='string'||raw.length>2000000)throw 0;value=JSON.parse(raw);}catch{this.close(failure('RESPONSE_SOCKET_EVENT_INVALID'));return;}
  if(!this.ready){if(value.type==='iah.ready'){this.ready=true;clearTimeout(this.timer);this.lastPong=Date.now();this.heartbeat=setInterval(()=>{if(this.closed)return;if(Date.now()-this.lastPong>90000){this.close(failure('RESPONSE_SOCKET_HEARTBEAT_TIMEOUT'));return;}try{this.socket.send('{"type":"iah.ping"}');}catch{this.close(failure('RESPONSE_SOCKET_CLOSED'));}},20000);this.resolveOpen();}else this.close(failure(value.error?.code||'RESPONSE_SOCKET_AUTH_FAILED',value.status));return;}
  if(value.type==='iah.pong'){this.lastPong=Date.now();return;}
  const a=this.active;if(!a){this.close(failure('RESPONSE_SOCKET_UNEXPECTED_EVENT'));return;}
  if(!a.started&&value.type==='error'){
   this.record=null;this.finish(a);a.resolve(Response.json(value,{status:Number.isInteger(value.status)&&value.status>=400&&value.status<=599?value.status:502}));return;
  }
  if(!a.started){a.started=true;a.resolve(new Response(a.body,{headers:{'content-type':'text/event-stream'}}));}
  const bytes=encoder.encode('data: '+raw+'\n\n');a.bytes+=bytes.length;
  if(a.bytes>4000000){this.close(failure('RESPONSE_SOCKET_BACKPRESSURE'));return;}
  a.queue.push(bytes);if(['response.completed','response.done','response.failed','response.incomplete','response.cancelled','error'].includes(value.type))a.terminal=true;
  this.flush(a);
 }
 flush(a){
  if(!a.controller||!a.pulling)return;
  if(a.queue.length){const bytes=a.queue.shift();a.bytes-=bytes.length;a.pulling=false;a.controller.enqueue(bytes);}
  else if(a.terminal){this.finish(a);a.controller.close();}
 }
 finish(a){a.signal?.removeEventListener('abort',a.abort);if(this.active===a)this.active=null;}
 async request(payload,{signal}={}){
  if(signal?.aborted)throw signal.reason||failure('RESPONSE_SOCKET_CANCELLED');
  const abort=()=>this.close(signal.reason||failure('RESPONSE_SOCKET_CANCELLED'));
  signal?.addEventListener('abort',abort,{once:true});
  try{await this.opening;}finally{signal?.removeEventListener('abort',abort);}
  if(signal?.aborted)throw signal.reason||failure('RESPONSE_SOCKET_CANCELLED');
  if(this.closed)throw failure('RESPONSE_SOCKET_CLOSED');if(this.active)throw failure('RESPONSE_SOCKET_BUSY');
  const {stream,...body}=payload,encoded=JSON.stringify({type:'response.create',...body});
  if(encoded.length>16000000)throw failure('CONTEXT_TRANSPORT_LIMIT');
  return new Promise((resolve,reject)=>{
   const a={resolve,reject,signal,queue:[],bytes:0,terminal:false,started:false,pulling:false};
   a.abort=()=>this.close(signal.reason||failure('RESPONSE_SOCKET_CANCELLED'));
   a.body=new ReadableStream({start:controller=>{a.controller=controller;},pull:()=>{a.pulling=true;this.flush(a);},cancel:()=>{if(a.terminal){this.finish(a);}else this.close(failure('RESPONSE_SOCKET_CANCELLED'));}},{highWaterMark:0});
   this.active=a;signal?.addEventListener('abort',a.abort,{once:true});
   if(signal?.aborted){a.abort();return;}
   try{this.record=null;this.socket.send(encoded);}catch{this.close(failure('RESPONSE_SOCKET_CLOSED'));}
  });
 }
 close(reason=failure('RESPONSE_SOCKET_CLOSED')){
  if(this.closed)return;this.closed=true;this.record=null;clearTimeout(this.timer);clearInterval(this.heartbeat);this.rejectOpen(reason);
  const a=this.active;if(a){this.finish(a);if(a.started)try{a.controller.error(reason);}catch{}else a.reject(reason);a.queue=[];}
  try{this.socket.close(1000,'client_closed');}catch{}
 }
}
