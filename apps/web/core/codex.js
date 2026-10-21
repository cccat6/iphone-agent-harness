import {SITE_CONFIG} from '../site-config.js';
import {readText} from './http.js';
import {modelContextMetadata} from './models.js';
import {modelReasoningMetadata,reasoningParameters} from './reasoning.js';
import {contextOverflowError,readProviderFailure} from './provider-errors.js';
import {safeNetworkDiagnostics} from './network-diagnostics.js';
// Subscription transport. Tokens stay in this module's memory unless the caller
// explicitly saves them in the browser-local credential store. Never reads Codex auth.json.
export const CODEX_LIMITS=Object.freeze({eventChars:2000000,textChars:1000000,toolArgumentChars:64000,stateChars:1000000,toolCalls:8,outputItems:256,jsonBytes:2000000});
export const CODEX_TOOL_NAMESPACE='harness';
export const CODEX_CLIENT_ID='app_EMoamEEZ73f0CkXaXp7hrann';
export const CODEX_ENDPOINTS=Object.freeze({issuer:'https://auth.openai.com',userCode:'https://auth.openai.com/api/accounts/deviceauth/usercode',poll:'https://auth.openai.com/api/accounts/deviceauth/token',token:'https://auth.openai.com/oauth/token',planToken:'https://auth.openai.com/api/accounts/oauth/token',verification:'https://auth.openai.com/codex/device',responses:'https://chatgpt.com/backend-api/codex/responses',models:'https://chatgpt.com/backend-api/codex/models',planResponses:'https://api.openai.com/v1/responses',planModels:'https://api.openai.com/v1/models'});
const accounts=new Map();let activeId='';const completedLogins=new WeakSet(),loginExchanges=new Map();const tokenObservers=new Set();
export function setCodexTokenObserver(listener){if(typeof listener!=='function')throw new TypeError('需要令牌更新监听函数');tokenObservers.add(listener);return ()=>tokenObservers.delete(listener);}
function tokensChanged(id){for(const listener of [...tokenObservers])try{Promise.resolve(listener(Object.freeze({id,event:'refreshed'}))).catch(()=>{});}catch{}}
const copy=v=>structuredClone(v), abortError=()=>new DOMException('操作已取消','AbortError');
function check(signal){if(signal?.aborted)throw signal.reason||abortError();}
function safeURL(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||!['auth.openai.com','chatgpt.com','api.openai.com'].includes(u.hostname))throw new Error('订阅凭据仅允许发送到官方 HTTPS 地址');return u.href;}
function opaque(bytes=32){const v=crypto.getRandomValues(new Uint8Array(bytes));return btoa(String.fromCharCode(...v)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function decode64(value){return Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/').padEnd(Math.ceil(value.length/4)*4,'=')),c=>c.charCodeAt(0));}
function jwt(token){try{return JSON.parse(new TextDecoder().decode(decode64(token.split('.')[1])));}catch{return {};}}
function identityFailure(code,message='登录身份签名或账号验证失败'){return Object.assign(new Error(message+' ['+code+']'),{code});}
function failure(message,status){const e=new Error(message+(status?`（HTTP ${status}）`:''));if(status)e.status=status;return e;}
const subscriptionTimeout=()=>Object.assign(new Error('订阅请求超时，请重试'),{name:'TimeoutError',code:'SUBSCRIPTION_TIMEOUT'});
async function withSubscriptionDeadline(milliseconds,signal,work){const timeout=AbortSignal.timeout(milliseconds),active=signal?AbortSignal.any([signal,timeout]):timeout;try{return await work(active);}catch(cause){check(signal);if(timeout.aborted)throw subscriptionTimeout();throw cause;}}
const networkNow=()=>performance.now();
function codexCacheUsage(usage={}){const details=usage.input_tokens_details||usage.prompt_tokens_details||{},cached=usage.prompt_cache_hit_tokens??details.cached_tokens??usage.cache_read_input_tokens,input=usage.prompt_tokens??usage.input_tokens,writes=usage.cache_creation_input_tokens??details.cache_write_tokens??null;return {reported:cached!==undefined,inputTokens:input??null,cachedInputTokens:cached??null,cacheWriteTokens:writes,cacheWriteTokens30m:details.cache_write_tokens_details?.ttl_30m_tokens??null,cacheWriteTokens12h:details.cache_write_tokens_details?.ttl_12h_tokens??null,uncachedInputTokens:usage.prompt_cache_miss_tokens??(input!==undefined&&cached!==undefined?Math.max(0,input-cached-(writes||0)):null),outputTokens:usage.output_tokens??null,totalTokens:usage.total_tokens??null};}
function networkFacts(phase,started,error,attempts=1,extra={}){let online=null,visibility='unknown';try{if(typeof globalThis.navigator?.onLine==='boolean')online=globalThis.navigator.onLine;}catch{}try{if(['visible','hidden','prerender'].includes(globalThis.document?.visibilityState))visibility=globalThis.document.visibilityState;}catch{}return safeNetworkDiagnostics({phase,attempts,durationMs:Math.max(0,Math.min(3600000,networkNow()-started)),errorName:error instanceof TypeError?'TypeError':error?.name==='NetworkError'?'NetworkError':'Error',online,visibility,...extra});}
async function request(url,{fetchImpl=fetch,signal,redirectMode='error',relayEndpoint,...init}={}){check(signal);const started=networkNow();try{const pending=Promise.resolve(fetchImpl.call(globalThis,relayEndpoint===String(url)?relayEndpoint:safeURL(url),{...init,signal,credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',redirect:redirectMode==='manual'?'manual':'error'})).then(response=>{if(signal?.aborted){void response.body?.cancel().catch(()=>{});check(signal);}return response;});return await awaitWithSignal(pending,signal);}catch(error){check(signal);throw Object.assign(failure('订阅连接失败；请检查网络或服务可用性'),{code:'SUBSCRIPTION_NETWORK',networkDiagnostics:networkFacts('awaiting_response_headers',started,error),beforeHeadersTypeError:error instanceof TypeError});}}
async function post(url,body,options={},form=false){return request(url,{...options,method:'POST',headers:{'content-type':form?'application/x-www-form-urlencoded':'application/json'},body:form?new URLSearchParams(body):JSON.stringify(body)});}
async function json(r,label,{signal}={}){
 check(signal);if(!r.ok){if(r.status===403){const error=await readProviderFailure(r,{signal});if(error.code==='PROVIDER_REGION_UNSUPPORTED')throw error;}throw failure(label,r.status);}const reader=r.body?.getReader();if(!reader)throw failure(label+'：响应格式无效');let total=0;const chunks=[];
 try{while(true){const {done,value}=await awaitWithSignal(reader.read(),signal);check(signal);if(done)break;total+=value.byteLength;if(total>CODEX_LIMITS.jsonBytes)throw failure('订阅 JSON 超过容量限制');chunks.push(value);}const all=new Uint8Array(total);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));}
 catch(e){check(signal);throw failure(e.message==='订阅 JSON 超过容量限制'?e.message:label+'：响应格式无效');}
 finally{try{const closing=reader.cancel();if(signal?.aborted)void closing.catch(()=>{});else await closing;}catch{}reader.releaseLock();}
}
function wait(ms,signal){return new Promise((resolve,reject)=>{check(signal);const finish=()=>{signal?.removeEventListener('abort',stop);resolve();};const timer=setTimeout(finish,ms);function stop(){clearTimeout(timer);reject(signal.reason||abortError());}signal?.addEventListener('abort',stop,{once:true});});}
function awaitWithSignal(promise,signal){if(!signal)return promise;if(signal.aborted){Promise.resolve(promise).catch(()=>{});check(signal);}return new Promise((resolve,reject)=>{const stop=()=>reject(signal.reason||abortError());signal.addEventListener('abort',stop,{once:true});promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',stop));});}
function metadata(a){return {id:a.id,label:a.label,email:a.email,accountId:a.accountId,clientId:a.clientId,flow:a.flow,expiresAt:a.tokens.expiresAt,identityVerified:a.identityVerified,scopes:[...a.scopes]};}
export function listCodexAccounts(){return [...accounts.values()].map(metadata);}
export function hasCodexAccount(id=activeId){return accounts.has(id);}
export function setActiveCodexAccount(id){if(!accounts.has(id))throw new Error('订阅账号不存在');activeId=id;return getCodexAccount(id);}
export function removeCodexAccount(id){const a=accounts.get(id);a?.refreshController?.abort();accounts.delete(id);if(activeId===id)activeId=accounts.keys().next().value||'';}
export function clearCodexAccounts(){for(const id of accounts.keys())removeCodexAccount(id);}
export function getCodexAccount(id=activeId){const a=accounts.get(id);if(!a)return null;return {...metadata(a),accessToken:options=>{if(accounts.get(id)!==a)throw new Error('账号已替换或移除');return accessToken(id,options);},exportTokens:()=>{if(accounts.get(id)!==a)throw new Error('账号已替换或移除');return {...copy(a.tokens),clientId:a.clientId,accountId:a.accountId,flow:a.flow,label:a.label,email:a.email,identityVerified:a.identityVerified,scopes:[...a.scopes]};}};}
function acceptTokens(raw,previous={}){
 const access=raw.access_token||raw.access;if(typeof access!=='string'||!access)throw new Error('登录结果缺少访问令牌');
 const expiresAt=Number(raw.expiresAt??raw.expires??(Date.now()+Number(raw.expires_in||3600)*1000));if(!Number.isFinite(expiresAt))throw new Error('令牌到期时间无效');
 return {access_token:access,refresh_token:raw.refresh_token||raw.refresh||previous.refresh_token||'',id_token:raw.id_token||previous.id_token||'',expiresAt,scope:raw.scope??previous.scope??''};
}
export function registerCodexAccount(id,raw,options={}){
 if(typeof id!=='string'||!id)throw new Error('需要独立的账号登记 ID');const tokens=acceptTokens(raw),claims=jwt(tokens.access_token),identity=jwt(tokens.id_token);
 const claimId=claims['https://api.openai.com/auth']?.chatgpt_account_id;const accountId=options.accountId||raw.accountId||raw.account_id||claimId||'';
 if(claimId&&accountId!==claimId)throw new Error('账号身份与令牌不匹配');
 const flow=options.flow||raw.flow||'codex',clientId=options.clientId||raw.clientId||raw.client_id||CODEX_CLIENT_ID;
 if(!['codex','chatgpt-plan'].includes(flow)||clientId==='dynamic_agent_client')throw new Error('需要已签发的账号客户端 ID');
 const scopes=options.scopes||raw.scopes||String(tokens.scope).split(/\s+/).filter(Boolean);
 if(flow==='codex'&&!accountId)throw new Error('Codex 令牌缺少 ChatGPT account ID');
 if(flow==='chatgpt-plan'&&(!scopes.includes('chatgpt.tokens.use.direct')||!(options.identityVerified??raw.identityVerified)))throw new Error('尚未验证身份或获得 ChatGPT plan 使用授权');
 const old=accounts.get(id);if(old?.accountId&&old.accountId!==accountId)throw new Error('不同账号请使用独立登记 ID');if(flow==='chatgpt-plan'&&old?.subject&&identity.sub!==old.subject)throw identityFailure('SIWC_ACCOUNT_SUBJECT','重新登录身份与选中账号不匹配');if(old&&old.clientId!==clientId)throw new Error('请为不同客户端登记创建独立账号 ID');old?.refreshController?.abort();
 accounts.set(id,{id,tokens,flow,clientId,accountId,subject:identity.sub||'',scopes:[...scopes],identityVerified:Boolean(options.identityVerified??raw.identityVerified),email:options.email||raw.email||identity.email||'',label:options.label||raw.label||options.email||raw.email||id,refreshing:null});if(!activeId)activeId=id;return getCodexAccount(id);
}
async function accessToken(id,{signal,fetchImpl=fetch,loadPublicKeys=loadOpenAIPublicKeys}={}){
 check(signal);const a=accounts.get(id);if(!a)throw new Error('订阅账号尚未登录');
 if(a.flow==='chatgpt-plan'&&!a.scopes.includes('chatgpt.tokens.use.direct'))throw new Error('订阅账号缺少 plan 使用授权');
 if(a.tokens.expiresAt>Date.now()+60000)return a.tokens.access_token;
 if(!a.tokens.refresh_token)throw new Error('订阅登录已到期，请重新登录');
 if(!a.refreshing){a.refreshController=new AbortController();const timer=setTimeout(()=>a.refreshController.abort(subscriptionTimeout()),30000);
  a.refreshing=(async()=>{
   const active=a.refreshController.signal,body={grant_type:'refresh_token',client_id:a.clientId,refresh_token:a.tokens.refresh_token,...(a.flow==='chatgpt-plan'?{resource:'https://api.openai.com/v1'}:{})};
   const r=await post(a.flow==='chatgpt-plan'?CODEX_ENDPOINTS.planToken:CODEX_ENDPOINTS.token,body,{fetchImpl,signal:active},true),raw=await json(r,'订阅刷新失败',{signal:active}),next=acceptTokens(raw,a.tokens);
   if(accounts.get(id)!==a)throw new Error('刷新期间账号已移除');
   const refreshedId=jwt(next.access_token)['https://api.openai.com/auth']?.chatgpt_account_id;if(a.flow==='codex'&&refreshedId&&refreshedId!==a.accountId)throw identityFailure('SIWC_ACCOUNT_SUBJECT','刷新返回了不匹配的账号');
   if(a.flow==='chatgpt-plan'&&raw.id_token!==undefined){const identity=await verifyIdentity(raw.id_token,a.clientId,undefined,loadPublicKeys,active);if(!a.subject||identity.sub!==a.subject)throw identityFailure('SIWC_ACCOUNT_SUBJECT','刷新返回了不匹配的账号');}
   const scopes=raw.scope===undefined?a.scopes:String(raw.scope).split(/\s+/).filter(Boolean);if(a.flow==='chatgpt-plan'&&!scopes.includes('chatgpt.tokens.use.direct'))throw new Error('刷新后缺少 plan 使用授权');
   check(active);if(accounts.get(id)!==a)throw new Error('刷新期间账号已移除');a.tokens=next;a.scopes=scopes;tokensChanged(id);return next.access_token;
  })().finally(()=>{clearTimeout(timer);a.refreshing=null;a.refreshController=null;});
 }
 return awaitWithSignal(a.refreshing,signal);
}

// Device-code remains available for existing Codex registrations. The UI can
// return an authorization-code callback as a pasted URL; OAuth checks are identical.
function loopbackURI(value){
 if(typeof value!=='string'||!/^http:\/\/127\.0\.0\.1(?::[1-9]\d{0,4})?\/auth\/callback$/.test(value))throw new Error('官方 SIWC 要求 127.0.0.1 /auth/callback 回调');
 const url=new URL(value);if(url.username||url.password||url.search||url.hash)throw new Error('登录回调地址无效');return url;
}
function callbackFields(login,value){
 if(typeof value!=='string'||value.length>16384||/[\u0000-\u001f\u007f]/.test(value))throw new Error('登录回调地址无效');
 // Safari may copy the loopback address without its HTTP scheme.
 const pasted=value.trim(),normalized=/^127\.0\.0\.1(?::[1-9]\d{0,4})?\/auth\/callback(?:\?|$)/.test(pasted)?'http://'+pasted:pasted;
 let callback;try{callback=new URL(normalized);}catch{throw new Error('登录回调地址无效');}
 const expected=loopbackURI(login.redirectUri);
 if(callback.username||callback.password||callback.hash||callback.origin!==expected.origin||callback.pathname!==expected.pathname)throw identityFailure('SIWC_CALLBACK_ADDRESS','登录回调地址或 state 不匹配');
 const seen=new Set(),unique=new Set(['code','state','client_id','error']);for(const [key,value]of callback.searchParams){if(/[\u0000-\u001f\u007f]/.test(key+value))throw new Error('登录回调地址无效');if(unique.has(key)&&seen.has(key))throw new Error('登录回调包含重复字段');seen.add(key);}
 if(!login.state||callback.searchParams.get('state')!==login.state)throw identityFailure('SIWC_CALLBACK_STATE','登录回调地址或 state 不匹配');
 if(callback.searchParams.has('error')){if(callback.searchParams.has('code'))throw new Error('登录回调字段冲突');throw new Error('用户未授权本次登录');}
 const code=callback.searchParams.get('code');if(!code||code.length>8192||/[\u0000-\u0020]/.test(code))throw new Error('登录回调缺少有效 code');
 const issued=callback.searchParams.get('client_id'),valid=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,256}$/.test(id)&&id!=='dynamic_agent_client';
 let clientId=login.clientId;if(clientId==='dynamic_agent_client'){if(!valid(issued))throw new Error('缺少签发的客户端 ID');clientId=issued;}else if(!valid(clientId)||issued!==null&&issued!==clientId)throw identityFailure('SIWC_CALLBACK_CLIENT','回调客户端与选中账号不匹配');
 return {code,clientId};
}
export function validateCodexCallback(login,value){if(!login||login.method!=='authorization-code'||!Number.isFinite(login.expiresAt)||login.expiresAt<=Date.now())throw new Error('登录尝试已超时');const {clientId}=callbackFields(login,value);return {clientId};}
function claimLogin(login){
 const now=Date.now();for(const [key,value]of loginExchanges)if(value.expiresAt<=now)loginExchanges.delete(key);
 const identity=login.method==='authorization-code'?login.state:login.device_auth_id;
 if(typeof identity!=='string'||!identity||identity.length>1024)throw new Error('登录尝试无效或已使用');
 const key=login.method+':'+identity;if(loginExchanges.has(key))throw new Error('登录尝试无效或已使用');
 const entry={exchanged:false,expiresAt:login.expiresAt};loginExchanges.set(key,entry);
 return {consume(){entry.exchanged=true;completedLogins.add(login);},release(){if(!entry.exchanged&&loginExchanges.get(key)===entry)loginExchanges.delete(key);}};
}
export async function startCodexLogin({method='device-code',flow='codex',clientId,hostId,idTokenHint,loginHint,agentName='iPhone Agent Harness',redirectUri='http://127.0.0.1:1455/auth/callback',signal,fetchImpl=fetch}={}){
 check(signal);
 if(method==='authorization-code'){
  const uri=loopbackURI(redirectUri);redirectUri=uri.href;if(typeof hostId!=='string'||!hostId||hostId.length>256)throw new Error('需要稳定的 hostId');
  const verifier=opaque(),challenge=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  const state=opaque(),nonce=opaque(),id=clientId||'dynamic_agent_client',url=new URL('https://auth.openai.com/api/accounts/authorize');
  const params={client_id:id,ext_agent_host_id:hostId,response_type:'code',redirect_uri:redirectUri,scope:'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',resource:'https://api.openai.com/v1',state,nonce,code_challenge_method:'S256',code_challenge:challenge};if(id==='dynamic_agent_client')params.agent_name_hint=agentName;
  if(id!=='dynamic_agent_client'){if(idTokenHint!==undefined){if(typeof idTokenHint!=='string'||!idTokenHint||idTokenHint.length>65536)throw new Error('登录身份提示无效');params.id_token_hint=idTokenHint;}if(loginHint!==undefined){if(typeof loginHint!=='string'||!loginHint||loginHint.length>320)throw new Error('登录账号提示无效');params.login_hint=loginHint;}}
  for(const [k,v]of Object.entries(params))url.searchParams.set(k,v);
  return {method,flow:'chatgpt-plan',clientId:id,hostId,redirectUri,verifier,state,nonce,authorizationUrl:url.href,expiresAt:Date.now()+900000};
 }
 if(method!=='device-code')throw new Error('未知订阅登录方式');
 const id=clientId||CODEX_CLIENT_ID;if(id==='dynamic_agent_client')throw new Error('动态注册需要 authorization-code 流程');
 const data=await json(await post(CODEX_ENDPOINTS.userCode,{client_id:id},{signal,fetchImpl}),'设备码登录不可用');const code=data.user_code||data.usercode,interval=Number(data.interval??5);
 if(!data.device_auth_id||!code||!Number.isFinite(interval)||interval<0)throw new Error('设备码响应不完整');
 return {method,flow,clientId:id,device_auth_id:data.device_auth_id,user_code:code,interval:Math.max(1,interval),verification_url:CODEX_ENDPOINTS.verification,verificationUrl:CODEX_ENDPOINTS.verification,expiresAt:Date.now()+900000};
}
export async function loadOpenAIPublicKeys({signal,refresh=false,fetchImpl=globalThis.fetch,endpoint=SITE_CONFIG.openaiPublicKeysEndpoint||'https://igent.cc/api/openai/jwks'}={}){
 const url=new URL(endpoint);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('身份公钥网址无效');if(refresh===true)url.searchParams.set('refresh','1');
 const active=signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000);check(active);
 const response=await awaitWithSignal(fetchImpl.call(globalThis,url.href,{method:'GET',headers:{accept:'application/json'},signal:active,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error'}),active);
 if(!response.ok)throw failure('身份公钥不可用',response.status);
 const body=await readText(response,{maxBytes:262144,signal:active});let keys;try{keys=JSON.parse(body);}catch{throw identityFailure('SIWC_KEYS_FORMAT');}if(!Array.isArray(keys?.keys)||keys.keys.length<1||keys.keys.length>64)throw identityFailure('SIWC_KEYS_FORMAT');return keys;
}
async function verifyIdentity(token,clientId,nonce,loadPublicKeys,signal){
 let stage='SIWC_ID_FORMAT';
 try{
  if(typeof token!=='string'||token.length>65536)throw 0;const parts=token.split('.');if(parts.length!==3)throw 0;
  const header=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decode64(parts[0]))),claims=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decode64(parts[1])));
  if(!header||typeof header!=='object'||!claims||typeof claims!=='object')throw 0;
  stage='SIWC_ID_ALGORITHM';if(header.alg!=='RS256')throw 0;
  stage='SIWC_ID_KEY_ID';if(typeof header.kid!=='string'||!header.kid||header.kid.length>256)throw 0;
  const matching=keys=>keys.filter(k=>k?.kid===header.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256')&&(!k.use||k.use==='sig'));
  stage='SIWC_KEYS_FETCH';let jwks=await awaitWithSignal(Promise.resolve(loadPublicKeys({signal})),signal);check(signal);
  stage='SIWC_KEYS_FORMAT';if(!Array.isArray(jwks?.keys)||jwks.keys.length>64)throw 0;
  let matches=matching(jwks.keys);
  if(!matches.length){stage='SIWC_KEYS_FETCH';jwks=await awaitWithSignal(Promise.resolve(loadPublicKeys({signal,refresh:true})),signal);check(signal);stage='SIWC_KEYS_FORMAT';if(!Array.isArray(jwks?.keys)||jwks.keys.length>64)throw 0;matches=matching(jwks.keys);}
  stage='SIWC_ID_KEY_MATCH';if(matches.length!==1)throw 0;
  const jwk=matches[0];stage='SIWC_KEYS_FORMAT';if(['d','p','q','dp','dq','qi','oth'].some(key=>key in jwk))throw 0;
  stage='SIWC_ID_CRYPTO';const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  stage='SIWC_ID_SIGNATURE';if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode64(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))throw 0;
  check(signal);
  stage='SIWC_ID_ISSUER';if(claims.iss!==CODEX_ENDPOINTS.issuer)throw 0;
  stage='SIWC_ID_SUBJECT';if(typeof claims.sub!=='string'||!claims.sub)throw 0;
  stage='SIWC_ID_AUDIENCE';const audience=Array.isArray(claims.aud)?claims.aud:[claims.aud];if(!audience.includes(clientId)||(audience.length>1&&claims.azp!==clientId)||(claims.azp!==undefined&&claims.azp!==clientId))throw 0;
  stage='SIWC_ID_NONCE';if(nonce!==undefined&&claims.nonce!==nonce)throw 0;
  stage='SIWC_ID_EXPIRED';if(!Number.isFinite(claims.exp)||claims.exp*1000<=Date.now())throw 0;
  stage='SIWC_ID_NOT_YET_VALID';if(claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf*1000>Date.now()+5000))throw 0;
  return claims;
 }catch(cause){check(signal);if(stage==='SIWC_KEYS_FETCH'&&cause?.code==='SIWC_KEYS_FORMAT')stage='SIWC_KEYS_FORMAT';const error=identityFailure(stage);if(stage==='SIWC_KEYS_FETCH'&&Number.isInteger(cause?.status)&&cause.status>=400&&cause.status<=599){error.status=cause.status;error.message+=` (HTTP ${cause.status})`;}throw error;}
}
// Only a temporary public-key outage is retryable after the code is consumed.
// The handle exposes operations, never the exchanged tokens or identity claims.
function pendingIdentityVerification(raw,{accountId,clientId,nonce,label,expiresAt,loadPublicKeys,signal}){
 let tokens=raw,running=false,closed=false;raw=null;
 const controller=new AbortController(),active=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
 const cancel=()=>{closed=true;tokens=null;clearTimeout(timer);signal?.removeEventListener('abort',cancel);controller.abort();};
 const deadline=Math.min(expiresAt,Date.now()+300000),timer=setTimeout(cancel,Math.max(0,deadline-Date.now()));timer.unref?.();signal?.addEventListener('abort',cancel,{once:true});
 if(signal?.aborted)cancel();
 return Object.freeze({expiresAt:deadline,cancel,async retry(){
  if(closed||deadline<=Date.now()){cancel();throw identityFailure('SIWC_ATTEMPT_INVALID','登录尝试已超时');}
  if(running)throw identityFailure('SIWC_VERIFICATION_BUSY','正在验证登录');
  running=true;
  try{
   const claims=await verifyIdentity(tokens.id_token,clientId,nonce,loadPublicKeys,active);check(active);
   if(closed||deadline<=Date.now())throw identityFailure('SIWC_ATTEMPT_INVALID','登录尝试已超时');
   const result=registerCodexAccount(accountId,tokens,{clientId,flow:'chatgpt-plan',label,email:claims.email||'',identityVerified:true});cancel();return result;
  }catch(error){if(error?.code!=='SIWC_KEYS_FETCH'||active.aborted||deadline<=Date.now())cancel();throw error;}
  finally{running=false;}
 }});
}
export async function completeCodexLogin(login,{accountId=crypto.randomUUID(),callbackUrl,signal,fetchImpl=fetch,maxWaitMs=900000,waitImpl=wait,label,loadPublicKeys=loadOpenAIPublicKeys,onVerificationPending}={}){
 if(!login||typeof login!=='object'||completedLogins.has(login))throw new Error('登录尝试无效或已使用');check(signal);let raw,clientId=login.clientId,identityVerified=false,email='';
 if(!Number.isFinite(login.expiresAt)||login.expiresAt<=Date.now())throw new Error('登录尝试已超时');
 if(!['authorization-code','device-code'].includes(login.method))throw new Error('未知订阅登录方式');
 const callback=login.method==='authorization-code'?callbackFields(login,callbackUrl):null,attempt=claimLogin(login);
 try{
 if(login.method==='authorization-code'){
  if(login.flow!=='chatgpt-plan'||typeof login.verifier!=='string'||!/^[A-Za-z0-9_-]{43,128}$/.test(login.verifier)||typeof login.nonce!=='string'||!login.nonce)throw new Error('登录尝试无效或已使用');
  clientId=callback.clientId;attempt.consume();
  raw=await withSubscriptionDeadline(30000,signal,async exchangeSignal=>json(await post(CODEX_ENDPOINTS.planToken,{grant_type:'authorization_code',client_id:clientId,code:callback.code,code_verifier:login.verifier,redirect_uri:login.redirectUri,resource:'https://api.openai.com/v1'},{signal:exchangeSignal,fetchImpl},true),'登录兑换失败',{signal:exchangeSignal}));
  try{const claims=await verifyIdentity(raw.id_token,clientId,login.nonce,loadPublicKeys,signal);identityVerified=true;email=claims.email||'';}
  catch(error){
   if(error?.code==='SIWC_KEYS_FETCH'&&typeof onVerificationPending==='function'&&!signal?.aborted&&login.expiresAt>Date.now()){
    const pending=pendingIdentityVerification(raw,{accountId,clientId,nonce:login.nonce,label,expiresAt:login.expiresAt,loadPublicKeys,signal});raw=null;
    try{onVerificationPending(pending);}catch{pending.cancel();}
   }
   throw error;
  }
 }else{
  const until=Math.min(login.expiresAt,Date.now()+maxWaitMs);let interval=login.interval*1000,code;
  while(Date.now()<until){check(signal);const r=await post(CODEX_ENDPOINTS.poll,{device_auth_id:login.device_auth_id,user_code:login.user_code},{signal,fetchImpl});if(r.ok){code=await json(r,'设备码响应无效');break;}let body={};try{body=await r.json();}catch{}const error=typeof body.error==='string'?body.error:body.error?.code;if(error==='slow_down')interval+=5000;else if(![403,404].includes(r.status)&&error!=='deviceauth_authorization_pending')throw failure('设备码验证失败',r.status);await waitImpl(Math.min(interval,Math.max(0,until-Date.now())),signal);}
  if(!code?.authorization_code||!code.code_verifier)throw new Error('设备码已超时或兑换字段不完整');
  attempt.consume();raw=await json(await post(login.flow==='chatgpt-plan'?CODEX_ENDPOINTS.planToken:CODEX_ENDPOINTS.token,{grant_type:'authorization_code',client_id:clientId,code:code.authorization_code,code_verifier:code.code_verifier,redirect_uri:'https://auth.openai.com/deviceauth/callback',...(login.flow==='chatgpt-plan'?{resource:'https://api.openai.com/v1'}:{})},{signal,fetchImpl},true),'设备码令牌兑换失败');
  // A custom registered device client is not assumed to have SIWC identity verification.
  if(login.flow==='chatgpt-plan')throw new Error('注册客户端请使用经过 ID 签名验证的 authorization-code 流程');
 }
 check(signal);completedLogins.add(login);return registerCodexAccount(accountId,raw,{clientId,flow:login.flow,label,email,identityVerified});
 }finally{attempt.release();}
}
function headers(a,token,{sessionId}={}){const h={'authorization':'Bearer '+token,'content-type':'application/json','accept':'text/event-stream'};if(a.flow==='codex'){h.originator='iphone_automation_harness';h['chatgpt-account-id']=a.accountId;h['OpenAI-Beta']='responses=experimental';if(sessionId)h['session-id']=sessionId;}return h;}
function catalogHeaders(a,token){return {authorization:'Bearer '+token,accept:'application/json',...(a.flow==='codex'?{'chatgpt-account-id':a.accountId}:{})};}
export function normalizeSubscriptionRelay(value){
 const raw=typeof value==='string'?value.trim():value;if(raw!==undefined&&raw!==null&&typeof raw!=='string')throw Object.assign(new Error('订阅转发地址无效'),{code:'SIWC_RELAY_ADDRESS'});
 let url;try{url=new URL(raw||SITE_CONFIG.subscriptionRelayUrl||'https://igent.cc/api/openai');}catch{throw Object.assign(new Error('订阅转发地址无效'),{code:'SIWC_RELAY_ADDRESS'});}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Object.assign(new Error('订阅转发地址需要 HTTPS 且不能包含查询参数或片段'),{code:'SIWC_RELAY_ADDRESS'});
 return url.href.replace(/\/+$/,'');
}
const relayFailure=networkDiagnostics=>Object.assign(new Error('订阅服务连接中断，尚未收到响应，请重试。'),{code:'SIWC_RELAY_NETWORK',...(safeNetworkDiagnostics(networkDiagnostics)?{networkDiagnostics:safeNetworkDiagnostics(networkDiagnostics)}:{})});
const relayStreamFailure=networkDiagnostics=>Object.assign(new Error('订阅回复传输中断，本次回复中的操作尚未执行，请重试。'),{code:'SIWC_RELAY_STREAM',networkDiagnostics});
const catalogRedirect=response=>response?.type==='opaqueredirect'||response?.status>=300&&response?.status<400;
function discardCatalogBody(response){try{Promise.resolve(response?.body?.cancel()).catch(()=>{});}catch{}}
export async function discoverCodexModels({accountId=activeId,signal,fetchImpl=fetch,clientVersion='0.1.0',relayUrl}={}){
 return withSubscriptionDeadline(20000,signal,async signal=>{
 const a=accounts.get(accountId);if(!a)throw new Error('请先选择已登录的订阅账号');const endpoint=a.flow==='codex'?CODEX_ENDPOINTS.models:normalizeSubscriptionRelay(relayUrl)+'/models';const token=await accessToken(accountId,{signal,fetchImpl});const url=new URL(endpoint);if(a.flow==='codex')url.searchParams.set('client_version',clientVersion);
 let response;
 try{response=await request(url,{headers:catalogHeaders(a,token),signal,fetchImpl,...(a.flow==='chatgpt-plan'?{relayEndpoint:endpoint}:{})});}
 catch(error){check(signal);if(error?.code!=='SUBSCRIPTION_NETWORK')throw error;if(a.flow!=='chatgpt-plan')throw Object.assign(error,{code:'CODEX_MODELS_NETWORK'});throw relayFailure(error.networkDiagnostics);}
 if(a.flow==='chatgpt-plan'&&catalogRedirect(response)){discardCatalogBody(response);throw Object.assign(new Error('订阅转发服务返回了重定向'),{code:'SIWC_RELAY_REDIRECT'});}
 if(a.flow==='chatgpt-plan'&&response.status===0){discardCatalogBody(response);throw relayFailure();}
 const data=await json(response,'订阅模型目录不可用',{signal});const items=data.models||data.data;if(!Array.isArray(items))throw new Error('模型目录格式无效');
 // The plan catalog explicitly marks picker entries; older Codex lists omit visibility.
 return items.filter(m=>m&&typeof m==='object'&&(m.visibility==='list'||(a.flow==='codex'&&m.visibility===undefined))).map(m=>({id:m.slug||m.id,name:m.display_name||m.name||m.slug||m.id,description:m.description||'',catalogOnly:true,...modelContextMetadata(m),...modelReasoningMetadata(m)})).filter(m=>typeof m.id==='string'&&m.id);
 });
}
function validToolNamespace(call,flow){return flow==='chatgpt-plan'?call.namespace===CODEX_TOOL_NAMESPACE:call.namespace==null||call.namespace==='';}
function replayState(message,scope){
 const state=message.providerState;
 if(message.role!=='assistant'||state?.kind!=='codex-responses/1'||state.origin!==scope.origin||state.accountId!==scope.accountId||state.backendAccountId!==scope.backendAccountId||state.clientId!==scope.clientId||state.model!==scope.model||state.flow!==scope.flow||!Array.isArray(state.items)||!state.items.length)return null;
 if(state.items.length>CODEX_LIMITS.outputItems||JSON.stringify(state.items).length>CODEX_LIMITS.stateChars)throw new Error('订阅协议状态超过容量限制');
 if(state.items.some(i=>!i||!['reasoning','message','function_call'].includes(i.type)||(i.type==='message'&&(i.role!=='assistant'||!Array.isArray(i.content)||i.content.some(c=>c.type!=='output_text'||typeof c.text!=='string')))||(i.type==='function_call'&&(!i.call_id||typeof i.name!=='string'||typeof i.arguments!=='string'||!validToolNamespace(i,scope.flow)))))return null;
 // A transformed or edited message must not silently replay an older full
 // answer/tool call from opaque state. Compacting callers can drop this state.
 const text=state.items.filter(i=>i.type==='message').flatMap(i=>i.content).map(c=>c.text).join('');
 const calls=state.items.filter(i=>i.type==='function_call');
 if(text!==String(message.text||'')||calls.length!==(message.toolCalls?.length||0))return null;
 try{for(let i=0;i<calls.length;i++){const expected=message.toolCalls[i],actual=calls[i];if(actual.call_id!==expected.id||actual.name!==expected.name||JSON.stringify(JSON.parse(actual.arguments))!==JSON.stringify(expected.arguments))return null;}}catch{return null;}
 return copy(state.items);
}
function continuationState(message,scope){
 const state=message.providerState;
 return state?.kind==='codex-responses/1'&&state.origin===scope.origin&&state.accountId===scope.accountId&&state.backendAccountId===scope.backendAccountId&&state.clientId===scope.clientId&&state.model===scope.model&&state.flow===scope.flow&&typeof state.responseId==='string'&&state.responseId?state:null;
}
function toInput(messages,scope){
 const out=[],images=[];
 for(const m of messages){
  if(m.role==='system')continue;
  if(m.role==='tool'){if(!m.toolCallId)throw new Error('工具结果缺少调用 ID');out.push({type:'function_call_output',call_id:m.toolCallId,output:m.text||' '});for(const image of m.images||[])images.push({type:'input_image',image_url:image,detail:'auto'});continue;}
  if(images.length)out.push({role:'user',content:images.splice(0)});
  const replay=replayState(m,scope);if(replay){out.push(...replay);continue;}
  const content=[];if(m.text)content.push({type:m.role==='assistant'?'output_text':'input_text',text:m.text});for(const image of m.images||[])content.push({type:'input_image',image_url:image,detail:'auto'});if(content.length)out.push({role:m.role,content});for(const c of m.toolCalls||[])out.push({type:'function_call',call_id:c.id,name:c.name,...(scope.flow==='chatgpt-plan'?{namespace:CODEX_TOOL_NAMESPACE}:{}),arguments:JSON.stringify(c.arguments)});
 }
 if(images.length)out.push({role:'user',content:images});return out;
}
async function* events(body,signal,onReadError){const reader=body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let pending='',ended=false;try{while(true){check(signal);let chunk;try{chunk=await awaitWithSignal(reader.read(),signal);}catch(error){check(signal);throw onReadError?onReadError(error):error;}const {done,value}=chunk;pending+=done?decoder.decode():decoder.decode(value,{stream:true});if(pending.length>CODEX_LIMITS.eventChars)throw new Error('订阅响应事件超过容量限制');let match;while((match=/\r?\n\r?\n/.exec(pending))){const block=pending.slice(0,match.index);pending=pending.slice(match.index+match[0].length);const data=block.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).replace(/^ /,'')).join('\n');if(data&&data!=='[DONE]'){try{yield JSON.parse(data);}catch(e){if(e instanceof SyntaxError)throw new Error('订阅响应事件格式无效');throw e;}}}if(done){ended=true;if(pending.trim()&&!pending.trim().startsWith(':'))throw new Error('订阅响应流被截断');return;}}}finally{if(!ended)try{await reader.cancel();}catch{}reader.releaseLock();}}
export async function callCodexModel({provider,messages,tools=[],signal,onDelta=()=>{},onRetry=()=>{},fetchImpl=fetch,sessionId}={}){
 const id=provider?.accountId||provider?.codexAccountId||activeId,a=accounts.get(id);if(!a)throw new Error('请选择已登录的订阅账号');if(!provider?.model)throw new Error('请选择订阅模型');
 const controller=new AbortController(),abort=()=>controller.abort(signal?.reason);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();const timer=setTimeout(()=>controller.abort(new Error('订阅模型请求超时')),provider.timeoutMs||180000);const active=controller.signal;
 try{
  const endpoint=a.flow==='codex'?CODEX_ENDPOINTS.responses:normalizeSubscriptionRelay(provider.subscriptionRelayUrl)+'/responses';
  const token=await accessToken(id,{signal:active,fetchImpl});check(active);if(accounts.get(id)!==a)throw new Error('请求前账号已更换');
  const stateScope={origin:a.flow==='chatgpt-plan'?endpoint:new URL(endpoint).origin,accountId:id,backendAccountId:a.accountId,clientId:a.clientId,model:provider.model,flow:a.flow};
  const previousEntry=provider.enableResponseContinuation===true?[...messages].reverse().find(message=>message.role==='assistant'&&continuationState(message,stateScope)):null;
  const previousResponseId=previousEntry?continuationState(previousEntry,stateScope).responseId:null;
  const requestMessages=previousEntry?messages.slice(messages.indexOf(previousEntry)+1):messages;
  const functionTools=tools.map(t=>({type:'function',name:t.name,description:t.description,parameters:t.schema,strict:false}));
  const wireTools=a.flow==='chatgpt-plan'&&functionTools.length?[{type:'namespace',name:CODEX_TOOL_NAMESPACE,description:'Tools for this Harness conversation.',tools:functionTools}]:functionTools;
  const payload={model:provider.model,store:false,stream:true,include:['reasoning.encrypted_content'],instructions:messages.filter(m=>m.role==='system').map(m=>m.text).join('\n\n')||'You are a helpful assistant.',input:toInput(requestMessages,stateScope),tools:wireTools,tool_choice:tools.length?'auto':'none',parallel_tool_calls:true,...(previousResponseId?{previous_response_id:previousResponseId}: {})};
  if(a.flow==='chatgpt-plan'&&provider.promptCacheKey)payload.prompt_cache_key=provider.promptCacheKey;
  Object.assign(payload,reasoningParameters({...provider,protocol:'codex'}));
  const connectionStarted=networkNow(),requestOptions={method:'POST',headers:headers(a,token,{sessionId:sessionId||provider.sessionId}),body:JSON.stringify(payload),signal:active,fetchImpl,...(a.flow==='chatgpt-plan'?{relayEndpoint:endpoint}:{})};
  const retryDelays=[500,1000,2000,4000,8000];let response,connectionAttempts=0,recoveredNetwork=null;
  while(true){
   try{connectionAttempts++;response=await request(endpoint,requestOptions);if(previousResponseId&&response.status>=400&&response.status<500&&[400,404].includes(response.status)){try{await response.body?.cancel();}catch{}delete payload.previous_response_id;payload.input=toInput(messages,stateScope);requestOptions.body=JSON.stringify(payload);response=await request(endpoint,requestOptions);}break;}
   catch(error){
    check(active);if(a.flow!=='chatgpt-plan'||error?.code!=='SUBSCRIPTION_NETWORK')throw error;
    const facts=safeNetworkDiagnostics({...error.networkDiagnostics,attempts:connectionAttempts,durationMs:Math.max(0,Math.min(3600000,networkNow()-connectionStarted))});
    if(connectionAttempts<=retryDelays.length&&error.beforeHeadersTypeError===true){recoveredNetwork=facts;check(active);if(accounts.get(id)!==a)throw new Error('请求前账号已更换');const delayMs=retryDelays[connectionAttempts-1];try{Promise.resolve(onRetry({attempt:connectionAttempts,maxRetries:retryDelays.length,delayMs})).catch(()=>{});}catch{}await wait(delayMs,active);check(active);if(accounts.get(id)!==a)throw new Error('请求前账号已更换');continue;}
    throw relayFailure(facts);
   }
  }
  if(recoveredNetwork)recoveredNetwork=safeNetworkDiagnostics({...recoveredNetwork,attempts:connectionAttempts,durationMs:Math.max(0,Math.min(3600000,networkNow()-connectionStarted)),recovered:true});
  const streamError=error=>relayStreamFailure(networkFacts('reading_response_stream',connectionStarted,error,connectionAttempts));
  if(!response.ok){const error=await readProviderFailure(response,{signal:active});if(['CONTEXT_WINDOW_EXCEEDED','PROVIDER_REGION_UNSUPPORTED'].includes(error.code))throw error;throw failure(response.status===401?'订阅登录失效，请刷新或重新登录':response.status===429?'订阅额度或速率达到限制':'订阅模型请求失败',response.status);}if(!response.body)throw a.flow==='chatgpt-plan'?streamError(new Error('missing stream')):new Error('订阅后端未返回响应流');
  let text='',terminal=null;const calls=new Map(),finishedItems=new Map(),finishedArguments=new Set();const emit=value=>{try{Promise.resolve(onDelta(value)).catch(()=>{});}catch{}};
  const itemKey=(item,index)=>item?.id??index;
  const sameCall=(left,right)=>['call_id','name','namespace'].every(key=>left[key]===right[key]);
  function saveCall(key,value){if(key===undefined||key===null)throw new Error('工具调用缺少事件标识');if(typeof value.arguments!=='string'||value.arguments.length>CODEX_LIMITS.toolArgumentChars)throw new Error('工具参数超过容量限制');const previous=calls.get(key);if(previous&&(!sameCall(previous,value)||finishedArguments.has(key)&&previous.arguments!==value.arguments))throw new Error('工具调用完成信息冲突');if(!previous&&calls.size>=CODEX_LIMITS.toolCalls)throw new Error('工具调用超过数量限制');calls.set(key,value);}
  function finishItem(item,index){
   if(!item||!['reasoning','message','function_call'].includes(item.type))return;
   const key=itemKey(item,index);if(key===undefined||key===null||item.status!==undefined&&item.status!=='completed')throw new Error('订阅响应条目未完成');
   if(finishedItems.has(key)){if(JSON.stringify(finishedItems.get(key).item)!==JSON.stringify(item))throw new Error('订阅响应条目完成信息冲突');return;}
   if(finishedItems.size>=CODEX_LIMITS.outputItems)throw new Error('订阅协议状态超过容量限制');
   if(item.type==='function_call'){saveCall(key,item);finishedArguments.add(key);}
   finishedItems.set(key,{item,index:Number.isSafeInteger(index)&&index>=0?index:finishedItems.size});
   if(JSON.stringify([...finishedItems.values()].map(entry=>entry.item)).length>CODEX_LIMITS.stateChars)throw new Error('订阅协议状态超过容量限制');
  }
  for await(const e of events(response.body,active,a.flow==='chatgpt-plan'?streamError:undefined)){
   check(active);if(e.type==='error'||e.type==='response.failed'||e.type==='response.incomplete'||e.type==='response.cancelled')throw contextOverflowError(e)||new Error('订阅响应未成功完成；未执行操作');
   if(e.type==='response.output_text.delta'){if(typeof e.delta!=='string'||text.length+e.delta.length>CODEX_LIMITS.textChars)throw new Error('订阅响应文本超过容量限制');text+=e.delta;emit(e.delta);}
   if(e.type==='response.output_item.added'&&e.item?.type==='function_call')saveCall(itemKey(e.item,e.output_index),{...e.item,arguments:e.item.arguments||''});
   if(e.type==='response.function_call_arguments.delta'){const key=e.item_id??e.output_index,c=calls.get(key);if(!c)throw new Error('工具参数缺少起始事件');if(finishedArguments.has(key)||finishedItems.has(key))throw new Error('工具参数在完成后发生变化');if(typeof e.delta!=='string'||c.arguments.length+e.delta.length>CODEX_LIMITS.toolArgumentChars)throw new Error('工具参数超过容量限制');c.arguments+=e.delta;}
   if(e.type==='response.function_call_arguments.done'){const c=calls.get(e.item_id??e.output_index);if(!c)throw new Error('工具参数缺少起始事件');if(typeof e.arguments!=='string'||e.arguments.length>CODEX_LIMITS.toolArgumentChars)throw new Error('工具参数超过容量限制');const key=e.item_id??e.output_index;if(finishedArguments.has(key)&&c.arguments!==e.arguments)throw new Error('工具调用完成信息冲突');c.arguments=e.arguments;finishedArguments.add(key);}
   if(e.type==='response.output_item.done')finishItem(e.item,e.output_index);
   if(e.type==='response.completed'||e.type==='response.done'){terminal=e.response;if(!terminal||terminal.status!=='completed')throw new Error('订阅响应结束状态非 completed');break;}
  }
  check(active);if(!terminal)throw a.flow==='chatgpt-plan'?streamError(new Error('incomplete stream')):new Error('订阅响应缺少 completed 事件；未执行操作');
  if(terminal.output!==undefined&&(!Array.isArray(terminal.output)||terminal.output.length>CODEX_LIMITS.outputItems||JSON.stringify(terminal.output).length>CODEX_LIMITS.stateChars))throw new Error('订阅协议状态超过容量限制');
  const rebuilt=!Array.isArray(terminal.output)||terminal.output.length===0;
  if(rebuilt&&[...calls.keys()].some(key=>!finishedItems.has(key)))throw new Error('工具调用结束状态缺失');
  const completedItems=rebuilt?[...finishedItems.values()].sort((a,b)=>a.index-b.index).map(entry=>entry.item):terminal.output;
  if(!rebuilt)for(const [key,call]of calls){const matches=completedItems.filter(item=>item.type==='function_call'&&item.call_id===call.call_id);if(matches.length!==1||!sameCall(call,matches[0])||finishedArguments.has(key)&&call.arguments!==matches[0].arguments)throw new Error('工具调用完成信息冲突');}
  if(completedItems.some(i=>(i.content||[]).some(c=>c.type==='refusal')))throw new Error('订阅响应被拒绝；未执行操作');
  const finalText=completedItems.filter(i=>i.type==='message').flatMap(i=>i.content||[]).filter(c=>c.type==='output_text').map(c=>c.text||'').join('');if(finalText.length>CODEX_LIMITS.textChars)throw new Error('订阅响应文本超过容量限制');if(finalText){if(finalText.startsWith(text)&&finalText.length>text.length)emit(finalText.slice(text.length));text=finalText;}
  const source=completedItems.filter(i=>i.type==='function_call'),ids=new Set();if(calls.size&&!source.length)throw new Error('工具调用结束状态缺失');if(source.length>CODEX_LIMITS.toolCalls)throw new Error('工具调用超过数量限制');const toolCalls=source.map(c=>{if(!c.call_id||!c.name||ids.has(c.call_id)||!validToolNamespace(c,a.flow)||a.flow==='chatgpt-plan'&&!tools.some(tool=>tool.name===c.name))throw new Error('工具调用身份无效或重复');ids.add(c.call_id);if(typeof c.arguments!=='string'||c.arguments.length>CODEX_LIMITS.toolArgumentChars)throw new Error('工具参数超过容量限制');let args;try{args=JSON.parse(c.arguments||'{}');}catch{throw new Error('工具参数 JSON 不完整');}if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('工具参数必须是对象');return {id:c.call_id,name:c.name,arguments:args};});
  if(!text&&!toolCalls.length)throw new Error('订阅响应为空；未执行操作');
  const items=copy(completedItems.filter(i=>['reasoning','message','function_call'].includes(i.type)));
  const providerState={kind:'codex-responses/1',...stateScope,responseId:terminal.id||null,items};
  return {text,toolCalls,finish:toolCalls.length?'tool_calls':'stop',usage:terminal.usage||null,cache:terminal.usage?{...codexCacheUsage(terminal.usage),diagnostics:terminal.prompt_cache_diagnostics||null,serviceTier:terminal.service_tier||null}:null,responseId:terminal.id||null,providerState,...(recoveredNetwork?{transportDiagnostics:recoveredNetwork}:{})};
 }catch(e){check(active);if(e.status||e.code==='CONTEXT_WINDOW_EXCEEDED'||e.code?.startsWith('SIWC_RELAY_'))throw e;throw new Error(['订阅响应','订阅协议','工具','请选择','请求前','订阅账号','登录'].some(p=>e.message?.startsWith(p))?e.message:'订阅通信失败；请检查登录、CORS 与网络');}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
