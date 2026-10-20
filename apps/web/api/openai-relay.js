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
 ...(origin?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type, Accept','Access-Control-Expose-Headers':'X-Request-ID, Retry-After'}:{}),
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
 if(request.method==='OPTIONS'){
  const method=request.headers.get('access-control-request-method'),headers=(request.headers.get('access-control-request-headers')||'').toLowerCase().split(',').map(v=>v.trim()).filter(Boolean);
  if(method&&method!==route.method||headers.some(h=>!['authorization','content-type','accept'].includes(h)))return reject(origin,403,'RELAY_PREFLIGHT_DENIED');
  return new Response(null,{status:204,headers:responseHeaders(origin)});
 }
 if(request.method!==route.method)return reject(origin,405,'RELAY_METHOD_NOT_ALLOWED');
 const authorization=request.headers.get('authorization');
 if(!authorization||authorization.length>16384||!/^Bearer [A-Za-z0-9._~+\/-]+=*$/.test(authorization))return reject(origin,401,'RELAY_ACCESS_TOKEN_REQUIRED');
 if(route.method==='POST'&&(!request.body||!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||'')))return reject(origin,415,'RELAY_JSON_REQUIRED');
 const controller=new AbortController(),abort=()=>controller.abort(new Error('relay_cancelled'));request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)abort();
 let timedOut=false,reader,finished=false;
 const timer=setTimeout(()=>{timedOut=true;controller.abort(new Error('relay_timeout'));},timeoutMs);
 const cleanup=()=>{clearTimeout(timer);request.signal.removeEventListener('abort',abort);};
 const finish=()=>{if(finished)return;finished=true;cleanup();};
 try{
  const headers=new Headers({Authorization:authorization,Accept:route.method==='GET'?'application/json':'text/event-stream','Accept-Encoding':'identity'});
  if(route.method==='POST')headers.set('Content-Type','application/json');
  const pending=Promise.resolve(fetchImpl.call(globalThis,route.url,{method:route.method,headers,body:route.method==='POST'?request.body:undefined,signal:controller.signal,redirect:'manual',credentials:'omit',cache:'no-store'})).then(upstream=>{if(controller.signal.aborted){cancelBody(upstream.body);throw controller.signal.reason;}return upstream;});
  const upstream=await abortable(pending,controller.signal);
  if(upstream.status>=300&&upstream.status<400){cancelBody(upstream.body);finish();return reject(origin,502,'RELAY_UPSTREAM_REDIRECT');}
  const outgoing=responseHeaders(origin);
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
