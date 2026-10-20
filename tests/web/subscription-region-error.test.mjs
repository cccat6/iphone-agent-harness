import test from 'node:test';
import assert from 'node:assert/strict';
import {registerCodexAccount,clearCodexAccounts,discoverCodexModels,callCodexModel,getCodexAccount} from '../../apps/web/core/codex.js';
import {localizeError,setLocale,SUPPORTED_LOCALES} from '../../apps/web/i18n.js';
test('subscription model directory and generation preserve region rejection without exposing upstream text',async()=>{
 clearCodexAccounts();registerCodexAccount('test',{access_token:'synthetic',expires_in:3600,scope:'chatgpt.tokens.use.direct'},{flow:'chatgpt-plan',clientId:'oaiapp_test',identityVerified:true});
 const fetchImpl=async()=>Response.json({error:{code:'unsupported_country_region_territory',message:'private upstream text'}},{status:403});
 for(const operation of [()=>discoverCodexModels({accountId:'test',fetchImpl}),()=>callCodexModel({provider:{accountId:'test',model:'fixture'},messages:[{role:'user',text:'synthetic'}],fetchImpl})]){
  await assert.rejects(operation(),error=>{assert.equal(error.code,'PROVIDER_REGION_UNSUPPORTED');assert.equal(error.status,403);assert.doesNotMatch(error.message,/private/);for(const {code}of SUPPORTED_LOCALES){setLocale(code);assert.match(localizeError(error),/PROVIDER_REGION_UNSUPPORTED/);}return true;});
  assert.ok(getCodexAccount('test'));
 }
 clearCodexAccounts();setLocale('auto');
});
