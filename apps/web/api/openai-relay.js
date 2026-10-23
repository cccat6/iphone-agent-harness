// Stateless, fixed-destination transport. No credential store, body logging,
// response cache, or account session is used by this handler.
const routes=new Map([
 ['/api/openai/models',{method:'GET',url:'https://api.openai.com/v1/models'}],
 ['/api/openai/responses',{method:'POST',url:'https://api.openai.com/v1/responses'}],
]);
function allowedOrigin(request,allowedOrigins){
 // Same-origin GETs commonly omit Origin; bearer authentication still applies.
 const origin=request.headers.get('origin');if(origin===null)return '';if(!origin||origin==='null')return null;
 const allowed=new Set(String(allowedOrigins||'').split(',').map(value=>value.trim()).filter(Boolean));allowed.add(new URL(request.url).origin);
 return allowed.has(origin)?origin:null;
}
function responseHeaders(origin){return new Headers({
 'Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff','Vary':'Origin',
 ...(origin?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type, Accept, Session-ID','Access-Control-Expose-Headers':'X-Request-ID, Retry-After, Server-Timing'}:{}),
});}
const reject=(origin,status,code)=>Response.json({error:{code,message:code}},{status,headers:responseHeaders(origin)});
function cancelBody(body){try{void Promise.resolve(body?.cancel()).catch(()=>{});}catch{}}
function abortable(promise,signal){if(signal.aborted){void promise.catch(()=>{});return Promise.reject(signal.reason);}return new Promise((resolve,reject)=>{
 const stop=()=>reject(signal.reason);signal.addEventListener('abort',stop,{once:true});promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',stop));
});}
export async function serveOpenAIRelay(request,{fetchImpl=globalThis.fetch,allowedOrigins='',timeoutMs=180000}={}){
 const url=new URL(request.url),route=routes.get(url.pathname),origin=allowedOrigin(request,allowedOrigins);
 if(!route||url.search)return reject(origin,404,'RELAY_ROUTE_NOT_FOUND');
 if(origin===null)return reject(null,403,'RELAY_ORIGIN_DENIED');
 if(request.method==='GET'&&url.pathname==='/api/openai/responses'&&request.headers.get('upgrade')?.toLowerCase()==='websocket')return serveResponseSocket(request,{fetchImpl,origin});
 if(request.method==='OPTIONS'){
  const method=request.headers.get('access-control-request-method'),headers=(request.headers.get('access-control-request-headers')||'').toLowerCase().split(',').map(v=>v.trim()).filter(Boolean);
  if(method&&method!==route.method||headers.some(h=>!['authorization','content-type','accept','session-id'].includes(h)))return reject(origin,403,'RELAY_PREFLIGHT_DENIED');
  return new Response(null,{status:204,headers:responseHeaders(origin)});
 }
 if(request.method!==route.method)return reject(origin,405,'RELAY_METHOD_NOT_ALLOWED');
 const authorization=request.headers.get('authorization');
 if(!authorization||authorization.length>16384||!/^Bearer [A-Za-z0-9._~+\/-]+=*$/.test(authorization))return reject(origin,401,'RELAY_ACCESS_TOKEN_REQUIRED');
 if(route.method==='POST'&&(!request.body||!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||'')))return reject(origin,415,'RELAY_JSON_REQUIRED');
 const sessionId=request.headers.get('session-id');if(sessionId!==null&&!/^[A-Za-z0-9._:-]{1,128}$/.test(sessionId))return reject(origin,400,'RELAY_SESSION_ID_INVALID');
 const controller=new AbortController(),abort=()=>controller.abort(new Error('relay_cancelled'));request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)abort();
 let timedOut=false,reader,finished=false;
 const timer=setTimeout(()=>{timedOut=true;controller.abort(new Error('relay_timeout'));},timeoutMs);
 const cleanup=()=>{clearTimeout(timer);request.signal.removeEventListener('abort',abort);};
 const finish=()=>{if(finished)return;finished=true;cleanup();};
 try{
  const headers=new Headers({Authorization:authorization,Accept:route.method==='GET'?'application/json':'text/event-stream','Accept-Encoding':'identity'});
  if(route.method==='POST')headers.set('Content-Type','application/json');
  if(sessionId)headers.set('Session-ID',sessionId);
  const upstreamStarted=performance.now();
  const pending=Promise.resolve(fetchImpl.call(globalThis,route.url,{method:route.method,headers,body:route.method==='POST'?request.body:undefined,signal:controller.signal,redirect:'manual',credentials:'omit',cache:'no-store'})).then(upstream=>{if(controller.signal.aborted){cancelBody(upstream.body);throw controller.signal.reason;}return upstream;});
  const upstream=await abortable(pending,controller.signal);
  if(upstream.status>=300&&upstream.status<400){cancelBody(upstream.body);finish();return reject(origin,502,'RELAY_UPSTREAM_REDIRECT');}
  const outgoing=responseHeaders(origin);
  const timing=['iah-upstream;dur='+Math.max(0,Math.round(performance.now()-upstreamStarted))];
  const processing=upstream.headers.get('openai-processing-ms');if(processing&&/^\d{1,7}(?:\.\d{1,3})?$/.test(processing)&&Number(processing)<=3600000)timing.push('iah-provider;dur='+Number(processing));
  outgoing.set('Server-Timing',timing.join(', '));
  for(const name of ['content-type','content-encoding','x-request-id','retry-after']){const value=upstream.headers.get(name);if(value)outgoing.set(name,value);}
  if(!upstream.body){finish();return new Response(null,{status:upstream.status,headers:outgoing});}
  reader=upstream.body.getReader();
  const body=new ReadableStream({
   async pull(target){try{const {done,value}=await abortable(reader.read(),controller.signal);if(controller.signal.aborted)throw controller.signal.reason;if(done){finish();reader.releaseLock();target.close();return;}target.enqueue(value);}catch{finish();try{void reader.cancel().catch(()=>{});reader.releaseLock();}catch{}target.error(new Error(timedOut?'RELAY_TIMEOUT':'RELAY_STREAM_INTERRUPTED'));}},
   cancel(){finish();controller.abort(new Error('relay_cancelled'));try{void reader.cancel().catch(()=>{});reader.releaseLock();}catch{}},
  },{highWaterMark:0});
  // Cancellation must also release an idle upstream when the browser stops
  // reading; no background task retains the user's response or credential.
  controller.signal.addEventListener('abort',()=>{try{void reader.cancel().catch(()=>{});reader.releaseLock();}catch{}finish();},{once:true});
  return new Response(body,{status:upstream.status,headers:outgoing});
 }catch{finish();controller.abort();return reject(origin,timedOut?504:502,timedOut?'RELAY_TIMEOUT':'RELAY_UPSTREAM_UNAVAILABLE');}
}

// Browser WebSockets cannot carry Authorization headers. Authenticate once on
// this encrypted channel, then forward only to the fixed Responses endpoint.
// Neither credentials nor response state are written to a database or log.
export function serveResponseSocket(request,{fetchImpl=globalThis.fetch,origin='',pairFactory=()=>new WebSocketPair(),upgrade=(socket,headers)=>new Response(null,{status:101,webSocket:socket,headers})}={}){
 const pair=pairFactory(),client=pair[0],socket=pair[1];socket.accept();
 let upstream=null,closed=false,authenticating=false,ready=false;
 let authTimer=setTimeout(()=>close(1008,'RELAY_AUTH_TIMEOUT'),10000),idleTimer,lifetimeTimer;
 const controller=new AbortController();
 function close(code=1011,reason='RELAY_SOCKET_CLOSED'){
  if(closed)return;closed=true;clearTimeout(authTimer);clearTimeout(idleTimer);clearTimeout(lifetimeTimer);controller.abort();
  try{socket.close(code,reason);}catch{}try{upstream?.close(code,reason);}catch{}
 }
 function idle(){clearTimeout(idleTimer);idleTimer=setTimeout(()=>close(1000,'RELAY_IDLE'),300000);}
 function fail(code,status=502){if(closed)return;try{socket.send(JSON.stringify({type:'error',status,error:{code,message:code}}));}catch{}close(1011,code);}
 async function authenticate(raw){
  let auth,headers;
  try{
   if(typeof raw!=='string'||raw.length>20000)throw new Error('auth');auth=JSON.parse(raw);
   if(auth?.type!=='iah.authenticate'||typeof auth.authorization!=='string'||auth.authorization.length>16384||!/^Bearer [A-Za-z0-9._~+\/-]+=*$/.test(auth.authorization)||typeof auth.sessionId!=='string'||!/^[A-Za-z0-9._:-]{1,128}$/.test(auth.sessionId))throw new Error('auth');
   headers=new Headers({Upgrade:'websocket',Authorization:auth.authorization,'Session-ID':auth.sessionId});auth=null;
  }catch{fail('RELAY_ACCESS_TOKEN_REQUIRED',401);return;}
  clearTimeout(authTimer);authTimer=setTimeout(()=>fail('RELAY_UPSTREAM_TIMEOUT',504),20000);
  try{
   const response=await fetchImpl('https://api.openai.com/v1/responses',{headers,signal:controller.signal,redirect:'manual'});headers=null;
   if(closed){try{response.webSocket?.close(1000,'RELAY_CLOSED');}catch{}return;}
   if(response.status!==101||!response.webSocket){cancelBody(response.body);fail('RELAY_UPGRADE_REJECTED',response.status>=400?response.status:502);return;}
   upstream=response.webSocket;upstream.accept();
   upstream.addEventListener('message',event=>{if(closed)return;if(typeof event.data!=='string'||event.data.length>2000000){fail('RELAY_EVENT_LIMIT');return;}idle();try{socket.send(event.data);}catch{close();}});
   upstream.addEventListener('close',()=>close(1000,'RELAY_UPSTREAM_CLOSED'));
   upstream.addEventListener('error',()=>fail('RELAY_UPSTREAM_UNAVAILABLE'));
   clearTimeout(authTimer);ready=true;idle();lifetimeTimer=setTimeout(()=>close(1000,'RELAY_RECONNECT'),3300000);
   socket.send(JSON.stringify({type:'iah.ready'}));
  }catch{headers=null;fail('RELAY_UPSTREAM_UNAVAILABLE');}
 }
 socket.addEventListener('message',event=>{
  if(closed)return;
  if(!ready){if(authenticating){fail('RELAY_NOT_READY',400);return;}authenticating=true;void authenticate(event.data);return;}
  if(typeof event.data!=='string'||event.data.length>16000000){fail('RELAY_REQUEST_LIMIT',413);return;}
  idle();if(event.data==='{"type":"iah.ping"}'){try{socket.send('{"type":"iah.pong"}');}catch{close();}return;}try{upstream.send(event.data);}catch{fail('RELAY_UPSTREAM_UNAVAILABLE');}
 });
 socket.addEventListener('close',()=>close(1000,'RELAY_CLIENT_CLOSED'));
 socket.addEventListener('error',()=>close());
 try{return upgrade(client,responseHeaders(origin));}catch(error){close();throw error;}
}
