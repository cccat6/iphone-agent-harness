import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {clearCodexAccounts,registerCodexAccount,getCodexAccount,callCodexModel,startCodexLogin,completeCodexLogin,CODEX_ENDPOINTS} from '../../apps/web/core/codex.js';
import {safeNetworkDiagnostics} from '../../apps/web/core/network-diagnostics.js';
import {SIWC_ERROR_CATALOG} from '../../apps/web/locales/siwc-errors.js';
import {createHarness} from '../../apps/web/core/harness.js';
import {openStore} from '../../apps/web/core/store.js';
import {callModel} from '../../apps/web/core/providers.js';
import {NETWORK_RETRY_MESSAGES} from '../../apps/web/locales/network-retry.js';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const register=(access='synthetic-private-access')=>registerCodexAccount('plan',{access_token:access,refresh_token:'synthetic-private-refresh',id_token:'synthetic-private-id',expires_in:3600,scope:'chatgpt.tokens.use.direct'},{flow:'chatgpt-plan',clientId:'oaiapp_fixture',identityVerified:true});
const message={type:'message',role:'assistant',content:[{type:'output_text',text:'Ready.'}]};
const complete=()=>new Response('data: '+JSON.stringify({type:'response.completed',response:{status:'completed',output:[message]}})+'\n\n');
const provider={accountId:'plan',model:'fixture'},run=extra=>callCodexModel({provider,messages:[{role:'user',text:'Synthetic user text'}],...extra});
beforeEach(()=>{clearCodexAccounts();register();});
const retryDelays=[500,1000,2000,4000,8000];
function fastRetries(t){const original=setTimeout,delays=[];t.mock.method(globalThis,'setTimeout',(fn,ms,...args)=>{if(retryDelays.includes(ms)){delays.push(ms);return original(fn,0,...args);}return original(fn,ms,...args);});return delays;}

test('one before-headers TypeError reconnects once with identical payload/headers and records only safe facts',async t=>{
 fastRetries(t);const requests=[];let deltas=0;const result=await run({onDelta:()=>deltas++,fetchImpl:async(url,options)=>{requests.push({url,options});if(requests.length===1)throw new TypeError('PRIVATE URL/token/body');return complete();}});
 assert.equal(requests.length,2);assert.equal(requests[0].url,'https://igent.cc/api/openai/responses');assert.equal(requests[1].url,requests[0].url);assert.equal(requests[1].options.body,requests[0].options.body);assert.deepEqual(requests[1].options.headers,requests[0].options.headers);assert.equal(requests[1].options.redirect,'error');assert.equal(result.text,'Ready.');assert.equal(deltas,1);assert.equal(result.transportDiagnostics.recovered,true);assert.equal(result.transportDiagnostics.attempts,2);assert.equal(result.transportDiagnostics.phase,'awaiting_response_headers');assert.equal(result.transportDiagnostics.errorName,'TypeError');assert.doesNotMatch(JSON.stringify(result.transportDiagnostics),/PRIVATE|https:|synthetic|token|body/);
});

test('the fifth retry can recover, reports each backoff, and never emits a fake delta',async t=>{
 const delays=fastRetries(t),retries=[];let calls=0,deltas=0;const result=await callModel({provider:{...provider,protocol:'codex'},messages:[{role:'user',text:'Synthetic request'}],onDelta:()=>deltas++,onRetry:event=>{assert.equal(deltas,0);retries.push(event);},fetchImpl:async()=>{if(++calls<=5)throw new TypeError('Interrupted');return complete();}});
 assert.equal(calls,6);assert.equal(deltas,1);assert.equal(result.transportDiagnostics.attempts,6);assert.equal(result.transportDiagnostics.recovered,true);assert.deepEqual(delays,retryDelays);assert.deepEqual(retries, retryDelays.map((delayMs,i)=>({attempt:i+1,maxRetries:5,delayMs})));
});

test('a retry callback cannot override cancellation or trigger an additional retry after the total deadline',async t=>{
 fastRetries(t);const controller=new AbortController();let calls=0;await assert.rejects(run({signal:controller.signal,onRetry:()=>controller.abort(),fetchImpl:async()=>{calls++;throw new TypeError('Interrupted');}}),{name:'AbortError'});assert.equal(calls,1);
 let finish,calls2=0;await assert.rejects(run({provider:{...provider,timeoutMs:20},fetchImpl:async()=>{if(++calls2===1)throw new TypeError('Interrupted');return new Promise(resolve=>finish=resolve);}}),/请求超时/);assert.equal(calls2,2);let cancelled=0;finish(new Response(new ReadableStream({cancel(){cancelled++;}})));await new Promise(r=>setImmediate(r));assert.equal(cancelled,1);
});

test('retry budget stops after five retries/six requests and retains account plus safe diagnostics',async t=>{
 const delays=fastRetries(t),retries=[];let calls=0;const saved=getCodexAccount('plan').exportTokens();await assert.rejects(run({onRetry:event=>retries.push(event),fetchImpl:async()=>{calls++;throw new TypeError('PRIVATE request data');}}),error=>{assert.equal(error.code,'SIWC_RELAY_NETWORK');assert.equal(error.networkDiagnostics.attempts,6);assert.equal(error.networkDiagnostics.phase,'awaiting_response_headers');assert.doesNotMatch(JSON.stringify(error),/PRIVATE|synthetic/);assert.doesNotMatch(error.message,/CORS|凭据|登录|credential/i);return true;});assert.equal(calls,6);assert.deepEqual(delays,retryDelays);assert.deepEqual(retries.map(r=>r.attempt),[1,2,3,4,5]);assert.ok(retries.every(r=>r.maxRetries===5));assert.deepEqual(getCodexAccount('plan').exportTokens(),saved);
});

test('non-TypeError before headers is classified but never retried',async()=>{
 let calls=0;await assert.rejects(run({fetchImpl:async()=>{calls++;throw Error('PRIVATE failure');}}),error=>error.code==='SIWC_RELAY_NETWORK'&&error.networkDiagnostics.attempts===1&&error.networkDiagnostics.errorName==='Error');assert.equal(calls,1);
});

test('HTTP rejection and a missing body after headers never reconnect',async()=>{
 for(const status of [401,403,429,502]){let calls=0;await assert.rejects(run({fetchImpl:async()=>{calls++;return Response.json({error:{code:'permission_denied',message:'Synthetic failure'}},{status});}}),error=>error.status===status);assert.equal(calls,1);}
 let calls=0;await assert.rejects(run({fetchImpl:async()=>{calls++;return new Response(null);}}),{code:'SIWC_RELAY_STREAM'});assert.equal(calls,1);
});

test('a response stream failure never retries, whether or not a delta arrived',async()=>{
 for(const withDelta of [false,true]){let calls=0,deltas=0;const body=new ReadableStream({start(target){if(withDelta)target.enqueue(new TextEncoder().encode('data: '+JSON.stringify({type:'response.output_text.delta',delta:'Partial'})+'\n\n'));setTimeout(()=>target.error(new TypeError('PRIVATE stream data')),5);}});
  await assert.rejects(run({onDelta:()=>deltas++,fetchImpl:async()=>{calls++;return new Response(body);}}),error=>{assert.equal(error.code,'SIWC_RELAY_STREAM');assert.equal(error.networkDiagnostics.phase,'reading_response_stream');assert.equal(error.networkDiagnostics.attempts,1);assert.doesNotMatch(JSON.stringify(error),/PRIVATE/);return true;});assert.equal(calls,1);assert.equal(deltas,withDelta?1:0);assert.equal(body.locked,false);
 }
});

test('replacing the selected account during backoff prevents the second request',async()=>{
 let calls=0;await assert.rejects(run({fetchImpl:async()=>{calls++;setTimeout(()=>register('replacement-access'),5);throw new TypeError('connection interrupted');}}),/账号已更换/);assert.equal(calls,1);assert.equal(getCodexAccount('plan').exportTokens().access_token,'replacement-access');
});

test('caller cancellation during backoff stops the reconnect',async()=>{
 const controller=new AbortController();let calls=0;await assert.rejects(run({signal:controller.signal,fetchImpl:async()=>{calls++;setTimeout(()=>controller.abort(),5);throw new TypeError('connection interrupted');}}),{name:'AbortError'});assert.equal(calls,1);
});

test('timeout before headers or during backoff never starts another request',async()=>{
 for(const backoff of [false,true]){let calls=0;await assert.rejects(run({provider:{...provider,timeoutMs:5},fetchImpl:async()=>{calls++;if(backoff)throw new TypeError('interrupted');return new Promise(()=>{});}}),/请求超时/);assert.equal(calls,1);}
});

test('OAuth code exchange and legacy inference never receive inference reconnect behavior',async()=>{
 const login=await startCodexLogin({method:'authorization-code',hostId:'fixture-host'}),callbackUrl=login.redirectUri+'?'+new URLSearchParams({code:'synthetic-code',state:login.state,client_id:'oaiapp_fixture'});let exchanges=0;
 await assert.rejects(completeCodexLogin(login,{callbackUrl,fetchImpl:async(url)=>{assert.equal(url,CODEX_ENDPOINTS.planToken);exchanges++;throw new TypeError('private authorization code');}}));assert.equal(exchanges,1);
 registerCodexAccount('legacy',{access_token:'legacy-access',expires_in:3600},{flow:'codex',accountId:'legacy-fixture'});let calls=0;await assert.rejects(run({provider:{accountId:'legacy',model:'fixture'},fetchImpl:async()=>{calls++;throw new TypeError('private legacy data');}}));assert.equal(calls,1);
});

test('safe diagnostics validate all fields and discard extra request data',()=>{
 const facts={phase:'awaiting_response_headers',attempts:2,durationMs:204,errorName:'TypeError',online:true,visibility:'hidden'};assert.deepEqual(safeNetworkDiagnostics({...facts,url:'PRIVATE',token:'PRIVATE',body:{secret:'PRIVATE'}}),facts);for(const patch of [{phase:'PRIVATE'},{attempts:7},{durationMs:Infinity},{errorName:'PRIVATE'},{online:'PRIVATE'},{visibility:'PRIVATE'}])assert.equal(safeNetworkDiagnostics({...facts,...patch}),null);
 for(const code of ['SIWC_RELAY_NETWORK','SIWC_RELAY_STREAM']){assert.equal(Object.keys(SIWC_ERROR_CATALOG[code]).length,8);for(const text of Object.values(SIWC_ERROR_CATALOG[code]))assert.ok(text.endsWith('['+code+']'));}
});

test('Harness journals safe failed/recovered transport facts and preserves localized error codes',async()=>{
 for(const failed of [false,true]){const store=await openStore({memory:true}),session=await store.createSession({mode:'chat'});await store.saveSettings({providers:[{id:'fixture',protocol:'openai',model:'fixture',baseUrl:'https://fixture.invalid'}],activeProviderId:'fixture'});const network={phase:failed?'reading_response_stream':'awaiting_response_headers',attempts:2,durationMs:300,errorName:'TypeError',online:true,visibility:'hidden',url:'PRIVATE',token:'PRIVATE',...(failed?{}:{recovered:true})};const h=createHarness({store,invoke:async()=>{if(failed)throw Object.assign(Error('PRIVATE upstream detail'),{code:'SIWC_RELAY_STREAM',networkDiagnostics:network});return {text:'Done',toolCalls:[],transportDiagnostics:network};}});
  if(failed)await assert.rejects(h.run({sessionId:session.id,text:'Synthetic request'}),error=>error.code==='SIWC_RELAY_STREAM'&&!error.message.includes('PRIVATE'));else await h.run({sessionId:session.id,text:'Synthetic request'});
  const events=await store.getEvents(session.id,{limit:100}),record=events.find(e=>e.type===(failed?'model.network_failed':'model.network_recovered'));assert.ok(record);assert.doesNotMatch(JSON.stringify(record),/PRIVATE|token|url/);assert.equal(record.payload.network.attempts,2);if(failed)assert.equal(record.payload.code,'SIWC_RELAY_STREAM');store.close();
 }
});

test('Harness forwards retry progress as status and the app renders a localized count without a popup or delta',async()=>{
 const store=await openStore({memory:true}),session=await store.createSession({mode:'chat'});await store.saveSettings({providers:[{id:'fixture',protocol:'openai',model:'fixture',baseUrl:'https://fixture.invalid'}],activeProviderId:'fixture'});const events=[];
 await createHarness({store,onEvent:e=>events.push(e),invoke:async({onRetry})=>{onRetry({attempt:3,maxRetries:5,delayMs:2000});onRetry({attempt:99,maxRetries:5,delayMs:2000});return {text:'Done',toolCalls:[]};}}).run({sessionId:session.id,text:'Synthetic request'});
 const statuses=events.filter(e=>e.type==='status'&&e.status==='retrying_model');assert.equal(statuses.length,1);assert.equal(statuses[0].attempt,3);assert.equal(events.some(e=>e.type==='delta'),false);
 const source=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8'),start=source.indexOf('function onHarnessEvent(event)'),end=source.indexOf('\nasync function resumeRun(',start),statusNode={textContent:''},sandbox={state:{settings:{}},$:()=>statusNode,t:(key,params)=>{assert.equal(key,'status.retryingModel');return NETWORK_RETRY_MESSAGES['zh-Hans'][key].replace('{attempt}',params.attempt).replace('{maxRetries}',params.maxRetries);}};vm.runInNewContext(source.slice(start,end),sandbox);sandbox.onHarnessEvent(statuses[0]);assert.equal(statusNode.textContent,'正在重试模型连接（3/5）…');
 assert.equal(Object.keys(NETWORK_RETRY_MESSAGES).length,8);for(const table of Object.values(NETWORK_RETRY_MESSAGES)){assert.ok(table['status.retryingModel'].includes('{attempt}'));assert.ok(table['status.retryingModel'].includes('{maxRetries}'));}store.close();
});
