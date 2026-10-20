import {t as translate,localizeError} from '../i18n.js';
const HOST_KEY='iah-chatgpt-host',PENDING_KEY='iah-chatgpt-sign-in';
const uuid=/^urn:uuid:[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const opaque=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{32,128}$/.test(value);
const fail=code=>Object.assign(new Error(code),{code});
function storage(kind){try{return globalThis[kind];}catch{return null;}}
export function codexHostId(){
 const local=storage('localStorage');try{const old=local?.getItem(HOST_KEY);if(uuid.test(old||''))return old;const id='urn:uuid:'+crypto.randomUUID();local?.setItem(HOST_KEY,id);if(local?.getItem(HOST_KEY)!==id)throw 0;return id;}catch{throw fail('SIWC_STORAGE_UNAVAILABLE');}
}
function cleanPending(value,now=Date.now()){
 const input=value?.login,profile=value?.provider;if(!input||!profile||!Number.isFinite(value.createdAt)||value.createdAt>now||now-value.createdAt>=900000||!Number.isFinite(input.expiresAt)||input.expiresAt<=now||input.expiresAt>value.createdAt+900000)return null;
 if(input.method!=='authorization-code'||input.flow!=='chatgpt-plan'||!uuid.test(input.hostId||'')||!opaque(input.state)||!opaque(input.nonce)||!opaque(input.verifier)||typeof input.clientId!=='string'||!/^[A-Za-z0-9_.:-]{1,200}$/.test(input.clientId)||typeof profile.id!=='string'||!/^[A-Za-z0-9._:-]{1,80}$/.test(profile.id))return null;
 let redirect,url;try{redirect=new URL(input.redirectUri);url=new URL(input.authorizationUrl);}catch{return null;}
 if(redirect.protocol!=='http:'||redirect.hostname!=='127.0.0.1'||redirect.pathname!=='/auth/callback'||redirect.username||redirect.password||redirect.search||redirect.hash||url.origin!=='https://auth.openai.com'||url.pathname!=='/api/accounts/authorize'||url.username||url.password||url.hash)return null;
 if(url.searchParams.get('state')!==input.state||url.searchParams.get('nonce')!==input.nonce||url.searchParams.get('client_id')!==input.clientId||url.searchParams.get('redirect_uri')!==input.redirectUri||url.searchParams.get('ext_agent_host_id')!==input.hostId||!opaque(url.searchParams.get('code_challenge')))return null;
 const safeURL=new URL(url.origin+url.pathname);for(const key of ['client_id','ext_agent_host_id','response_type','redirect_uri','scope','resource','state','nonce','code_challenge_method','code_challenge','agent_name_hint'])if(url.searchParams.has(key))safeURL.searchParams.set(key,url.searchParams.get(key));
 return {createdAt:value.createdAt,provider:{id:profile.id,name:String(profile.name||'ChatGPT').slice(0,80),protocol:'codex',accountId:profile.id,model:String(profile.model||'').slice(0,200),models:[],stream:true},login:{method:'authorization-code',flow:'chatgpt-plan',clientId:input.clientId,hostId:input.hostId,redirectUri:input.redirectUri,verifier:input.verifier,state:input.state,nonce:input.nonce,authorizationUrl:safeURL.href,expiresAt:input.expiresAt}};
}
export function loadPendingCodexLogin(){
 const session=storage('sessionStorage');try{const raw=session?.getItem(PENDING_KEY);if(!raw)return null;if(raw.length>16000)throw 0;const value=cleanPending(JSON.parse(raw));if(!value)throw 0;return value;}catch{try{session?.removeItem(PENDING_KEY);}catch{}return null;}
}
export function savePendingCodexLogin(login,provider){
 const pending=cleanPending({createdAt:Date.now(),login,provider});if(!pending)throw fail('SIWC_ATTEMPT_INVALID');const session=storage('sessionStorage');try{const text=JSON.stringify(pending);session?.setItem(PENDING_KEY,text);if(session?.getItem(PENDING_KEY)!==text)throw 0;}catch{throw fail('SIWC_STORAGE_UNAVAILABLE');}return pending;
}
export function clearPendingCodexLogin(providerId,state){const pending=loadPendingCodexLogin();if(providerId&&pending&&(pending.provider.id!==providerId||state&&pending.login.state!==state))return;try{storage('sessionStorage')?.removeItem(PENDING_KEY);}catch{}}
export function prepareCodexSignInProfile({provider,account,saved,label,newId}){
 if(account&&account.id!==provider.id)throw fail('SIWC_ATTEMPT_INVALID');
 if(account&&provider.clientId&&provider.clientId!==account.clientId)throw fail('SIWC_ATTEMPT_INVALID');
 const plan=(account?.flow||provider.flow)==='chatgpt-plan',clientId=plan?(account?.clientId||provider.clientId):!saved?provider.registrationClientId:null;
 const independent=!provider.id||saved&&(!plan||!clientId);
 const profile=independent?{id:newId(),name:label||provider.name||'ChatGPT',protocol:'codex',models:[],model:'',stream:true}:{...provider,name:label||provider.name||'ChatGPT'};profile.accountId=profile.id;
 const tokens=!independent&&account?.flow==='chatgpt-plan'&&account.identityVerified?account.exportTokens():null;
 return {provider:profile,independent,options:{agentName:'iPhone Agent Harness',...(!independent&&clientId?{clientId}:{}),...(tokens?.id_token?{idTokenHint:tokens.id_token,...(account.email?{loginHint:account.email}:{})}:{})}};
}

// The callback URL is read only by the completion click, held in memory for the
// exchange, and cleared immediately. It is never stored or put in page history.
export function mountCodexLogin({root,getProvider,prepareProvider,start,validate,complete,onSuccess,onRegistration=()=>{},isActive=()=>true,onController=()=>{},t=translate,status=()=>{}}){
 const node=id=>root.querySelector('#'+id),begin=node('start-codex-login'),cancel=node('cancel-codex-login'),finish=node('complete-codex-login'),verification=node('codex-verification'),callback=node('codex-callback'),callbackField=node('codex-callback-field');let login=null,controller=null,generation=0,working=false;
 const tell=(key,params)=>status(t('siwc.'+key,params));
 const explain=error=>error?.code==='SIWC_STORAGE_UNAVAILABLE'?t('siwc.storageUnavailable'):error?.code==='SIWC_ATTEMPT_INVALID'?t('siwc.invalidAttempt'):localizeError(error);
 function render(){
  begin.textContent=t('siwc.start');cancel.textContent=t('siwc.cancel');finish.textContent=t('siwc.finish');node('codex-callback-label').textContent=t('siwc.callbackLabel');node('codex-callback-help').textContent=t('siwc.callbackHelp');
  cancel.hidden=!login&&!working;finish.hidden=!login;finish.disabled=working||!callback.value.trim();callbackField.hidden=!login;begin.disabled=working;
  verification.replaceChildren();if(login){const link=document.createElement('a');link.href=login.authorizationUrl;link.target='_blank';link.rel='noopener noreferrer';link.textContent=t('siwc.open');link.className='secondary-button';verification.append(link);const steps=document.createElement('ol');for(const key of ['stepOne','stepTwo','stepThree']){const item=document.createElement('li');item.textContent=t('siwc.'+key);steps.append(item);}verification.append(steps);}
 }
 function cancelAttempt({quiet=false}={}){generation++;controller?.abort();if(login)clearPendingCodexLogin(getProvider().id,login.state);login=null;working=false;callback.value='';render();if(!quiet)tell('cancelled');}
 begin.onclick=async()=>{
  if(working||!isActive())return;cancelAttempt({quiet:true});const current=++generation;working=true;controller=new AbortController();onController(controller);render();tell('preparing');
  try{const prepared=await prepareProvider();if(current!==generation||controller.signal.aborted||!isActive())return;const issued=await start({method:'authorization-code',hostId:codexHostId(),...prepared.options,signal:controller.signal});if(current!==generation||controller.signal.aborted||!isActive())return;savePendingCodexLogin(issued,prepared.provider);login=issued;working=false;render();tell('ready');}
  catch(error){if(current===generation&&isActive()&&!controller.signal.aborted){working=false;render();status(t('siwc.failed',{detail:explain(error)}));}}
 };
 callback.oninput=()=>{finish.disabled=working||!callback.value.trim();};
 finish.onclick=async()=>{
  if(working||!login||!callback.value.trim()||!isActive())return;const attempt=login,url=callback.value.trim(),provider=getProvider(),current=++generation;
  try{if(attempt.expiresAt<=Date.now()||url.length>32768)throw fail('SIWC_ATTEMPT_INVALID');const registration=validate(attempt,url);onRegistration(registration.clientId);}catch(error){status(t('siwc.failed',{detail:explain(error)}));return;}
  // Consume before any asynchronous exchange. Refresh or a second click cannot
  // recover an already submitted authorization code from local pending state.
  clearPendingCodexLogin(provider.id,attempt.state);login=null;callback.value='';working=true;render();tell('checking');
  try{const result=await complete(attempt,{accountId:provider.id,label:provider.name,callbackUrl:url,signal:controller.signal});if(current!==generation||controller.signal.aborted||!isActive())return;if(result?.flow!=='chatgpt-plan')throw fail('SIWC_ATTEMPT_INVALID');working=false;render();tell('success');await onSuccess(result,controller.signal);}
  catch(error){if(current===generation&&isActive()&&!controller.signal.aborted){working=false;render();status(t('siwc.failedRestart',{detail:explain(error)}));}}
 };
 cancel.onclick=()=>cancelAttempt();
 const pending=loadPendingCodexLogin();if(pending?.provider.id===getProvider().id){login=pending.login;controller=new AbortController();onController(controller);tell('restored');}
 render();return {cancel:cancelAttempt,dispose(){generation++;controller?.abort();callback.value='';},pending:()=>!!login};
}
