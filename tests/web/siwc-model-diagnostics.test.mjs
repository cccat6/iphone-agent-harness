import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {clearCodexAccounts,registerCodexAccount,getCodexAccount,discoverCodexModels,CODEX_ENDPOINTS} from '../../apps/web/core/codex.js';
beforeEach(()=>clearCodexAccounts());
const register=()=>registerCodexAccount('plan',{access_token:'private-plan-token',expires_in:3600,scope:'chatgpt.tokens.use.direct'},{flow:'chatgpt-plan',clientId:'oaiapp_fixture',identityVerified:true});
const opaque=()=>({status:0,type:'opaqueredirect'});
const outage=()=>{throw new TypeError('private upstream content');};
for(const [name,anonymous,bearer,code] of [
 ['both readable',()=>new Response(null,{status:401}),()=>new Response(null,{status:401}),'SIWC_MODELS_AUTH_RESPONSE'],
 ['only bearer readable',outage,()=>new Response(null,{status:403}),'SIWC_MODELS_AUTH_RESPONSE'],
 ['only anonymous readable',()=>new Response(null,{status:401}),outage,'SIWC_MODELS_PREFLIGHT'],
 ['neither readable',outage,outage,'SIWC_MODELS_NETWORK'],
 ['anonymous redirects',opaque,outage,'SIWC_MODELS_REDIRECT'],
 ['bearer redirects',outage,opaque,'SIWC_MODELS_REDIRECT']]){
 test('plan network diagnostic: '+name,async()=>{
  register();const saved=getCodexAccount('plan').exportTokens(),calls=[];
  await assert.rejects(discoverCodexModels({accountId:'plan',fetchImpl:async(url,options)=>{
   calls.push({url,options});assert.equal(url,CODEX_ENDPOINTS.planModels);assert.equal(options.redirect,'manual');assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');assert.equal(options.cache,'no-store');assert.equal(options.body,undefined);assert.equal(options.method||'GET','GET');
   if(calls.length===1){assert.equal(options.headers.authorization,'Bearer private-plan-token');return outage();}
   assert.equal(options.headers.accept,'application/json');if(options.headers.authorization){assert.equal(options.headers.authorization,'Bearer iah-intentionally-invalid-catalog-probe');return bearer();}return anonymous();
  }}),error=>{assert.equal(error.code,code);assert.doesNotMatch(JSON.stringify(error),/private-|upstream|Bearer|https:/);assert.doesNotMatch(error.message,/private-|upstream|Bearer/);for(const result of Object.values(error.diagnostics)){assert.ok(['http','redirect','unreadable'].includes(result.kind));assert.ok(Object.keys(result).every(key=>['kind','status'].includes(key)));}return true;});
  assert.equal(calls.length,3);assert.deepEqual(getCodexAccount('plan').exportTokens(),saved);
 });
}
test('main opaque redirect is identified without following or sending probes',async()=>{
 register();let count=0;await assert.rejects(discoverCodexModels({accountId:'plan',fetchImpl:async(url,options)=>{count++;assert.equal(options.redirect,'manual');return opaque();}}),{code:'SIWC_MODELS_REDIRECT'});assert.equal(count,1);
});
test('readable errors and invalid model JSON never trigger diagnostic requests',async()=>{
 register();for(const response of [new Response(null,{status:401}),new Response(null,{status:403}),new Response('{broken'),Response.json({unexpected:true})]){let count=0;await assert.rejects(discoverCodexModels({accountId:'plan',fetchImpl:async()=>{count++;return response;}}));assert.equal(count,1);}
});
test('successful directory is parsed once and never replaced by a diagnostic response',async()=>{
 register();let count=0;const models=await discoverCodexModels({accountId:'plan',fetchImpl:async(url,options)=>{count++;assert.equal(options.redirect,'manual');return Response.json({models:[{slug:'actual-model',visibility:'list'}]});}});assert.deepEqual(models.map(model=>model.id),['actual-model']);assert.equal(count,1);
});
test('legacy directory network failure identifies its flow without probing public models',async()=>{
 registerCodexAccount('legacy',{access_token:'private-legacy',expires_in:3600},{flow:'codex',accountId:'fixture-account'});let count=0;
 await assert.rejects(discoverCodexModels({accountId:'legacy',fetchImpl:async(url,options)=>{count++;assert.equal(new URL(url).origin,'https://chatgpt.com');assert.equal(options.redirect,'error');throw new TypeError('network');}}),{code:'CODEX_MODELS_NETWORK'});assert.equal(count,1);assert.ok(getCodexAccount('legacy'));
});
test('diagnostic probes run concurrently, each ends within its 3-second budget without reading bodies',async t=>{
 register();const timers=[],entered=[];t.mock.method(AbortSignal,'timeout',ms=>{const controller=new AbortController();timers.push({ms,controller});return controller.signal;});let count=0,ready;const both=new Promise(resolve=>ready=resolve);
 const pending=discoverCodexModels({accountId:'plan',fetchImpl:async(url,options)=>{if(++count===1)throw Error('network');entered.push(options.signal);if(entered.length===2)ready();return new Promise(()=>{});}});await both;assert.deepEqual(timers.map(timer=>timer.ms),[20000,3000,3000]);for(const timer of timers.filter(timer=>timer.ms===3000))timer.controller.abort(new DOMException('probe timeout','TimeoutError'));
 await assert.rejects(pending,{code:'SIWC_MODELS_NETWORK'});assert.equal(count,3);assert.ok(entered.every(signal=>signal.aborted));
});
test('the total deadline and caller cancellation stop in-flight probes and preserve the account',async t=>{
 for(const callerCancel of [false,true]){clearCodexAccounts();register();const saved=getCodexAccount('plan').exportTokens(),timers=[],caller=new AbortController();let count=0,ready;const both=new Promise(resolve=>ready=resolve);
 const mock=t.mock.method(AbortSignal,'timeout',ms=>{const controller=new AbortController();timers.push({ms,controller});return controller.signal;});
 const pending=discoverCodexModels({accountId:'plan',signal:caller.signal,fetchImpl:async()=>{if(++count===1)throw Error('network');if(count===3)ready();return new Promise(()=>{});}});await both;
 const reason=new DOMException('cancelled',callerCancel?'AbortError':'TimeoutError');(callerCancel?caller:timers[0].controller).abort(reason);await assert.rejects(pending,error=>callerCancel?error===reason:error.code==='SUBSCRIPTION_TIMEOUT');assert.equal(count,3);assert.deepEqual(getCodexAccount('plan').exportTokens(),saved);mock.mock.restore();}
});
test('late probe responses after cancellation are cancelled, never parsed or retained',async()=>{
 register();const controller=new AbortController();let count=0,ready;const both=new Promise(resolve=>ready=resolve),resolves=[];
 const pending=discoverCodexModels({accountId:'plan',signal:controller.signal,fetchImpl:async()=>{if(++count===1)throw Error('network');if(count===3)ready();return new Promise(resolve=>resolves.push(resolve));}});await both;controller.abort();await assert.rejects(pending,{name:'AbortError'});let cancels=0;for(const resolve of resolves)resolve(new Response(new ReadableStream({cancel(){cancels++;}})));await new Promise(resolve=>setImmediate(resolve));assert.equal(cancels,2);assert.equal(count,3);
});
