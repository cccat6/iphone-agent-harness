import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {clearCodexAccounts,registerCodexAccount,getCodexAccount,discoverCodexModels,callCodexModel,normalizeSubscriptionRelay,CODEX_ENDPOINTS} from '../../apps/web/core/codex.js';
import {openStore} from '../../apps/web/core/store.js';
beforeEach(()=>clearCodexAccounts());
const register=(id='plan',extra={})=>registerCodexAccount(id,{access_token:'private-'+id,refresh_token:'refresh-'+id,id_token:'identity-'+id,expires_in:3600,scope:'chatgpt.tokens.use.direct',...extra},{flow:'chatgpt-plan',clientId:'oaiapp_'+id,identityVerified:true});
const response=output=>new Response('data: '+JSON.stringify({type:'response.completed',response:{status:'completed',output}})+'\n\n');
const message={type:'message',role:'assistant',content:[{type:'output_text',text:'done'}]};
test('default and custom relay catalogs send only selected account access token, never identity or refresh tokens',async()=>{
 register('a');register('b');for(const [relayUrl,url]of [[undefined,'https://igent.cc/api/openai/models'],['','https://igent.cc/api/openai/models'],[' https://self.example/custom/// ','https://self.example/custom/models']]){
 let calls=0;const models=await discoverCodexModels({accountId:'b',relayUrl,fetchImpl:async(actual,options)=>{calls++;assert.equal(actual,url);assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.deepEqual(options.headers,{authorization:'Bearer private-b',accept:'application/json'});assert.equal(options.body,undefined);assert.doesNotMatch(JSON.stringify(options),/refresh-b|identity-b|private-a/);return Response.json({models:[{slug:'visible',visibility:'list'},{slug:'hidden',visibility:'hide'}]});}});assert.equal(calls,1);assert.deepEqual(models.map(m=>m.id),['visible']);}
});
test('invalid relay addresses fail before sending or refreshing any credential',async()=>{
 register('plan',{expiresAt:0});for(const relayUrl of ['http://self.example','https://user:password@self.example','https://self.example?x=y','https://self.example#fragment','not a URL',{}]){
 let count=0;const fetchImpl=async()=>{count++;throw Error('unexpected network');};await assert.rejects(discoverCodexModels({accountId:'plan',relayUrl,fetchImpl}),{code:'SIWC_RELAY_ADDRESS'});await assert.rejects(callCodexModel({provider:{accountId:'plan',model:'model',subscriptionRelayUrl:relayUrl},messages:[],fetchImpl}),{code:'SIWC_RELAY_ADDRESS'});assert.equal(count,0);}
 assert.equal(normalizeSubscriptionRelay('https://self.example/prefix/'),'https://self.example/prefix');
});
test('relay transport failure has one clear error and never runs direct API probes or clears accounts',async()=>{
 register();const saved=getCodexAccount('plan').exportTokens();for(const inference of [false,true]){let count=0;const fetchImpl=async(url,options)=>{count++;assert.equal(new URL(url).hostname,'igent.cc');assert.equal(options.redirect,'error');throw new TypeError('private upstream data');};await assert.rejects(inference?callCodexModel({provider:{accountId:'plan',model:'model'},messages:[],fetchImpl}):discoverCodexModels({accountId:'plan',fetchImpl}),error=>error.code==='SIWC_RELAY_NETWORK'&&!error.message.includes('private'));assert.equal(count,1);assert.deepEqual(getCodexAccount('plan').exportTokens(),saved);}
});
test('relay HTTP errors remain readable and successful inference uses fixed response path with standard headers',async()=>{
 register();for(const status of [401,403,502]){let calls=0;await assert.rejects(discoverCodexModels({accountId:'plan',fetchImpl:async()=>{calls++;return new Response(null,{status});}}),e=>e.status===status);assert.equal(calls,1);}
 const result=await callCodexModel({provider:{accountId:'plan',model:'model',subscriptionRelayUrl:'https://self.example/relay'},messages:[{role:'user',text:'hello'}],fetchImpl:async(url,options)=>{assert.equal(url,'https://self.example/relay/responses');assert.equal(options.redirect,'error');assert.deepEqual(options.headers,{authorization:'Bearer private-plan','content-type':'application/json',accept:'text/event-stream'});assert.doesNotMatch(options.body,/refresh-plan|identity-plan/);return response([message]);}});assert.equal(result.text,'done');assert.equal(result.providerState.origin,'https://self.example/relay/responses');
});
test('relay changes, including paths on the same host, cannot replay opaque provider state',async()=>{
 register('a');register('b');const first=await callCodexModel({provider:{accountId:'a',model:'model',subscriptionRelayUrl:'https://self.example/one'},messages:[],fetchImpl:async()=>response([{type:'reasoning',encrypted_content:'opaque-fixture'},message])});
 for(const provider of [{accountId:'a',model:'model',subscriptionRelayUrl:'https://self.example/two'},{accountId:'b',model:'model',subscriptionRelayUrl:'https://self.example/one'}])await callCodexModel({provider,messages:[{role:'assistant',text:first.text,toolCalls:[],providerState:first.providerState}],fetchImpl:async(url,options)=>{assert.doesNotMatch(options.body,/opaque-fixture/);return response([message]);}});
 await callCodexModel({provider:{accountId:'a',model:'model',subscriptionRelayUrl:'https://self.example/one'},messages:[{role:'assistant',text:first.text,toolCalls:[],providerState:first.providerState}],fetchImpl:async(url,options)=>{assert.match(options.body,/opaque-fixture/);return response([message]);}});
});
test('refresh stays on the official OAuth endpoint while catalog goes to custom relay',async()=>{
 register('plan',{expiresAt:0});const calls=[];await discoverCodexModels({accountId:'plan',relayUrl:'https://self.example/relay',fetchImpl:async(url,options)=>{calls.push(url);if(url===CODEX_ENDPOINTS.planToken){assert.equal(new URLSearchParams(options.body).get('refresh_token'),'refresh-plan');assert.equal(options.redirect,'error');return Response.json({access_token:'updated-access',expires_in:3600});}assert.equal(options.headers.authorization,'Bearer updated-access');assert.equal(options.body,undefined);return Response.json({models:[]});}});assert.deepEqual(calls,[CODEX_ENDPOINTS.planToken,'https://self.example/relay/models']);
});
test('legacy catalog ignores relay configuration and retains its direct routing',async()=>{
 registerCodexAccount('legacy',{access_token:'legacy',expires_in:3600},{flow:'codex',accountId:'fixture'});let calls=0;await assert.rejects(discoverCodexModels({accountId:'legacy',relayUrl:'not-a-url',fetchImpl:async(url,options)=>{calls++;assert.equal(new URL(url).origin,'https://chatgpt.com');assert.equal(options.redirect,'error');throw Error('network');}}),{code:'CODEX_MODELS_NETWORK'});assert.equal(calls,1);
});
test('caller cancellation stops relay requests and cancels late response bodies',async()=>{
 register();const caller=new AbortController();let ready,resolveResponse;const entered=new Promise(resolve=>ready=resolve),pending=discoverCodexModels({accountId:'plan',signal:caller.signal,fetchImpl:async()=>{ready();return new Promise(resolve=>resolveResponse=resolve);}});await entered;caller.abort();await assert.rejects(pending,{name:'AbortError'});let cancels=0;resolveResponse(new Response(new ReadableStream({cancel(){cancels++;}})));await new Promise(resolve=>setImmediate(resolve));assert.equal(cancels,1);assert.ok(getCodexAccount('plan'));
});
test('relay configuration survives provider persistence without being added to credential records',async()=>{
 const store=await openStore({memory:true});await store.saveProvider({id:'relay',name:'ChatGPT',protocol:'codex',model:'',subscriptionRelayUrl:'https://self.example/relay'},null);assert.equal((await store.getSettings()).providers[0].subscriptionRelayUrl,'https://self.example/relay');assert.equal(await store.getLocalCredential('provider:relay'),null);store.close();
});
