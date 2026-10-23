import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {registerCodexAccount,clearCodexAccounts,callCodexModel} from '../../apps/web/core/codex.js';

const provider={accountId:'continuation',model:'fixture',enableResponseContinuation:true,storeResponses:true,promptCacheKey:'iah:test'};
const stream=events=>new Response(events.map(event=>'data: '+JSON.stringify(event)+'\n\n').join(''));
beforeEach(()=>{clearCodexAccounts();registerCodexAccount('continuation',{access_token:'synthetic',expires_in:3600,scope:'chatgpt.tokens.use.direct'},{flow:'chatgpt-plan',clientId:'oaiapp_fixture',identityVerified:true});});

test('Responses continuation sends only the new suffix after a stored response id',async()=>{
  const first=await callCodexModel({provider,messages:[{role:'user',text:'first'}],fetchImpl:async()=>stream([{type:'response.output_text.delta',delta:'first answer'},{type:'response.completed',response:{id:'response-1',status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'first answer'}]}]}}])});
  const requests=[];
  await callCodexModel({provider,messages:[{role:'assistant',text:first.text,providerState:first.providerState},{role:'user',text:'follow up'}],fetchImpl:async(url,options)=>{const payload=JSON.parse(options.body);requests.push(payload);return stream([{type:'response.output_text.delta',delta:'second answer'},{type:'response.completed',response:{id:'response-2',status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'second answer'}]}]}}]);}});
  assert.equal(requests[0].previous_response_id,'response-1');
  assert.deepEqual(requests[0].input,[{role:'user',content:[{type:'input_text',text:'follow up'}]}]);
});
test('privacy-preserving Responses requests do not send previous_response_id with store false',async()=>{
  const first=await callCodexModel({provider:{...provider,storeResponses:false},messages:[{role:'user',text:'first'}],fetchImpl:async()=>stream([{type:'response.output_text.delta',delta:'first answer'},{type:'response.completed',response:{id:'response-private',status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'first answer'}]}]}}])});
  let payload;await callCodexModel({provider:{...provider,storeResponses:false},messages:[{role:'assistant',text:first.text,providerState:first.providerState},{role:'user',text:'follow up'}],fetchImpl:async(url,options)=>{payload=JSON.parse(options.body);return stream([{type:'response.completed',response:{id:'response-private-2',status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'done'}]}]}}]);}});
  assert.equal(payload.store,false);assert.equal(payload.previous_response_id,undefined);assert.ok(payload.input.length>=2);
});

test('modern plan subscriptions request cache comparison without enabling stored continuation',async()=>{
 const modern={...provider,model:'gpt-6-luna',storeResponses:false,enableResponseContinuation:false};
 const first=await callCodexModel({provider:modern,messages:[{role:'user',text:'first'}],fetchImpl:async()=>stream([{type:'response.completed',response:{id:'resp_compare',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'first answer'}]}]}}])});
 let payload;const diagnostics={status:'cache_miss',reason:'input_changed'};
 const second=await callCodexModel({provider:modern,messages:[{role:'user',text:'first'},{role:'assistant',text:first.text,providerState:first.providerState},{role:'user',text:'next'}],fetchImpl:async(_url,options)=>{payload=JSON.parse(options.body);return stream([{type:'response.output_text.delta',delta:'ok'},{type:'response.completed',response:{id:'resp_next',status:'completed',usage:{input_tokens:2000,input_tokens_details:{cached_tokens:0}},prompt_cache_diagnostics:diagnostics,output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'ok'}]}]}}]);}});
 assert.deepEqual(payload.prompt_cache_options,{comparison_response_id:'resp_compare'});assert.equal(payload.previous_response_id,undefined);assert.equal(payload.store,false);assert.equal(payload.input.length,3);assert.deepEqual(second.cache.diagnostics,diagnostics);assert.equal(second.cache.cachedInputTokens,0);
 for(const name of ['credentialMs','serializeMs','prepareMs','responseHeadersMs','firstEventMs','firstContentMs','streamMs','totalMs'])assert.ok(Number.isInteger(second.timing[name])&&second.timing[name]>=0,name);
 assert.ok(second.timing.totalMs>=second.timing.prepareMs);
});

test('cache comparison is omitted after an account or model scope change and on older models',async()=>{
 const first=await callCodexModel({provider:{...provider,model:'gpt-6-luna'},messages:[{role:'user',text:'first'}],fetchImpl:async()=>stream([{type:'response.completed',response:{id:'resp_before',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'answer'}]}]}}])});
 for(const model of ['gpt-6-sol','gpt-5.4','fixture'])await callCodexModel({provider:{...provider,model},messages:[{role:'assistant',text:first.text,providerState:first.providerState}],fetchImpl:async(_url,options)=>{assert.equal(JSON.parse(options.body).prompt_cache_options,undefined);return stream([{type:'response.completed',response:{status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'done'}]}]}}]);}});
});

test('plan subscription uses the same stable key in cache routing body and session header',async()=>{
 await callCodexModel({provider:{...provider,model:'gpt-6-luna',promptCacheKey:'iah:session-fixture',sessionId:'session-fixture'},messages:[{role:'user',text:'ok'}],fetchImpl:async(_url,o)=>{assert.equal(o.headers['session-id'],'iah:session-fixture');assert.equal(JSON.parse(o.body).prompt_cache_key,o.headers['session-id']);return stream([{type:'response.completed',response:{id:'response-affinity',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'ok'}]}]}}]);}});
});
