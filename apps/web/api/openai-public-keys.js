const KEY_URL='https://auth.openai.com/.well-known/jwks.json';
const CACHE_KEY='openai-jwks-v1',FRESH_MS=15*60*1000,MAX_AGE_MS=24*60*60*1000,MAX_BYTES=65536;
const response=(value,status=200,headers={})=>Response.json(value,{status,headers:{
 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS',
 'Access-Control-Expose-Headers':'X-OpenAI-JWKS-Source, X-OpenAI-JWKS-Age',
 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers,
}});
function publicKeys(parsed){
 if(!Array.isArray(parsed?.keys)||!parsed.keys.length||parsed.keys.length>32)throw new Error('invalid_keys');
 const ids=new Set(),keys=parsed.keys.map(key=>{
  if(!key||key.kty!=='RSA'||typeof key.kid!=='string'||!/^[A-Za-z0-9._:-]{1,200}$/.test(key.kid)||
   typeof key.n!=='string'||!/^[A-Za-z0-9_-]{256,2048}$/.test(key.n)||typeof key.e!=='string'||!/^[A-Za-z0-9_-]{1,16}$/.test(key.e)||
   (key.alg!==undefined&&key.alg!=='RS256')||(key.use!==undefined&&key.use!=='sig')||
   ['d','p','q','dp','dq','qi','oth'].some(name=>Object.hasOwn(key,name))||ids.has(key.kid))throw new Error('invalid_public_key');
  ids.add(key.kid);return {kty:'RSA',kid:key.kid,n:key.n,e:key.e,alg:'RS256',use:'sig'};
 });
 return {keys};
}
async function bounded(promise,ms){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('metadata_timeout')),ms);})]);}finally{clearTimeout(timer);}}
function readChunk(reader,signal){return new Promise((resolve,reject)=>{
 const stop=()=>{signal.removeEventListener('abort',stop);reject(new Error('metadata_timeout'));};
 if(signal.aborted)return stop();signal.addEventListener('abort',stop,{once:true});
 reader.read().then(value=>{signal.removeEventListener('abort',stop);resolve(value);},error=>{signal.removeEventListener('abort',stop);reject(error);});
});}
async function readKeys(upstream,signal){
 const announced=Number(upstream.headers.get('content-length'));
 if(announced>MAX_BYTES||!upstream.body){void upstream.body?.cancel().catch(()=>{});throw new Error('invalid_key_response');}
 const reader=upstream.body.getReader(),chunks=[];let bytes=0,finished=false;
 try{
  for(;;){const {done,value}=await readChunk(reader,signal);if(done){finished=true;break;}bytes+=value.byteLength;if(bytes>MAX_BYTES)throw new Error('key_response_too_large');chunks.push(value);}
 }finally{if(!finished)void reader.cancel().catch(()=>{});reader.releaseLock();}
 const joined=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length;}
 return publicKeys(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined)));
}
async function cachedKeys(keyCache,now){
 if(!keyCache)return null;
 try{
  const text=await bounded(keyCache.get(CACHE_KEY,{type:'text',cacheTtl:30}),1500);
  if(typeof text!=='string'||text.length>MAX_BYTES)return null;
  const item=JSON.parse(text),age=now-item.fetchedAt;
  if(item.version!==1||!Number.isFinite(item.fetchedAt)||age<0||age>MAX_AGE_MS)return null;
  return {jwks:publicKeys(item.jwks),age};
 }catch{return null;}
}
// Only fixed, public verification metadata is cached. Browser credentials and
// request headers are never forwarded or stored in this namespace.
export async function serveOpenAIPublicKeys(request,{fetchImpl=globalThis.fetch,keyCache,context,clock=Date.now,now=clock()}={}){
 const startedAt=clock();
 const search=new URL(request.url).search,refresh=search==='?refresh=1';
 if((search&&!refresh)||request.headers.has('authorization')||request.headers.has('cookie'))return response({error:'public_keys_only'},400);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS','Cache-Control':'no-store'}});
 if(request.method!=='GET')return new Response(null,{status:405,headers:{Allow:'GET, OPTIONS','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}});
 const cached=await cachedKeys(keyCache,now);
 const cacheAge=()=>cached.age+Math.max(0,clock()-startedAt);
 const serveCached=source=>response(cached.jwks,200,{'X-OpenAI-JWKS-Source':source,'X-OpenAI-JWKS-Age':String(Math.floor(cacheAge()/1000))});
 if(cached&&cacheAge()<FRESH_MS&&!refresh)return serveCached('cache');
 let phase='fetch',upstreamStatus=0;
 try{
  const signal=AbortSignal.timeout(5000);
  const jwks=await bounded((async()=>{
   const upstream=await fetchImpl.call(globalThis,KEY_URL,{method:'GET',headers:{Accept:'application/json'},credentials:'omit',redirect:'manual',cache:'no-store',signal});
   phase='upstream';upstreamStatus=upstream.status;
   if(upstream.status!==200){void upstream.body?.cancel().catch(()=>{});throw new Error('key_service_unavailable');}
   if(signal.aborted){void upstream.body?.cancel().catch(()=>{});throw new Error('metadata_timeout');}
   phase='body';return readKeys(upstream,signal);
  })(),5000);
  if(keyCache){
   const write=Promise.resolve().then(()=>keyCache.put(CACHE_KEY,JSON.stringify({version:1,fetchedAt:now,jwks}),{expirationTtl:86400})).catch(()=>{});
   if(context?.waitUntil)context.waitUntil(write);else await bounded(write,1500).catch(()=>{});
  }
  return response(jwks,200,{'X-OpenAI-JWKS-Source':'upstream','X-OpenAI-JWKS-Age':'0'});
 }catch{
  if(cached&&cacheAge()<=MAX_AGE_MS&&!refresh)return serveCached('stale');
  return response({error:'public_keys_unavailable',phase,...(upstreamStatus?{upstreamStatus}:{})},502);
 }
}
