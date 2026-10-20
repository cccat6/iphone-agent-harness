const KEY_URL='https://auth.openai.com/.well-known/jwks.json';
const MAX_BYTES=65536;
const response=(value,status=200)=>Response.json(value,{status,headers:{
 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS',
 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
}});
async function readKeys(upstream){
 const announced=Number(upstream.headers.get('content-length'));
 if(announced>MAX_BYTES||!upstream.body){await upstream.body?.cancel();throw new Error('invalid_key_response');}
 const reader=upstream.body.getReader(),chunks=[];let bytes=0,finished=false;
 try{
  for(;;){const {done,value}=await reader.read();if(done){finished=true;break;}bytes+=value.byteLength;if(bytes>MAX_BYTES)throw new Error('key_response_too_large');chunks.push(value);}
 }finally{if(!finished)await reader.cancel().catch(()=>{});reader.releaseLock();}
 const joined=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length;}
 const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined));
 if(!Array.isArray(parsed.keys)||!parsed.keys.length||parsed.keys.length>32)throw new Error('invalid_keys');
 const ids=new Set(),keys=parsed.keys.map(key=>{
  if(!key||key.kty!=='RSA'||typeof key.kid!=='string'||!/^[A-Za-z0-9._:-]{1,200}$/.test(key.kid)||
   typeof key.n!=='string'||!/^[A-Za-z0-9_-]{256,2048}$/.test(key.n)||typeof key.e!=='string'||!/^[A-Za-z0-9_-]{1,16}$/.test(key.e)||
   (key.alg!==undefined&&key.alg!=='RS256')||(key.use!==undefined&&key.use!=='sig')||
   ['d','p','q','dp','dq','qi','oth'].some(name=>Object.hasOwn(key,name))||ids.has(key.kid))throw new Error('invalid_public_key');
  ids.add(key.kid);return {kty:'RSA',kid:key.kid,n:key.n,e:key.e,alg:'RS256',use:'sig'};
 });
 return {keys};
}
// A fixed public metadata endpoint. Never forwards incoming headers, URL
// parameters, cookies or request bodies, and has no account/database access.
export async function serveOpenAIPublicKeys(request,{fetchImpl=globalThis.fetch}={}){
 if(new URL(request.url).search||request.headers.has('authorization')||request.headers.has('cookie'))return response({error:'public_keys_only'},400);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS','Cache-Control':'no-store'}});
 if(request.method!=='GET')return new Response(null,{status:405,headers:{Allow:'GET, OPTIONS','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}});
 let phase='fetch',upstreamStatus=0;
 try{
  const upstream=await fetchImpl.call(globalThis,KEY_URL,{method:'GET',headers:{Accept:'application/json'},credentials:'omit',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(8000)});
  phase='upstream';upstreamStatus=upstream.status;
  if(upstream.status!==200){await upstream.body?.cancel();throw new Error('key_service_unavailable');}
  phase='body';
  return response(await readKeys(upstream));
 }catch{return response({error:'public_keys_unavailable',phase,...(upstreamStatus?{upstreamStatus}:{})},502);}
}
