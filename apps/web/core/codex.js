import {modelContextMetadata} from './models.js';
import {contextOverflowError,readProviderFailure} from './provider-errors.js';
// Subscription transport. Tokens stay in this module's memory unless the caller
// explicitly exports them for its encrypted vault. Never reads Codex auth.json.
export const CODEX_LIMITS=Object.freeze({eventChars:2000000,textChars:1000000,toolArgumentChars:64000,stateChars:1000000,toolCalls:8,outputItems:256,jsonBytes:2000000});
export const CODEX_CLIENT_ID='app_EMoamEEZ73f0CkXaXp7hrann';
export const CODEX_ENDPOINTS=Object.freeze({issuer:'https://auth.openai.com',userCode:'https://auth.openai.com/api/accounts/deviceauth/usercode',poll:'https://auth.openai.com/api/accounts/deviceauth/token',token:'https://auth.openai.com/oauth/token',planToken:'https://auth.openai.com/api/accounts/oauth/token',verification:'https://auth.openai.com/codex/device',responses:'https://chatgpt.com/backend-api/codex/responses',models:'https://chatgpt.com/backend-api/codex/models',planResponses:'https://api.openai.com/v1/responses',planModels:'https://api.openai.com/v1/models'});
const accounts=new Map();let activeId='';const completedLogins=new WeakSet();const tokenObservers=new Set();
export function setCodexTokenObserver(listener){if(typeof listener!=='function')throw new TypeError('需要令牌更新监听函数');tokenObservers.add(listener);return ()=>tokenObservers.delete(listener);}
function tokensChanged(id){for(const listener of [...tokenObservers])try{Promise.resolve(listener(Object.freeze({id,event:'refreshed'}))).catch(()=>{});}catch{}}
const copy=v=>structuredClone(v), abortError=()=>new DOMException('操作已取消','AbortError');
function check(signal){if(signal?.aborted)throw signal.reason||abortError();}
function safeURL(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||!['auth.openai.com','chatgpt.com','api.openai.com'].includes(u.hostname))throw new Error('订阅凭据仅允许发送到官方 HTTPS 地址');return u.href;}
function opaque(bytes=32){const v=crypto.getRandomValues(new Uint8Array(bytes));return btoa(String.fromCharCode(...v)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function decode64(value){return Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/').padEnd(Math.ceil(value.length/4)*4,'=')),c=>c.charCodeAt(0));}
function jwt(token){try{return JSON.parse(new TextDecoder().decode(decode64(token.split('.')[1])));}catch{return {};}}
function failure(message,status){const e=new Error(message+(status?`（HTTP ${status}）`:''));if(status)e.status=status;return e;}
async function request(url,{fetchImpl=fetch,signal,...init}={}){check(signal);try{return await fetchImpl(safeURL(url),{...init,signal,credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store'});}catch{check(signal);throw failure('订阅连接失败；请检查浏览器 CORS、网络或服务可用性');}}
async function post(url,body,options={},form=false){return request(url,{...options,method:'POST',headers:{'content-type':form?'application/x-www-form-urlencoded':'application/json'},body:form?new URLSearchParams(body):JSON.stringify(body)});}
async function json(r,label){
 if(!r.ok)throw failure(label,r.status);const reader=r.body?.getReader();if(!reader)throw failure(label+'：响应格式无效');let total=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>CODEX_LIMITS.jsonBytes)throw failure('订阅 JSON 超过容量限制');chunks.push(value);}const all=new Uint8Array(total);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));}
 catch(e){throw failure(e.message==='订阅 JSON 超过容量限制'?e.message:label+'：响应格式无效');}
 finally{try{await reader.cancel();}catch{}reader.releaseLock();}
}
function wait(ms,signal){return new Promise((resolve,reject)=>{check(signal);const finish=()=>{signal?.removeEventListener('abort',stop);resolve();};const timer=setTimeout(finish,ms);function stop(){clearTimeout(timer);reject(signal.reason||abortError());}signal?.addEventListener('abort',stop,{once:true});});}
function awaitWithSignal(promise,signal){if(!signal)return promise;check(signal);return new Promise((resolve,reject)=>{const stop=()=>reject(signal.reason||abortError());signal.addEventListener('abort',stop,{once:true});promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',stop));});}
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
 const old=accounts.get(id);if(old?.accountId&&old.accountId!==accountId)throw new Error('不同账号请使用独立登记 ID');if(flow==='chatgpt-plan'&&old?.subject&&identity.sub!==old.subject)throw new Error('重新登录身份与选中账号不匹配');if(old&&old.clientId!==clientId)throw new Error('请为不同客户端登记创建独立账号 ID');old?.refreshController?.abort();
 accounts.set(id,{id,tokens,flow,clientId,accountId,subject:identity.sub||'',scopes:[...scopes],identityVerified:Boolean(options.identityVerified??raw.identityVerified),email:options.email||raw.email||identity.email||'',label:options.label||raw.label||options.email||raw.email||id,refreshing:null});if(!activeId)activeId=id;return getCodexAccount(id);
}
async function accessToken(id,{signal,fetchImpl=fetch}={}){
 check(signal);const a=accounts.get(id);if(!a)throw new Error('订阅账号尚未登录');
 if(a.flow==='chatgpt-plan'&&!a.scopes.includes('chatgpt.tokens.use.direct'))throw new Error('订阅账号缺少 plan 使用授权');
 if(a.tokens.expiresAt>Date.now()+60000)return a.tokens.access_token;
 if(!a.tokens.refresh_token)throw new Error('订阅登录已到期，请重新登录');
 if(!a.refreshing){a.refreshController=new AbortController();const timer=setTimeout(()=>a.refreshController.abort(),30000);
  a.refreshing=(async()=>{const body={grant_type:'refresh_token',client_id:a.clientId,refresh_token:a.tokens.refresh_token,...(a.flow==='chatgpt-plan'?{resource:'https://api.openai.com/v1'}:{})};const r=await post(a.flow==='chatgpt-plan'?CODEX_ENDPOINTS.planToken:CODEX_ENDPOINTS.token,body,{fetchImpl,signal:a.refreshController.signal},true);const raw=await json(r,'订阅刷新失败');const next=acceptTokens(raw,a.tokens);if(accounts.get(id)!==a)throw new Error('刷新期间账号已移除');const refreshedId=jwt(next.access_token)['https://api.openai.com/auth']?.chatgpt_account_id;if(a.flow==='codex'&&refreshedId&&refreshedId!==a.accountId)throw new Error('刷新返回了不匹配的账号');const scopes=raw.scope===undefined?a.scopes:String(raw.scope).split(/\s+/).filter(Boolean);if(a.flow==='chatgpt-plan'&&!scopes.includes('chatgpt.tokens.use.direct'))throw new Error('刷新后缺少 plan 使用授权');a.tokens=next;a.scopes=scopes;tokensChanged(id);return next.access_token;})().finally(()=>{clearTimeout(timer);a.refreshing=null;a.refreshController=null;});
 }
 return awaitWithSignal(a.refreshing,signal);
}

// Default is the device-code compatibility flow used in public Codex CLI/pi.
// method:'authorization-code' implements the separate registered SIWC flow;
// its official loopback callback still requires a caller-owned local runtime.
export async function startCodexLogin({method='device-code',flow='codex',clientId,hostId,agentName='iPhone Agent Harness',redirectUri='http://127.0.0.1:1455/auth/callback',signal,fetchImpl=fetch}={}){
 check(signal);
 if(method==='authorization-code'){
  const uri=new URL(redirectUri);if(uri.protocol!=='http:'||uri.hostname!=='127.0.0.1'||uri.pathname!=='/auth/callback')throw new Error('官方 SIWC 要求 127.0.0.1 /auth/callback 回调');if(!hostId)throw new Error('需要稳定的 hostId');
  const verifier=opaque(),challenge=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  const state=opaque(),nonce=opaque(),id=clientId||'dynamic_agent_client',url=new URL('https://auth.openai.com/api/accounts/authorize');
  const params={client_id:id,ext_agent_host_id:hostId,response_type:'code',redirect_uri:redirectUri,scope:'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',resource:'https://api.openai.com/v1',state,nonce,code_challenge_method:'S256',code_challenge:challenge};if(id==='dynamic_agent_client')params.agent_name_hint=agentName;
  for(const [k,v]of Object.entries(params))url.searchParams.set(k,v);
  return {method,flow:'chatgpt-plan',clientId:id,hostId,redirectUri,verifier,state,nonce,authorizationUrl:url.href,expiresAt:Date.now()+900000};
 }
 if(method!=='device-code')throw new Error('未知订阅登录方式');
 const id=clientId||CODEX_CLIENT_ID;if(id==='dynamic_agent_client')throw new Error('动态注册需要 authorization-code 流程');
 const data=await json(await post(CODEX_ENDPOINTS.userCode,{client_id:id},{signal,fetchImpl}),'设备码登录不可用');const code=data.user_code||data.usercode,interval=Number(data.interval??5);
 if(!data.device_auth_id||!code||!Number.isFinite(interval)||interval<0)throw new Error('设备码响应不完整');
 return {method,flow,clientId:id,device_auth_id:data.device_auth_id,user_code:code,interval:Math.max(1,interval),verification_url:CODEX_ENDPOINTS.verification,verificationUrl:CODEX_ENDPOINTS.verification,expiresAt:Date.now()+900000};
}
async function verifyIdentity(token,clientId,nonce,fetchImpl,signal){
 try{
  const parts=token.split('.');if(parts.length!==3)throw 0;const header=JSON.parse(new TextDecoder().decode(decode64(parts[0]))),claims=jwt(token);if(header.alg!=='RS256'||!header.kid)throw 0;
  const discovery=await json(await request('https://auth.openai.com/.well-known/openid-configuration',{fetchImpl,signal}),'身份元数据不可用');const jwks=await json(await request(discovery.jwks_uri,{fetchImpl,signal}),'身份公钥不可用');const jwk=jwks.keys?.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!jwk)throw 0;
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode64(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))throw 0;
  if(claims.iss!==CODEX_ENDPOINTS.issuer||!claims.sub||!(Array.isArray(claims.aud)?claims.aud.includes(clientId):claims.aud===clientId)||claims.nonce!==nonce||claims.exp*1000<=Date.now()||!Number.isFinite(claims.exp))throw 0;return claims;
 }catch{check(signal);throw new Error('登录身份签名或账号验证失败');}
}
export async function completeCodexLogin(login,{accountId=crypto.randomUUID(),callbackUrl,signal,fetchImpl=fetch,maxWaitMs=900000,waitImpl=wait,label}={}){
 if(!login||completedLogins.has(login))throw new Error('登录尝试无效或已使用');check(signal);let raw,clientId=login.clientId,identityVerified=false,email='';
 if(login.expiresAt<=Date.now())throw new Error('登录尝试已超时');
 if(login.method==='authorization-code'){
  const cb=new URL(callbackUrl),expected=new URL(login.redirectUri);if(cb.origin!==expected.origin||cb.pathname!==expected.pathname||cb.searchParams.get('state')!==login.state)throw new Error('登录回调地址或 state 不匹配');if(cb.searchParams.has('error'))throw new Error('用户未授权本次登录');
  const issued=cb.searchParams.get('client_id');if(clientId==='dynamic_agent_client'){if(!issued||issued==='dynamic_agent_client')throw new Error('缺少签发的客户端 ID');clientId=issued;}else if(issued&&issued!==clientId)throw new Error('回调客户端与选中账号不匹配');
  const code=cb.searchParams.get('code');if(!code)throw new Error('登录回调缺少 code');raw=await json(await post(CODEX_ENDPOINTS.planToken,{grant_type:'authorization_code',client_id:clientId,code,code_verifier:login.verifier,redirect_uri:login.redirectUri,resource:'https://api.openai.com/v1'},{signal,fetchImpl},true),'登录兑换失败');
  const claims=await verifyIdentity(raw.id_token,clientId,login.nonce,fetchImpl,signal);identityVerified=true;email=claims.email||'';
 }else{
  const until=Math.min(login.expiresAt,Date.now()+maxWaitMs);let interval=login.interval*1000,code;
  while(Date.now()<until){check(signal);const r=await post(CODEX_ENDPOINTS.poll,{device_auth_id:login.device_auth_id,user_code:login.user_code},{signal,fetchImpl});if(r.ok){code=await json(r,'设备码响应无效');break;}let body={};try{body=await r.json();}catch{}const error=typeof body.error==='string'?body.error:body.error?.code;if(error==='slow_down')interval+=5000;else if(![403,404].includes(r.status)&&error!=='deviceauth_authorization_pending')throw failure('设备码验证失败',r.status);await waitImpl(Math.min(interval,Math.max(0,until-Date.now())),signal);}
  if(!code?.authorization_code||!code.code_verifier)throw new Error('设备码已超时或兑换字段不完整');
  raw=await json(await post(login.flow==='chatgpt-plan'?CODEX_ENDPOINTS.planToken:CODEX_ENDPOINTS.token,{grant_type:'authorization_code',client_id:clientId,code:code.authorization_code,code_verifier:code.code_verifier,redirect_uri:'https://auth.openai.com/deviceauth/callback',...(login.flow==='chatgpt-plan'?{resource:'https://api.openai.com/v1'}:{})},{signal,fetchImpl},true),'设备码令牌兑换失败');
  // A custom registered device client is not assumed to have SIWC identity verification.
  if(login.flow==='chatgpt-plan')throw new Error('注册客户端请使用经过 ID 签名验证的 authorization-code 流程');
 }
 check(signal);completedLogins.add(login);return registerCodexAccount(accountId,raw,{clientId,flow:login.flow,label,email,identityVerified});
}
function headers(a,token,{sessionId}={}){const h={'authorization':'Bearer '+token,'content-type':'application/json','accept':'text/event-stream','originator':'iphone_automation_harness'};if(a.flow==='codex'){h['chatgpt-account-id']=a.accountId;h['OpenAI-Beta']='responses=experimental';}if(sessionId)h['session-id']=sessionId;return h;}
export async function discoverCodexModels({accountId=activeId,signal,fetchImpl=fetch,clientVersion='0.1.0'}={}){
 const a=accounts.get(accountId);if(!a)throw new Error('请先选择已登录的订阅账号');const token=await accessToken(accountId,{signal,fetchImpl});const url=new URL(a.flow==='codex'?CODEX_ENDPOINTS.models:CODEX_ENDPOINTS.planModels);if(a.flow==='codex')url.searchParams.set('client_version',clientVersion);
 const response=await request(url,{headers:headers(a,token),signal,fetchImpl});const data=await json(response,'订阅模型目录不可用');const items=data.models||data.data;if(!Array.isArray(items))throw new Error('模型目录格式无效');
 return items.map(m=>({id:m.slug||m.id,name:m.display_name||m.name||m.slug||m.id,description:m.description||'',catalogOnly:true,...modelContextMetadata(m)})).filter(m=>typeof m.id==='string'&&m.id);
}
function replayState(message,scope){
 const state=message.providerState;
 if(message.role!=='assistant'||state?.kind!=='codex-responses/1'||state.origin!==scope.origin||state.accountId!==scope.accountId||state.backendAccountId!==scope.backendAccountId||state.clientId!==scope.clientId||state.model!==scope.model||state.flow!==scope.flow||!Array.isArray(state.items)||!state.items.length)return null;
 if(state.items.length>CODEX_LIMITS.outputItems||JSON.stringify(state.items).length>CODEX_LIMITS.stateChars)throw new Error('订阅协议状态超过容量限制');
 if(state.items.some(i=>!i||!['reasoning','message','function_call'].includes(i.type)||(i.type==='message'&&(i.role!=='assistant'||!Array.isArray(i.content)||i.content.some(c=>c.type!=='output_text'||typeof c.text!=='string')))||(i.type==='function_call'&&(!i.call_id||typeof i.name!=='string'||typeof i.arguments!=='string'))))return null;
 // A transformed or edited message must not silently replay an older full
 // answer/tool call from opaque state. Compacting callers can drop this state.
 const text=state.items.filter(i=>i.type==='message').flatMap(i=>i.content).map(c=>c.text).join('');
 const calls=state.items.filter(i=>i.type==='function_call');
 if(text!==String(message.text||'')||calls.length!==(message.toolCalls?.length||0))return null;
 try{for(let i=0;i<calls.length;i++){const expected=message.toolCalls[i],actual=calls[i];if(actual.call_id!==expected.id||actual.name!==expected.name||JSON.stringify(JSON.parse(actual.arguments))!==JSON.stringify(expected.arguments))return null;}}catch{return null;}
 return copy(state.items);
}
function toInput(messages,scope){
 const out=[],images=[];
 for(const m of messages){
  if(m.role==='system')continue;
  if(m.role==='tool'){if(!m.toolCallId)throw new Error('工具结果缺少调用 ID');out.push({type:'function_call_output',call_id:m.toolCallId,output:m.text||' '});for(const image of m.images||[])images.push({type:'input_image',image_url:image,detail:'auto'});continue;}
  if(images.length)out.push({role:'user',content:images.splice(0)});
  const replay=replayState(m,scope);if(replay){out.push(...replay);continue;}
  const content=[];if(m.text)content.push({type:m.role==='assistant'?'output_text':'input_text',text:m.text});for(const image of m.images||[])content.push({type:'input_image',image_url:image,detail:'auto'});if(content.length)out.push({role:m.role,content});for(const c of m.toolCalls||[])out.push({type:'function_call',call_id:c.id,name:c.name,arguments:JSON.stringify(c.arguments)});
 }
 if(images.length)out.push({role:'user',content:images});return out;
}
async function* events(body,signal){const reader=body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let pending='',ended=false;try{while(true){check(signal);const {done,value}=await awaitWithSignal(reader.read(),signal);pending+=done?decoder.decode():decoder.decode(value,{stream:true});if(pending.length>CODEX_LIMITS.eventChars)throw new Error('订阅响应事件超过容量限制');let match;while((match=/\r?\n\r?\n/.exec(pending))){const block=pending.slice(0,match.index);pending=pending.slice(match.index+match[0].length);const data=block.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).replace(/^ /,'')).join('\n');if(data&&data!=='[DONE]'){try{yield JSON.parse(data);}catch(e){if(e instanceof SyntaxError)throw new Error('订阅响应事件格式无效');throw e;}}}if(done){ended=true;if(pending.trim()&&!pending.trim().startsWith(':'))throw new Error('订阅响应流被截断');return;}}}finally{if(!ended)try{await reader.cancel();}catch{}reader.releaseLock();}}
export async function callCodexModel({provider,messages,tools=[],signal,onDelta=()=>{},fetchImpl=fetch,sessionId}={}){
 const id=provider?.accountId||provider?.codexAccountId||activeId,a=accounts.get(id);if(!a)throw new Error('请选择已登录的订阅账号');if(!provider?.model)throw new Error('请选择订阅模型');
 const controller=new AbortController(),abort=()=>controller.abort(signal?.reason);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();const timer=setTimeout(()=>controller.abort(new Error('订阅模型请求超时')),provider.timeoutMs||180000);const active=controller.signal;
 try{
  const token=await accessToken(id,{signal:active,fetchImpl});check(active);if(accounts.get(id)!==a)throw new Error('请求前账号已更换');
  const endpoint=a.flow==='codex'?CODEX_ENDPOINTS.responses:CODEX_ENDPOINTS.planResponses;
  const stateScope={origin:new URL(endpoint).origin,accountId:id,backendAccountId:a.accountId,clientId:a.clientId,model:provider.model,flow:a.flow};
  const payload={model:provider.model,store:false,stream:true,include:['reasoning.encrypted_content'],instructions:messages.filter(m=>m.role==='system').map(m=>m.text).join('\n\n')||'You are a helpful assistant.',input:toInput(messages,stateScope),tools:tools.map(t=>({type:'function',name:t.name,description:t.description,parameters:t.schema,strict:false})),tool_choice:tools.length?'auto':'none',parallel_tool_calls:true};
  if(provider.reasoningEffort)payload.reasoning={effort:provider.reasoningEffort,summary:'auto'};
  const response=await request(endpoint,{method:'POST',headers:headers(a,token,{sessionId:sessionId||provider.sessionId}),body:JSON.stringify(payload),signal:active,fetchImpl});
  if(!response.ok){const error=await readProviderFailure(response,{signal:active});if(error.code==='CONTEXT_WINDOW_EXCEEDED')throw error;throw failure(response.status===401?'订阅登录失效，请刷新或重新登录':response.status===429?'订阅额度或速率达到限制':'订阅模型请求失败',response.status);}if(!response.body)throw new Error('订阅后端未返回响应流');
  let text='',terminal=null;const calls=new Map();const emit=value=>{try{Promise.resolve(onDelta(value)).catch(()=>{});}catch{}};
  function saveCall(key,value){if(typeof value.arguments!=='string'||value.arguments.length>CODEX_LIMITS.toolArgumentChars)throw new Error('工具参数超过容量限制');if(!calls.has(key)&&calls.size>=CODEX_LIMITS.toolCalls)throw new Error('工具调用超过数量限制');calls.set(key,value);}
  for await(const e of events(response.body,active)){
   check(active);if(e.type==='error'||e.type==='response.failed'||e.type==='response.incomplete'||e.type==='response.cancelled')throw contextOverflowError(e)||new Error('订阅响应未成功完成；未执行操作');
   if(e.type==='response.output_text.delta'){if(typeof e.delta!=='string'||text.length+e.delta.length>CODEX_LIMITS.textChars)throw new Error('订阅响应文本超过容量限制');text+=e.delta;emit(e.delta);}
   if(e.type==='response.output_item.added'&&e.item?.type==='function_call')saveCall(e.item.id||e.output_index,{...e.item,arguments:e.item.arguments||''});
   if(e.type==='response.function_call_arguments.delta'){const key=e.item_id??e.output_index,c=calls.get(key);if(!c)throw new Error('工具参数缺少起始事件');if(typeof e.delta!=='string'||c.arguments.length+e.delta.length>CODEX_LIMITS.toolArgumentChars)throw new Error('工具参数超过容量限制');c.arguments+=e.delta;}
   if(e.type==='response.function_call_arguments.done'){const c=calls.get(e.item_id??e.output_index);if(!c)throw new Error('工具参数缺少起始事件');if(typeof e.arguments!=='string'||e.arguments.length>CODEX_LIMITS.toolArgumentChars)throw new Error('工具参数超过容量限制');c.arguments=e.arguments;}
   if(e.type==='response.output_item.done'&&e.item?.type==='function_call')saveCall(e.item.id||e.output_index,e.item);
   if(e.type==='response.completed'||e.type==='response.done'){terminal=e.response;if(!terminal||terminal.status!=='completed')throw new Error('订阅响应结束状态非 completed');break;}
  }
  check(active);if(!terminal)throw new Error('订阅响应缺少 completed 事件；未执行操作');
  if(terminal.output!==undefined&&(!Array.isArray(terminal.output)||terminal.output.length>CODEX_LIMITS.outputItems||JSON.stringify(terminal.output).length>CODEX_LIMITS.stateChars))throw new Error('订阅协议状态超过容量限制');
  if((terminal.output||[]).some(i=>(i.content||[]).some(c=>c.type==='refusal')))throw new Error('订阅响应被拒绝；未执行操作');
  const finalText=(terminal.output||[]).filter(i=>i.type==='message').flatMap(i=>i.content||[]).filter(c=>c.type==='output_text').map(c=>c.text||'').join('');if(finalText.length>CODEX_LIMITS.textChars)throw new Error('订阅响应文本超过容量限制');if(finalText){if(finalText.startsWith(text)&&finalText.length>text.length)emit(finalText.slice(text.length));text=finalText;}
  const source=Array.isArray(terminal.output)?terminal.output.filter(i=>i.type==='function_call'):[...calls.values()],ids=new Set();if(calls.size&&!source.length)throw new Error('工具调用结束状态缺失');if(source.length>CODEX_LIMITS.toolCalls)throw new Error('工具调用超过数量限制');const toolCalls=source.map(c=>{if(!c.call_id||!c.name||ids.has(c.call_id))throw new Error('工具调用身份无效或重复');ids.add(c.call_id);if(typeof c.arguments!=='string'||c.arguments.length>CODEX_LIMITS.toolArgumentChars)throw new Error('工具参数超过容量限制');let args;try{args=JSON.parse(c.arguments||'{}');}catch{throw new Error('工具参数 JSON 不完整');}if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('工具参数必须是对象');return {id:c.call_id,name:c.name,arguments:args};});
  if(!text&&!toolCalls.length)throw new Error('订阅响应为空；未执行操作');
  const items=copy((terminal.output||[]).filter(i=>['reasoning','message','function_call'].includes(i.type)));
  const providerState={kind:'codex-responses/1',...stateScope,items};
  return {text,toolCalls,finish:toolCalls.length?'tool_calls':'stop',usage:terminal.usage||null,responseId:terminal.id||null,providerState};
 }catch(e){check(active);if(e.status||e.code==='CONTEXT_WINDOW_EXCEEDED')throw e;throw new Error(['订阅响应','订阅协议','工具','请选择','请求前','订阅账号','登录'].some(p=>e.message?.startsWith(p))?e.message:'订阅通信失败；请检查登录、CORS 与网络');}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
