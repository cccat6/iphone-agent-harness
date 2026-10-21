import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {registerCodexAccount,clearCodexAccounts,callCodexModel} from '../../apps/web/core/codex.js';

const provider={accountId:'continuation',model:'fixture',enableResponseContinuation:true,promptCacheKey:'iah:test'};
const stream=events=>new Response(events.map(event=>'data: '+JSON.stringify(event)+'\n\n').join(''));
beforeEach(()=>{clearCodexAccounts();registerCodexAccount('continuation',{access_token:'synthetic',expires_in:3600,scope:'chatgpt.tokens.use.direct'},{flow:'chatgpt-plan',clientId:'oaiapp_fixture',identityVerified:true});});

test('Responses continuation sends only the new suffix after a stored response id',async()=>{
  const first=await callCodexModel({provider,messages:[{role:'user',text:'first'}],fetchImpl:async()=>stream([{type:'response.output_text.delta',delta:'first answer'},{type:'response.completed',response:{id:'response-1',status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'first answer'}]}]}}])});
  const requests=[];
  await callCodexModel({provider,messages:[{role:'assistant',text:first.text,providerState:first.providerState},{role:'user',text:'follow up'}],fetchImpl:async(url,options)=>{const payload=JSON.parse(options.body);requests.push(payload);return stream([{type:'response.output_text.delta',delta:'second answer'},{type:'response.completed',response:{id:'response-2',status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'second answer'}]}]}}]);}});
  assert.equal(requests[0].previous_response_id,'response-1');
  assert.deepEqual(requests[0].input,[{role:'user',content:[{type:'input_text',text:'follow up'}]}]);
});
