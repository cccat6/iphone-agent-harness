import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {startCodexLogin,completeCodexLogin,validateCodexCallback,loadOpenAIPublicKeys,CODEX_ENDPOINTS,clearCodexAccounts,getCodexAccount,listCodexAccounts,registerCodexAccount,removeCodexAccount,setCodexTokenObserver,discoverCodexModels} from '../../apps/web/core/codex.js';
import {SITE_CONFIG} from '../../apps/web/site-config.js';
const enc=new TextEncoder(),b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const keyPair=crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
beforeEach(()=>clearCodexAccounts());
async function signed(login,{claims={},header={}}={}){
 const keys=await keyPair,jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);jwk.kid='fixture-key';
 const head=b64({alg:'RS256',kid:'fixture-key',...header}),body=b64({iss:CODEX_ENDPOINTS.issuer,sub:'subject-a',aud:'oaiapp_fixture',nonce:login.nonce,exp:Math.floor(Date.now()/1000)+3600,email:'person@example.invalid',...claims});
 const signature=Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,enc.encode(head+'.'+body))).toString('base64url');
 return {idToken:head+'.'+body+'.'+signature,jwk};
}
const begin=options=>startCodexLogin({method:'authorization-code',hostId:'fixture-host-id',...options});
function callback(login,extra={}){return login.redirectUri+'?'+new URLSearchParams({code:'fixture-authorization-code',state:login.state,client_id:'oaiapp_fixture',...extra});}
async function finish(login,{accountId='plan',claims,scope='openid chatgpt.tokens.use.direct',...options}={}){
 const {idToken,jwk}=await signed(login,{claims});
 return completeCodexLogin(login,{accountId,callbackUrl:callback(login),fetchImpl:async(url,request)=>{
  assert.equal(url,CODEX_ENDPOINTS.planToken);assert.equal(request.credentials,'omit');assert.equal(request.referrerPolicy,'no-referrer');
  const form=new URLSearchParams(request.body);assert.equal(form.get('code_verifier'),login.verifier);assert.equal(form.get('redirect_uri'),login.redirectUri);assert.equal(form.get('client_id'),'oaiapp_fixture');assert.equal(form.get('resource'),'https://api.openai.com/v1');
  return Response.json({access_token:'fixture-plan-access',refresh_token:'fixture-plan-refresh',id_token:idToken,scope,expires_in:3600});
 },loadPublicKeys:async({signal})=>{assert.equal(signal,options.signal);return {keys:[jwk]};},...options});
}
test('returning SIWC authorization preserves host/client registration and optional account hints',async()=>{
 const login=await begin({clientId:'oaiapp_fixture',idTokenHint:'fixture.retained.id-token',loginHint:'person@example.invalid'}),url=new URL(login.authorizationUrl);
 assert.equal(url.searchParams.get('client_id'),'oaiapp_fixture');assert.equal(url.searchParams.get('ext_agent_host_id'),'fixture-host-id');assert.equal(url.searchParams.get('id_token_hint'),'fixture.retained.id-token');assert.equal(url.searchParams.get('login_hint'),'person@example.invalid');assert.equal(url.searchParams.has('agent_name_hint'),false);
 const initial=new URL((await begin({idTokenHint:'do-not-send',loginHint:'wrong@example.invalid'})).authorizationUrl);assert.equal(initial.searchParams.has('id_token_hint'),false);assert.equal(initial.searchParams.has('login_hint'),false);
 for(const redirectUri of ['https://127.0.0.1:1455/auth/callback','http://localhost:1455/auth/callback','http://127.0.0.1:1455/callback','http://user@127.0.0.1:1455/auth/callback','http://127.0.0.1:1455/auth/callback?extra=1','http://127.0.0.1:1455/auth/callback#part'])await assert.rejects(begin({redirectUri}));
});
test('manual callbacks reject origin/path/port mismatch and duplicate fields before exchange',async()=>{
 const login=await begin();let calls=0;const fetchImpl=async()=>{calls++;throw Error('must not fetch');};
 const valid=callback(login),invalid=[valid.replace(':1455',':1456'),valid.replace('http:','https:'),valid.replace('127.0.0.1','localhost'),valid.replace('/auth/callback','/callback'),valid.replace('//127','//user@127'),valid+'#fragment',valid.replace(login.state,'wrong-state'),valid+'&code=second',valid+'&state='+login.state,valid+'&%73tate='+login.state,valid+'&client_id=oaiapp_fixture',valid+'&error=access_denied',login.redirectUri+'?state='+login.state+'&error=access_denied&error=access_denied'];
 for(const callbackUrl of invalid)await assert.rejects(completeCodexLogin(login,{callbackUrl,fetchImpl}));
 assert.equal(calls,0);assert.equal(listCodexAccounts().length,0);assert.equal((await finish(login)).clientId,'oaiapp_fixture');
});
test('OAuth denial stops before token or public-key requests',async()=>{
 const login=await begin();let calls=0;await assert.rejects(completeCodexLogin(login,{callbackUrl:login.redirectUri+'?'+new URLSearchParams({state:login.state,error:'access_denied'}),fetchImpl:async()=>{calls++;},loadPublicKeys:async()=>{calls++;}}),/未授权/);assert.equal(calls,0);
});
test('one attempt exchanges once even when a copied pending object races with the original',async()=>{
 const login=await begin(),{idToken,jwk}=await signed(login);let calls=0,release,entered;const gate=new Promise(resolve=>entered=resolve),pending=new Promise(resolve=>release=resolve);
 const fetchImpl=async()=>{calls++;entered();await pending;return Response.json({access_token:'fixture-access',id_token:idToken,scope:'chatgpt.tokens.use.direct'});};
 const first=completeCodexLogin(login,{accountId:'plan',callbackUrl:callback(login),fetchImpl,loadPublicKeys:async()=>({keys:[jwk]})});await gate;
 await assert.rejects(completeCodexLogin(structuredClone(login),{callbackUrl:callback(login),fetchImpl}),/已使用/);assert.equal(calls,1);release();await first;
 await assert.rejects(completeCodexLogin({...login,clientId:'oaiapp_fixture'},{callbackUrl:callback(login),fetchImpl}),/已使用/);assert.equal(calls,1);
});
test('a dispatched exchange is consumed even after transport failure, with no credential replacement',async()=>{
 const login=await begin();let calls=0;const fetchImpl=async()=>{calls++;throw Error('synthetic network loss');};
 await assert.rejects(completeCodexLogin(login,{callbackUrl:callback(login),fetchImpl}));await assert.rejects(completeCodexLogin(structuredClone(login),{callbackUrl:callback(login),fetchImpl}),/已使用/);assert.equal(calls,1);assert.equal(listCodexAccounts().length,0);
});
test('returning callback may omit issued client ID, but cannot replace it',async()=>{
 const login=await begin({clientId:'oaiapp_fixture'}),url=new URL(callback(login));url.searchParams.delete('client_id');assert.equal((await finish(login,{callbackUrl:url.href})).clientId,'oaiapp_fixture');
 const other=await begin({clientId:'oaiapp_fixture'});let calls=0;await assert.rejects(completeCodexLogin(other,{callbackUrl:callback(other,{client_id:'oaiapp_other'}),fetchImpl:async()=>{calls++;}}),/不匹配/);assert.equal(calls,0);
});
test('RS256 validation rejects wrong issuer, audience, nonce, expired token and mismatched authorized party',async()=>{
 for(const claims of [{iss:'https://issuer.invalid'},{aud:'other-client'},{nonce:'other-nonce'},{exp:0},{sub:''},{aud:['oaiapp_fixture','other-client']},{azp:'other-client'},{nbf:Math.floor(Date.now()/1000)+3600}]){const login=await begin();await assert.rejects(finish(login,{claims}),/签名或账号验证失败/);assert.equal(listCodexAccounts().length,0);}
 const valid=await begin();assert.equal((await finish(valid,{claims:{aud:['oaiapp_fixture','another-audience'],azp:'oaiapp_fixture'}})).identityVerified,true);
});
test('signature mismatch, missing key and non-public keys never register an account',async()=>{
 for(const kind of ['signature','missing-key','private-key','wrong-alg']){
  const login=await begin(),{idToken,jwk}=await signed(login);const fields=idToken.split('.');if(kind==='signature'){const bytes=Buffer.from(fields[2],'base64url');bytes[0]^=1;fields[2]=bytes.toString('base64url');}
  await assert.rejects(completeCodexLogin(login,{callbackUrl:callback(login),fetchImpl:async()=>Response.json({access_token:'fixture-access',id_token:fields.join('.'),scope:'chatgpt.tokens.use.direct'}),loadPublicKeys:async()=>({keys:kind==='missing-key'?[]:[{...jwk,...(kind==='private-key'?{d:'invalid-private-component'}:{}),...(kind==='wrong-alg'?{alg:'RS512'}:{})}]})}),/签名或账号验证失败/);
  assert.equal(listCodexAccounts().length,0);
 }
});
test('reauthorization preserves a saved registration when the validated identity or plan scope differs',async()=>{
 await finish(await begin());const saved=getCodexAccount('plan').exportTokens();
 await assert.rejects(finish(await begin({clientId:'oaiapp_fixture'}),{claims:{sub:'other-subject'}}),/身份.*不匹配/);assert.deepEqual(getCodexAccount('plan').exportTokens(),saved);
 await assert.rejects(finish(await begin({clientId:'oaiapp_fixture'}),{scope:'openid profile email'}),/授权/);assert.deepEqual(getCodexAccount('plan').exportTokens(),saved);
});
test('default public-key fetch is separate from token exchange and sends no login data',async t=>{
 const login=await begin(),{idToken,jwk}=await signed(login),publicCalls=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{publicCalls.push({url,options});return Response.json({keys:[jwk]});});
 const tokens=[];await completeCodexLogin(login,{accountId:'plan',callbackUrl:callback(login),fetchImpl:async(url,options)=>{tokens.push(url);return Response.json({access_token:'fixture-access',refresh_token:'fixture-refresh',id_token:idToken,scope:'chatgpt.tokens.use.direct'});}});
 assert.deepEqual(tokens,[CODEX_ENDPOINTS.planToken]);assert.equal(publicCalls.length,1);const {url,options}=publicCalls[0];assert.equal(url,SITE_CONFIG.openaiPublicKeysEndpoint||'https://igent.cc/api/openai/jwks');assert.equal(options.method,'GET');assert.deepEqual(options.headers,{accept:'application/json'});assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');assert.equal(options.redirect,'error');assert.equal(options.body,undefined);assert.equal(url.includes(login.state),false);
});
test('public-key endpoint requires HTTPS without credentials, query or fragment',async()=>{
 let calls=0;for(const endpoint of ['http://igent.cc/api/openai/jwks','https://user:pass@igent.cc/api/openai/jwks','https://igent.cc/api/openai/jwks?token=fixture','https://igent.cc/api/openai/jwks#part'])await assert.rejects(loadOpenAIPublicKeys({endpoint,fetchImpl:async()=>{calls++;}}));assert.equal(calls,0);
 const {jwk}=await signed(await begin());assert.deepEqual(await loadOpenAIPublicKeys({endpoint:'https://self-host.example/api/openai/jwks',fetchImpl:async()=>Response.json({keys:[jwk]})}),{keys:[jwk]});
});

test('pure callback validation allows scope and future fields without consuming a valid attempt',async()=>{
 const login=await begin(),url=callback(login)+'&scope=openid&iss=https%3A%2F%2Fauth.openai.com&future=value&future=another';
 assert.deepEqual(validateCodexCallback(login,url),{clientId:'oaiapp_fixture'});assert.deepEqual(validateCodexCallback(login,url),{clientId:'oaiapp_fixture'});
 for(const invalid of [url+'#part',url+'\n',url+'&extra=%0A',url+'&code=again',url.replace(login.state,'wrong')])assert.throws(()=>validateCodexCallback(login,invalid));
 assert.equal((await finish(login,{callbackUrl:url})).identityVerified,true);
});

test('Safari scheme-less loopback callbacks validate and exchange with the original redirect URI',async()=>{
 for(const redirectUri of ['http://127.0.0.1:1455/auth/callback','http://127.0.0.1:54321/auth/callback','http://127.0.0.1/auth/callback']){
  const login=await begin({redirectUri}),url=callback(login).replace(/^http:\/\//,'');
  assert.deepEqual(validateCodexCallback(login,'  '+url+'  '),{clientId:'oaiapp_fixture'});
  assert.equal((await finish(login,{callbackUrl:url})).identityVerified,true);
  clearCodexAccounts();
 }
});
test('malformed pasted callbacks hide authorization text and remain correctable before exchange',async()=>{
 const login=await begin(),valid=callback(login),bare=valid.replace(/^http:\/\//,'');
 for(const url of ['not-a-url?code=fixture-private-code',bare.replace(':1455',':1456'),bare.replace('127.0.0.1','127.0.0.1.evil.invalid'),bare.replace('/auth/callback','/other'),bare+'&state=again',bare.replace(login.state,'wrong-state')]){
  let calls=0;
  assert.throws(()=>validateCodexCallback(login,url),error=>!error.message.includes('fixture-private-code')&&!error.message.includes('fixture-authorization-code')&&!error.message.includes(login.state));
  await assert.rejects(completeCodexLogin(login,{callbackUrl:url,fetchImpl:async()=>{calls++;}}));
  assert.equal(calls,0);
 }
 assert.equal((await finish(login,{callbackUrl:bare})).identityVerified,true);
});

async function expiredPlan(){await finish(await begin());const saved=getCodexAccount('plan').exportTokens();registerCodexAccount('plan',{...saved,expiresAt:0});return getCodexAccount('plan');}
test('plan refresh verifies a newly issued ID token without requiring the original authorization nonce',async()=>{
 const account=await expiredPlan(),{idToken,jwk}=await signed(await begin(),{claims:{nonce:undefined}}),events=[],off=setCodexTokenObserver(event=>events.push(event));
 try{
  const result=await account.accessToken({fetchImpl:async(url,options)=>{assert.equal(url,CODEX_ENDPOINTS.planToken);assert.equal(options.redirect,'error');return Response.json({access_token:'refreshed-access',refresh_token:'rotated-refresh',id_token:idToken,expires_in:3600});},loadPublicKeys:async()=>({keys:[jwk]})});
  assert.equal(result,'refreshed-access');assert.equal(account.exportTokens().id_token,idToken);assert.equal(account.exportTokens().refresh_token,'rotated-refresh');assert.deepEqual(events,[{id:'plan',event:'refreshed'}]);
 }finally{off();}
});
test('plan refresh without a new ID token retains the existing account hint and skips JWKS',async()=>{
 const account=await expiredPlan(),saved=account.exportTokens();let keys=0;
 assert.equal(await account.accessToken({fetchImpl:async()=>Response.json({access_token:'refreshed',expires_in:3600}),loadPublicKeys:async()=>{keys++;throw Error('not needed');}}),'refreshed');assert.equal(keys,0);assert.equal(account.exportTokens().id_token,saved.id_token);
});
test('invalid refreshed identity never replaces stored tokens or emits a persistence event',async()=>{
 for(const kind of ['issuer','audience','expired','subject','signature','empty']){
  const account=await expiredPlan(),saved=account.exportTokens(),claims={nonce:undefined,...({issuer:{iss:'https://wrong.invalid'},audience:{aud:'other-client'},expired:{exp:0},subject:{sub:'other-subject'}}[kind]||{})};
  let {idToken,jwk}=await signed(await begin(),{claims});if(kind==='signature'){const parts=idToken.split('.'),sig=Buffer.from(parts[2],'base64url');sig[0]^=1;parts[2]=sig.toString('base64url');idToken=parts.join('.');}if(kind==='empty')idToken='';
  const events=[],off=setCodexTokenObserver(event=>events.push(event));try{await assert.rejects(account.accessToken({fetchImpl:async()=>Response.json({access_token:'must-not-save',refresh_token:'must-not-save-refresh',id_token:idToken,expires_in:3600}),loadPublicKeys:async()=>({keys:[jwk]})}));assert.deepEqual(account.exportTokens(),saved,kind);assert.deepEqual(events,[],kind);}finally{off();}
 }
});
test('removing an account during refreshed ID validation prevents late persistence',async()=>{
 const account=await expiredPlan(),{idToken,jwk}=await signed(await begin(),{claims:{nonce:undefined}}),events=[];let entered,release;const ready=new Promise(resolve=>entered=resolve),keys=new Promise(resolve=>release=resolve),off=setCodexTokenObserver(event=>events.push(event));
 try{const pending=account.accessToken({fetchImpl:async()=>Response.json({access_token:'late-access',id_token:idToken,expires_in:3600}),loadPublicKeys:async()=>{entered();return keys;}});await ready;removeCodexAccount('plan');release({keys:[jwk]});await assert.rejects(pending);assert.equal(getCodexAccount('plan'),null);assert.deepEqual(events,[]);}finally{off();}
});
test('authorization-code exchange has a 30-second network deadline and consumes a timed-out code',async t=>{
 await finish(await begin());const saved=getCodexAccount('plan').exportTokens(),login=await begin({clientId:'oaiapp_fixture'}),deadline=new AbortController();let entered,release,calls=0;const ready=new Promise(resolve=>entered=resolve);
 t.mock.method(AbortSignal,'timeout',ms=>{assert.equal(ms,30000);return deadline.signal;});
 const pending=completeCodexLogin(login,{accountId:'plan',callbackUrl:callback(login),fetchImpl:async(url,options)=>{calls++;assert.equal(options.redirect,'error');entered();return new Promise(resolve=>release=resolve);},loadPublicKeys:async()=>{throw Error('must not verify');}});
 await ready;deadline.abort(new DOMException('Exchange deadline','TimeoutError'));await assert.rejects(pending,{name:'TimeoutError',code:'SUBSCRIPTION_TIMEOUT'});release(Response.json({access_token:'late-response'}));await new Promise(resolve=>setTimeout(resolve,0));
 await assert.rejects(completeCodexLogin(structuredClone(login),{accountId:'plan',callbackUrl:callback(login),fetchImpl:async()=>{calls++;}}),/已使用/);assert.equal(calls,1);assert.deepEqual(getCodexAccount('plan').exportTokens(),saved);
});
test('exchange deadline also interrupts stalled JSON and caller cancellation retains its reason',async t=>{
 for(const cancelledByCaller of [false,true]){
  const login=await begin(),deadline=new AbortController(),caller=new AbortController();let began,cancels=0;const ready=new Promise(resolve=>began=resolve),body=new ReadableStream({pull(){if(body.locked)began();},cancel(){cancels++;}});
  const timeout=t.mock.method(AbortSignal,'timeout',ms=>{assert.equal(ms,30000);return deadline.signal;});
  const pending=completeCodexLogin(login,{callbackUrl:callback(login),signal:caller.signal,fetchImpl:async()=>new Response(body)});await ready;
  const reason=new DOMException(cancelledByCaller?'Cancelled by caller':'Exchange deadline',cancelledByCaller?'AbortError':'TimeoutError');(cancelledByCaller?caller:deadline).abort(reason);
  await assert.rejects(pending,error=>cancelledByCaller?error===reason:error.code==='SUBSCRIPTION_TIMEOUT'&&error.name==='TimeoutError');assert.equal(cancels,1);assert.equal(body.locked,false);assert.equal(listCodexAccounts().length,0);timeout.mock.restore();
 }
});
test('model discovery has its own 20-second deadline for network and JSON waits',async t=>{
 await finish(await begin());const saved=getCodexAccount('plan').exportTokens();
 for(const stalledBody of [false,true]){
  const deadline=new AbortController();let entered,cancels=0;const ready=new Promise(resolve=>entered=resolve),body=new ReadableStream({pull(){if(body.locked)entered();},cancel(){cancels++;}});
  const timeout=t.mock.method(AbortSignal,'timeout',ms=>{assert.equal(ms,20000);return deadline.signal;});
  const pending=discoverCodexModels({accountId:'plan',fetchImpl:async(url,options)=>{assert.equal(url,CODEX_ENDPOINTS.planModels);assert.equal(options.redirect,'error');if(stalledBody)return new Response(body);entered();return new Promise(()=>{});}});await ready;deadline.abort(new DOMException('Catalog deadline','TimeoutError'));await assert.rejects(pending,{name:'TimeoutError',code:'SUBSCRIPTION_TIMEOUT'});if(stalledBody){assert.equal(cancels,1);assert.equal(body.locked,false);}assert.deepEqual(getCodexAccount('plan').exportTokens(),saved);timeout.mock.restore();
 }
});

test('identity failures identify the exact check without exposing token claims or provider errors',async()=>{
 const cases=[
  ['SIWC_ID_ISSUER',{iss:'https://private-issuer.invalid'}],
  ['SIWC_ID_SUBJECT',{sub:''}],
  ['SIWC_ID_AUDIENCE',{aud:'private-audience'}],
  ['SIWC_ID_NONCE',{nonce:'private-nonce'}],
  ['SIWC_ID_EXPIRED',{exp:0}],
  ['SIWC_ID_NOT_YET_VALID',{nbf:Math.floor(Date.now()/1000)+60}],
 ];
 for(const [code,claims]of cases){const login=await begin();await assert.rejects(finish(login,{claims}),error=>{assert.equal(error.code,code);assert.doesNotMatch(error.message,/private-|person@example|fixture-authorization-code/);return true;});assert.equal(listCodexAccounts().length,0);}
 const login=await begin();await assert.rejects(finish(login,{loadPublicKeys:async()=>{throw Object.assign(new Error('private network payload'),{status:502});}}),error=>{assert.equal(error.code,'SIWC_KEYS_FETCH');assert.equal(error.status,502);assert.doesNotMatch(error.message,/private network/);return true;});
});
test('verification distinguishes key selection, key import and signature failure',async()=>{
 for(const kind of ['key','import','signature']){
  const login=await begin(),{idToken,jwk}=await signed(login);
  const keys=kind==='key'?[]:[{...jwk,...(kind==='import'?{key_ops:['sign']}:{})}];
  let token=idToken;if(kind==='signature'){const parts=token.split('.'),sig=Buffer.from(parts[2],'base64url');sig[0]^=1;parts[2]=sig.toString('base64url');token=parts.join('.');}
  await assert.rejects(completeCodexLogin(login,{callbackUrl:callback(login),fetchImpl:async()=>Response.json({id_token:token,access_token:'fixture-access',scope:'chatgpt.tokens.use.direct'}),loadPublicKeys:async()=>({keys})}),error=>{assert.equal(error.code,{key:'SIWC_ID_KEY_MATCH',import:'SIWC_ID_CRYPTO',signature:'SIWC_ID_SIGNATURE'}[kind]);return true;});
 }
});
test('ID-token not-before accepts only a small clock skew and callback errors have separate codes',async()=>{
 assert.equal((await finish(await begin(),{claims:{nbf:Date.now()/1000+3}})).identityVerified,true);
 const login=await begin(),url=callback(login);
 for(const [value,code]of [[url.replace(':1455',':1456'),'SIWC_CALLBACK_ADDRESS'],[url.replace(login.state,'other-state'),'SIWC_CALLBACK_STATE']])assert.throws(()=>validateCodexCallback(login,value),{code});
 const returning=await begin({clientId:'oaiapp_fixture'});assert.throws(()=>validateCodexCallback(returning,callback(returning,{client_id:'another-client'})),{code:'SIWC_CALLBACK_CLIENT'});
});

test('a public-key outage retains only a retry handle, verifies fully and exchanges the code exactly once',async()=>{
 const login=await begin(),{idToken,jwk}=await signed(login);let exchanged=0,keys=0,pending;
 const options={accountId:'retry-plan',callbackUrl:callback(login),fetchImpl:async()=>{exchanged++;return Response.json({access_token:'retry-private-access',refresh_token:'retry-private-refresh',id_token:idToken,scope:'chatgpt.tokens.use.direct'});},loadPublicKeys:async()=>{if(++keys===1)throw Object.assign(Error('upstream private response'),{status:502});return {keys:[jwk]};},onVerificationPending:value=>pending=value};
 await assert.rejects(completeCodexLogin(login,options),e=>e.code==='SIWC_KEYS_FETCH'&&e.status===502&&!e.message.includes('private'));
 assert.equal(listCodexAccounts().length,0);assert.deepEqual(Object.keys(pending).sort(),['cancel','expiresAt','retry']);assert.doesNotMatch(JSON.stringify(pending),/private|token|nonce|code/);
 await assert.rejects(completeCodexLogin({...login},options),/已使用/);
 const result=await pending.retry();assert.equal(result.identityVerified,true);assert.equal(exchanged,1);assert.equal(keys,2);assert.equal(result.id,'retry-plan');await assert.rejects(pending.retry());
});
test('retry after key outage still enforces nonce and destroys its pending tokens on verification failure',async()=>{
 const login=await begin(),{idToken,jwk}=await signed(login,{claims:{nonce:'wrong'}});let pending,keys=0;
 await assert.rejects(completeCodexLogin(login,{callbackUrl:callback(login),fetchImpl:async()=>Response.json({access_token:'private-access',id_token:idToken,scope:'chatgpt.tokens.use.direct'}),loadPublicKeys:async()=>{if(++keys===1)throw Error('outage');return {keys:[jwk]};},onVerificationPending:value=>pending=value}),{code:'SIWC_KEYS_FETCH'});
 await assert.rejects(pending.retry(),{code:'SIWC_ID_NONCE'});await assert.rejects(pending.retry(),{code:'SIWC_ATTEMPT_INVALID'});assert.equal(keys,2);assert.equal(listCodexAccounts().length,0);
});
test('pending verification cancellation aborts a retry and cannot replace an existing account',async()=>{
 await finish(await begin());const previous=getCodexAccount('plan').exportTokens(),login=await begin({clientId:'oaiapp_fixture'}),{idToken}=await signed(login);let pending,calls=0,entered;const started=new Promise(resolve=>entered=resolve);
 await assert.rejects(completeCodexLogin(login,{accountId:'plan',callbackUrl:callback(login),fetchImpl:async()=>Response.json({access_token:'new-private-access',id_token:idToken,scope:'chatgpt.tokens.use.direct'}),loadPublicKeys:async()=>{if(++calls===1)throw Error('outage');entered();return new Promise(()=>{});},onVerificationPending:value=>pending=value}),{code:'SIWC_KEYS_FETCH'});
 const retry=pending.retry();await started;await assert.rejects(pending.retry(),{code:'SIWC_VERIFICATION_BUSY'});pending.cancel();await assert.rejects(retry,{name:'AbortError'});await assert.rejects(pending.retry(),{code:'SIWC_ATTEMPT_INVALID'});assert.deepEqual(getCodexAccount('plan').exportTokens(),previous);
});
test('pending verification expires automatically and original cancellation clears it',async t=>{
 const realSet=setTimeout,timers=[];t.mock.method(globalThis,'setTimeout',(fn,ms,...args)=>{if(ms===300000){timers.push(fn);return {unref(){}};}return realSet(fn,ms,...args);});
 for(const cancel of ['expiry','signal']){const login=await begin(),{idToken}=await signed(login),controller=new AbortController();let pending;
 await assert.rejects(completeCodexLogin(login,{signal:controller.signal,callbackUrl:callback(login),fetchImpl:async()=>Response.json({access_token:'private',id_token:idToken,scope:'chatgpt.tokens.use.direct'}),loadPublicKeys:async()=>{throw Error('outage');},onVerificationPending:value=>pending=value}),{code:'SIWC_KEYS_FETCH'});
 if(cancel==='expiry')timers.at(-1)();else controller.abort();await assert.rejects(pending.retry(),{code:'SIWC_ATTEMPT_INVALID'});assert.equal(listCodexAccounts().length,0);
 }
});
test('a missing signing key triggers one public refresh with no identity fields and never loops',async()=>{
 const login=await begin(),{jwk}=await signed(login),calls=[];
 assert.equal((await finish(login,{loadPublicKeys:async value=>{calls.push(value);return {keys:value.refresh?[jwk]:[]};}})).identityVerified,true);assert.deepEqual(calls,[{signal:undefined},{signal:undefined,refresh:true}]);
 const missing=await begin();let count=0;await assert.rejects(finish(missing,{loadPublicKeys:async()=>{count++;return {keys:[]};}}),{code:'SIWC_ID_KEY_MATCH'});assert.equal(count,2);
 const requests=[];await loadOpenAIPublicKeys({refresh:true,fetchImpl:async(url,options)=>{requests.push({url,options});return Response.json({keys:[jwk]});}});assert.equal(new URL(requests[0].url).search,'?refresh=1');assert.equal(requests[0].options.credentials,'omit');assert.equal(requests[0].options.body,undefined);
});
test('invalid public-key JSON is terminal rather than retaining retryable login credentials',async()=>{
 const login=await begin();let retained=false;
 await assert.rejects(finish(login,{loadPublicKeys:()=>loadOpenAIPublicKeys({fetchImpl:async()=>new Response('{malformed')}),onVerificationPending:()=>retained=true}),{code:'SIWC_KEYS_FORMAT'});assert.equal(retained,false);assert.equal(listCodexAccounts().length,0);
});
test('signing-key refresh outage remains retryable without exchanging another authorization code',async()=>{
 const login=await begin(),{jwk}=await signed(login);let retained,calls=0;
 await assert.rejects(finish(login,{loadPublicKeys:async options=>{calls++;if(options.refresh)throw Object.assign(Error('outage'),{status:502});return {keys:calls>2?[jwk]:[]};},onVerificationPending:value=>retained=value}),{code:'SIWC_KEYS_FETCH'});
 assert.equal((await retained.retry()).identityVerified,true);assert.equal(calls,3);
});
