import test from 'node:test';
import assert from 'node:assert/strict';
import {modelReasoningMetadata,reasoningOptions,normalizeReasoningEffort,reasoningParameters} from '../../apps/web/core/reasoning.js';
import {resolveModelSelection} from '../../apps/web/core/models.js';
import {callModel,discoverModels} from '../../apps/web/core/providers.js';
import {callCodexModel,discoverCodexModels,registerCodexAccount,clearCodexAccounts} from '../../apps/web/core/codex.js';
import {REASONING_MESSAGES} from '../../apps/web/locales/reasoning.js';
const openai={id:'a',protocol:'openai',baseUrl:'https://api.openai.com/v1',model:'gpt-5.4',stream:false};
const deepseek=protocol=>({id:'ds',protocol,baseUrl:'https://api.deepseek.com'+(protocol==='anthropic'?'/anthropic':''),model:'deepseek-flash',stream:false});
const reply=protocol=>Response.json(protocol==='anthropic'?{stop_reason:'end_turn',content:[{type:'text',text:'ok'}]}:{choices:[{finish_reason:'stop',message:{content:'ok'}}]});
async function payload(provider){let sent;await callModel({provider,credential:'synthetic',messages:[{role:'user',text:'hello'}],fetchImpl:async(url,options)=>{sent=JSON.parse(options.body);return reply(provider.protocol);}});return sent;}
test('effort choices follow selected catalog model, including explicit unsupported metadata',()=>{
 assert.deepEqual(modelReasoningMetadata({supported_reasoning_levels:[{effort:'low'},{effort:'xhigh'},{effort:'invalid'},{effort:'low'}],default_reasoning_level:'xhigh'}),{supportedReasoningEfforts:['low','xhigh'],defaultReasoningEffort:'xhigh'});
 const settings={providers:[{...openai,models:[{id:'gpt-5.4',supported_reasoning_levels:[{effort:'high'}],context_window:1000000},{id:'plain',supportedReasoningEfforts:[]}]}]};
 const selected=resolveModelSelection(settings,'a::gpt-5.4');assert.deepEqual(reasoningOptions(selected),['high']);assert.equal(selected.contextWindowTokens,1000000);
 assert.deepEqual(reasoningOptions(resolveModelSelection(settings,'a::plain')),[]);
 assert.deepEqual(reasoningOptions({...openai,model:'unknown-future-model'}),[]);
 assert.equal(normalizeReasoningEffort(selected,'xhigh'),'auto');assert.equal(normalizeReasoningEffort(selected,'high'),'high');
});
test('known model fallbacks expose only documented levels and do not guess future model IDs',()=>{
 assert.deepEqual(reasoningOptions(openai),['none','low','medium','high','xhigh']);
 assert.deepEqual(reasoningOptions({...openai,model:'gpt-5.1'}),['none','low','medium','high']);
 assert.deepEqual(reasoningOptions({...openai,model:'gpt-5'}),['minimal','low','medium','high']);
 assert.deepEqual(reasoningOptions({...openai,model:'gpt-6.1-sol'}),['low','medium','high','xhigh','max']);
 assert.deepEqual(reasoningOptions({...openai,model:'gpt-5.9'}),[]);
 assert.deepEqual(reasoningOptions({...openai,model:'gpt-5.4-chat-latest'}),[]);
 assert.deepEqual(reasoningOptions({...openai,model:'gpt-5.4-2026-03-05'}),['none','low','medium','high','xhigh']);
 assert.deepEqual(reasoningOptions({...openai,model:'gpt-4.1'}),[]);
 assert.deepEqual(reasoningOptions(deepseek('openai')),['none','low','high','max']);
 assert.deepEqual(reasoningOptions({...deepseek('openai'),model:'deepseek-chat'}),[]);
});
test('OpenAI effort is transmitted, auto and unsupported effort omitted, reasoning output budget uses completion token field',async()=>{
 let sent=await payload({...openai,reasoningEffort:'high',maxTokens:2048});assert.equal(sent.reasoning_effort,'high');assert.equal(sent.max_completion_tokens,2048);assert.equal(sent.max_tokens,undefined);
 for(const effort of ['auto','unsupported','max',undefined]){sent=await payload({...openai,reasoningEffort:effort});assert.equal(sent.reasoning_effort,undefined);assert.equal(sent.thinking,undefined);}
 sent=await payload({...openai,model:'gpt-4.1',reasoningEffort:'high'});assert.equal(sent.reasoning_effort,undefined);
});
for(const protocol of ['openai','anthropic'])test(`DeepSeek ${protocol} uses its documented thinking and effort fields`,async()=>{
 const disabled=await payload({...deepseek(protocol),reasoningEffort:'none'});assert.deepEqual(disabled.thinking,{type:'disabled'});assert.equal(disabled.reasoning_effort,undefined);assert.equal(disabled.output_config,undefined);
 const high=await payload({...deepseek(protocol),reasoningEffort:'max'});assert.deepEqual(high.thinking,{type:'enabled'});
 if(protocol==='anthropic'){assert.deepEqual(high.output_config,{effort:'max'});assert.equal(high.reasoning_effort,undefined);}else{assert.equal(high.reasoning_effort,'max');assert.equal(high.output_config,undefined);}
 const auto=await payload({...deepseek(protocol),reasoningEffort:'auto'});assert.equal(auto.thinking,undefined);assert.equal(auto.reasoning_effort,undefined);assert.equal(auto.output_config,undefined);
});
test('Claude effort uses adaptive thinking only on supported models; older extended thinking has no invented effort levels',async()=>{
 const claude={protocol:'anthropic',baseUrl:'https://api.anthropic.com',stream:false,model:'claude-sonnet-4-6',reasoningEffort:'max'};
 assert.deepEqual(reasoningOptions(claude),['low','medium','high','max']);assert.deepEqual(reasoningOptions({...claude,model:'claude-opus-5-9'}),[]);let sent=await payload(claude);assert.deepEqual(sent.output_config,{effort:'max'});assert.deepEqual(sent.thinking,{type:'adaptive'});assert.equal(sent.reasoning_effort,undefined);
 sent=await payload({...claude,model:'claude-opus-4-5',reasoningEffort:'high'});assert.deepEqual(sent.output_config,{effort:'high'});assert.equal(sent.thinking,undefined);
 sent=await payload({...claude,model:'claude-sonnet-4-5',reasoningEffort:'high'});assert.equal(sent.output_config,undefined);assert.equal(sent.thinking,undefined);
});
test('API model discovery preserves bounded supported effort metadata through selection',async()=>{
 const models=await discoverModels({...openai,fetchImpl:async()=>Response.json({data:[{id:'custom',supported_reasoning_efforts:['low','high'],default_reasoning_effort:'low'}]})});
 assert.deepEqual(models[0].supportedReasoningEfforts,['low','high']);assert.equal(models[0].defaultReasoningEffort,'low');
 const selected=resolveModelSelection({providers:[{...openai,models}]},'a::custom');assert.deepEqual(reasoningOptions(selected),['low','high']);assert.deepEqual(reasoningParameters({...selected,reasoningEffort:'high'}),{reasoning_effort:'high'});
});
test('Codex exact catalog efforts survive discovery and use Responses reasoning schema; auto omitted',async()=>{
 clearCodexAccounts();const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),token=b64({alg:'none'})+'.'+b64({'https://api.openai.com/auth':{chatgpt_account_id:'acct'}})+'.fixture';registerCodexAccount('acct',{access_token:token,refresh_token:'synthetic',expires_in:3600});
 try{
 const models=await discoverCodexModels({accountId:'acct',fetchImpl:async()=>Response.json({models:[{slug:'custom-codex',supported_reasoning_levels:[{effort:'low'},{effort:'ultra'}],default_reasoning_level:'low'}]})});assert.deepEqual(models[0].supportedReasoningEfforts,['low','ultra']);
 const provider={protocol:'codex',accountId:'acct',model:'custom-codex',models};
 for(const effort of ['ultra','auto','high'])await callCodexModel({provider:{...provider,reasoningEffort:effort},messages:[],fetchImpl:async(url,options)=>{const sent=JSON.parse(options.body);assert.deepEqual(sent.reasoning,effort==='ultra'?{effort:'ultra',summary:'auto'}:undefined);return new Response('data: '+JSON.stringify({type:'response.completed',response:{status:'completed',output:[{type:'message',content:[{type:'output_text',text:'ok'}]}]}})+'\n\n');}});
 }finally{clearCodexAccounts();}
});
test('all eight locales describe every supported reasoning choice',()=>{
 assert.equal(Object.keys(REASONING_MESSAGES).length,8);for(const table of Object.values(REASONING_MESSAGES))for(const key of ['label','auto','none','minimal','low','medium','high','xhigh','max','ultra'])assert.equal(typeof table['reasoning.'+key],'string');
});

import {indexedDB,IDBKeyRange} from 'fake-indexeddb';
import {openStore} from '../../apps/web/core/store.js';
import {saveProviderCredential,clearCredentials} from '../../apps/web/core/credentials.js';
import {createHarness} from '../../apps/web/core/harness.js';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('session effort settings survive IndexedDB reopen, isolate accounts and models, and reach actual Harness HTTP requests',async()=>{
 globalThis.indexedDB=indexedDB;globalThis.IDBKeyRange=IDBKeyRange;clearCredentials();
 const profiles=['first','second'].map(id=>({...deepseek('openai'),id,models:[{id:'deepseek-flash'},{id:'deepseek-v4-pro'}]}));
 const name='reasoning-roundtrip-'+crypto.randomUUID();let store=await openStore({name});
 await store.saveSettings({providers:profiles,activeProviderId:'first',reasoningEfforts:{'first::deepseek-flash':'high','second::deepseek-flash':'max'}});
 for(const profile of profiles)await saveProviderCredential(store,profile.id,{kind:'api',apiKey:'synthetic-'+profile.id});
 const session=await store.createSession({title:'Reasoning roundtrip',mode:'chat',modelId:'first::deepseek-flash'});
 await store.updateSession(session.id,{reasoningEfforts:{'first::deepseek-flash':'low','first::deepseek-v4-pro':'none'}});store.close();clearCredentials();store=await openStore({name});
 const restored=await store.getSession(session.id);assert.deepEqual(restored.reasoningEfforts,{'first::deepseek-flash':'low','first::deepseek-v4-pro':'none'});
 const requests=[],harness=createHarness({store,invoke:request=>callModel({...request,fetchImpl:async(url,options)=>{requests.push({body:JSON.parse(options.body),key:options.headers.authorization});return reply('openai');}})});
 for(const modelId of ['first::deepseek-flash','second::deepseek-flash','first::deepseek-v4-pro'])await harness.run({sessionId:session.id,modelId,text:'Say hello.'});
 assert.equal(requests.length,3);assert.equal(requests[0].body.reasoning_effort,'low');assert.equal(requests[0].key,'Bearer synthetic-first');
 assert.equal(requests[1].body.reasoning_effort,'max');assert.equal(requests[1].key,'Bearer synthetic-second');
 assert.deepEqual(requests[2].body.thinking,{type:'disabled'});assert.equal(requests[2].body.reasoning_effort,undefined);
 assert.deepEqual((await store.getSession(session.id)).reasoningEfforts,restored.reasoningEfforts);store.close();clearCredentials();
});

test('actual reasoning selector renders catalog choices and persists a session override without changing another model or account',async()=>{
 const source=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8'),start=source.indexOf('function renderReasoningOptions()'),end=source.indexOf('\nfunction updateModeDescription(',start);assert.ok(start>=0&&end>start);
 const store=await openStore({memory:true}),profile={...openai,models:[{id:'chosen',supportedReasoningEfforts:['low','high']},{id:'plain',supportedReasoningEfforts:[]}]};
 const settings=await store.saveSettings({providers:[profile],reasoningEfforts:{'a::chosen':'high','other::chosen':'low'}}),current=await store.createSession({title:'UI effort',modelId:'a::chosen',reasoningEfforts:{'a::plain':'auto'}});
 const select={value:'',setAttribute(name,value){this[name]=value;}},modelSelect={value:'a::chosen'},$=selector=>selector==='#reasoning-select'?select:modelSelect;
 const state={settings,current,running:false,submitting:false,store};
 const context=vm.createContext({state,$,selectedProvider:()=>profile,selectionParts:value=>({modelId:value.split('::')[1]}),reasoningOptions,normalizeReasoningEffort,t:key=>key,escapeHTML:String,guard:fn=>fn});
 vm.runInContext(source.slice(start,end),context);context.renderReasoningOptions();assert.equal(select.hidden,false);assert.equal(select.value,'high');assert.match(select.innerHTML,/value="auto"/);assert.match(select.innerHTML,/value="low"/);assert.match(select.innerHTML,/value="high"/);assert.doesNotMatch(select.innerHTML,/value="max"/);
 const handlerStart=source.indexOf("$('#reasoning-select').onchange=guard("),handlerEnd=source.indexOf("\n  $('#model-select').onchange",handlerStart);assert.ok(handlerStart>=0&&handlerEnd>handlerStart);vm.runInContext(source.slice(handlerStart,handlerEnd),context);
 select.value='low';await select.onchange();assert.equal((await store.getSession(current.id)).reasoningEfforts['a::chosen'],'low');assert.equal(state.current.reasoningEfforts['a::plain'],'auto');assert.equal((await store.getSettings()).reasoningEfforts['a::chosen'],'high');assert.equal(state.settings.reasoningEfforts['other::chosen'],'low');
 state.running=true;context.renderReasoningOptions();assert.equal(select.disabled,true);state.running=false;
 modelSelect.value='a::plain';context.renderReasoningOptions();assert.equal(select.hidden,true);assert.equal(select.value,'auto');store.close();
});
