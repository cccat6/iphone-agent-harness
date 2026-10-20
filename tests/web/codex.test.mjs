import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {CODEX_CLIENT_ID,CODEX_ENDPOINTS,startCodexLogin,completeCodexLogin,registerCodexAccount,getCodexAccount,hasCodexAccount,listCodexAccounts,setActiveCodexAccount,removeCodexAccount,clearCodexAccounts,setCodexTokenObserver,callCodexModel,discoverCodexModels} from '../../apps/web/core/codex.js';
const enc=new TextEncoder();const b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const token=(id='acct',extra={})=>b64({alg:'none'})+'.'+b64({'https://api.openai.com/auth':{chatgpt_account_id:id},...extra})+'.not-a-signature';
const register=(id='a',extra={})=>registerCodexAccount(id,{access_token:token(id),refresh_token:'fixture-refresh-'+id,expires_in:3600,...extra});
const completed=(output=[{type:'message',content:[{type:'output_text',text:'手机完成'}]}])=>({type:'response.completed',response:{id:'r',status:'completed',output,usage:{input_tokens:7,output_tokens:3}}});
const response=(events,size=1)=>{const bytes=enc.encode(events.map(v=>'data: '+JSON.stringify(v)+'\r\n\r\n').join(''));return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=size)c.enqueue(bytes.slice(i,i+size));c.close();}}),{headers:{'Content-Type':'text/event-stream'}});};
const provider={model:'fixture-model',accountId:'a'};
beforeEach(()=>clearCodexAccounts());
test('device-code login uses official public client, pending polling, and authorization-code exchange',async()=>{
 const requests=[];let polls=0;const fetchImpl=async(url,o)=>{requests.push({url,body:o.body});if(url===CODEX_ENDPOINTS.userCode)return Response.json({device_auth_id:'device',usercode:'ABCD',interval:'0'});if(url===CODEX_ENDPOINTS.poll)return ++polls===1?Response.json({error:'deviceauth_authorization_pending'},{status:403}):Response.json({authorization_code:'code',code_verifier:'verifier'});return Response.json({access_token:token(),refresh_token:'fixture',expires_in:3600});};
 const login=await startCodexLogin({fetchImpl});assert.equal(login.clientId,CODEX_CLIENT_ID);assert.equal(login.user_code,'ABCD');assert.equal(login.interval,1);assert.equal(login.verification_url,'https://auth.openai.com/codex/device');
 const a=await completeCodexLogin(login,{accountId:'a',fetchImpl,waitImpl:async()=>{}});assert.equal(a.accountId,'acct');const form=new URLSearchParams(requests.at(-1).body);assert.equal(form.get('grant_type'),'authorization_code');assert.equal(form.get('redirect_uri'),'https://auth.openai.com/deviceauth/callback');assert.ok(hasCodexAccount('a'));await assert.rejects(completeCodexLogin(login),/已使用/);
});
test('device start and poll fail honestly without returning a logged-in account',async()=>{
 await assert.rejects(startCodexLogin({fetchImpl:async()=>Response.json({},{status:403})}),/HTTP 403/);assert.equal(listCodexAccounts().length,0);
 const login=await startCodexLogin({fetchImpl:async()=>Response.json({device_auth_id:'d',user_code:'c',interval:1})});await assert.rejects(completeCodexLogin(login,{fetchImpl:async()=>Response.json({error:'access_denied'},{status:400})}),/HTTP 400/);assert.equal(listCodexAccounts().length,0);
});
test('device polling respects abort including waiting interval',async()=>{
 const c=new AbortController();const login=await startCodexLogin({fetchImpl:async()=>Response.json({device_auth_id:'d',user_code:'c',interval:10})});const run=completeCodexLogin(login,{signal:c.signal,fetchImpl:async()=>Response.json({},{status:403})});setTimeout(()=>c.abort(),1);await assert.rejects(run,{name:'AbortError'});assert.equal(listCodexAccounts().length,0);
});
test('separate accounts, same email, explicit switching and credential export for encrypted vault',async()=>{
 register('a');register('b');assert.equal(listCodexAccounts().length,2);setActiveCodexAccount('b');assert.equal(getCodexAccount().id,'b');assert.equal(await getCodexAccount('a').accessToken(),token('a'));assert.equal(getCodexAccount('b').exportTokens().refresh_token,'fixture-refresh-b');assert.ok(!JSON.stringify(listCodexAccounts()).includes('fixture-refresh'));removeCodexAccount('b');assert.equal(getCodexAccount().id,'a');
});
test('refresh rotates once per account and exported tokens restore correctly',async()=>{
 const a=register('a',{expiresAt:0});let requests=0;let release;const gate=new Promise(r=>release=r);const fetchImpl=async(url,o)=>{requests++;assert.equal(url,CODEX_ENDPOINTS.token);const body=new URLSearchParams(o.body);assert.equal(body.get('client_id'),CODEX_CLIENT_ID);await gate;return Response.json({access_token:token('a',{generation:2}),refresh_token:'rotated',expires_in:3600});};
 const pending=[a.accessToken({fetchImpl}),a.accessToken({fetchImpl})];release();assert.deepEqual(await Promise.all(pending),[token('a',{generation:2}),token('a',{generation:2})]);assert.equal(requests,1);const exported=getCodexAccount('a').exportTokens();removeCodexAccount('a');registerCodexAccount('a',exported);assert.equal(getCodexAccount('a').exportTokens().refresh_token,'rotated');
});
test('one waiting caller abort does not cancel the shared refresh for another caller',async()=>{
 const a=register('a',{expiresAt:0});let release;const gate=new Promise(r=>release=r),c=new AbortController();const fetchImpl=async()=>{await gate;return Response.json({access_token:token('a'),expires_in:3600});};const first=a.accessToken({signal:c.signal,fetchImpl}),second=a.accessToken({fetchImpl});c.abort();release();await assert.rejects(first,{name:'AbortError'});assert.equal(await second,token('a'));
});
test('removed account cannot be resurrected by late refresh',async()=>{
 const a=register('a',{expiresAt:0});let release;const gate=new Promise(r=>release=r);const run=a.accessToken({fetchImpl:async()=>{await gate;return Response.json({access_token:token('a')});}});removeCodexAccount('a');release();await assert.rejects(run);assert.equal(hasCodexAccount('a'),false);
});
test('account mismatch and stale wrapper cannot access another registration',async()=>{
 assert.throws(()=>registerCodexAccount('a',{access_token:token('b'),accountId:'a'}),/不匹配/);const old=register('a');register('a');assert.throws(()=>old.exportTokens(),/替换/);assert.throws(()=>old.accessToken(),/替换/);
});
test('models are fetched per selected account; catalog is not entitlement',async()=>{
 register('a');register('b');const out=await discoverCodexModels({accountId:'b',fetchImpl:async(url,o)=>{assert.equal(new URL(url).pathname,'/backend-api/codex/models');assert.equal(o.headers['chatgpt-account-id'],'b');assert.equal(o.headers.authorization,'Bearer '+token('b'));return Response.json({models:[{slug:'fixture',display_name:'Fixture',context_window:1048576}]});}});assert.equal(out[0].id,'fixture');assert.equal(out[0].catalogOnly,true);assert.equal(out[0].contextWindowTokens,1048576);
});
test('Responses SSE text fragments, usage, account headers and fixed endpoint',async()=>{
 register();let deltas='';const result=await callCodexModel({provider,messages:[{role:'system',text:'phone rules'},{role:'user',text:'hello'}],onDelta:s=>deltas+=s,fetchImpl:async(url,o)=>{assert.equal(url,CODEX_ENDPOINTS.responses);assert.equal(o.headers['chatgpt-account-id'],'a');assert.equal(o.headers.originator,'iphone_automation_harness');const body=JSON.parse(o.body);assert.equal(body.instructions,'phone rules');assert.equal(body.store,false);assert.equal(body.stream,true);return response([{type:'response.output_text.delta',delta:'手机'},completed()]);}});assert.equal(result.text,'手机完成');assert.equal(deltas,'手机完成');assert.equal(result.usage.input_tokens,7);assert.equal(result.finish,'stop');
});
test('function calls only emerge after valid completed event',async()=>{
 register();const item={type:'function_call',id:'item',call_id:'call',name:'phone_observe',arguments:'{}'};const result=await callCodexModel({provider,messages:[],tools:[{name:'phone_observe',description:'observe',schema:{type:'object'}}],fetchImpl:async()=>response([{type:'response.output_item.added',item:{...item,arguments:''}},{type:'response.function_call_arguments.delta',item_id:'item',delta:'{'},{type:'response.function_call_arguments.done',item_id:'item',arguments:'{}'},completed([item])])});assert.deepEqual(result.toolCalls,[{id:'call',name:'phone_observe',arguments:{}}]);assert.equal(result.finish,'tool_calls');
});
test('missing, incomplete and failed terminal events cannot produce executable calls',async()=>{
 register();for(const events of [[{type:'response.output_text.delta',delta:'partial'}],[{type:'response.incomplete',response:{status:'incomplete'}}],[{type:'response.failed',response:{status:'failed'}}],[{type:'response.completed',response:{status:'in_progress'}}]])await assert.rejects(callCodexModel({provider,messages:[],fetchImpl:async()=>response(events)}));
});
test('invalid scalar tool JSON and duplicate IDs are rejected',async()=>{
 register();for(const output of [[{type:'function_call',call_id:'x',name:'read',arguments:'null'}],[{type:'function_call',call_id:'x',name:'read',arguments:'{' }],[{type:'function_call',call_id:'x',name:'read',arguments:'{}'},{type:'function_call',call_id:'x',name:'read',arguments:'{}'}]])await assert.rejects(callCodexModel({provider,messages:[],fetchImpl:async()=>response([completed(output)])}),/工具/);
});
test('cancelled request ignores a late successful reply',async()=>{
 register();const c=new AbortController();await assert.rejects(callCodexModel({provider,messages:[],signal:c.signal,fetchImpl:async()=>{c.abort();return response([completed()]);}}),{name:'AbortError'});
});
test('UI delta callback exceptions do not prevent a valid response',async()=>{register();const r=await callCodexModel({provider,messages:[],onDelta:()=>{throw new Error('UI failure')},fetchImpl:async()=>response([{type:'response.output_text.delta',delta:'手机'},completed()])});assert.equal(r.text,'手机完成');});
test('HTTP and transport errors never echo token or provider response body',async()=>{
 register();await assert.rejects(callCodexModel({provider,messages:[],fetchImpl:async()=>Response.json({secret:token('a')},{status:401})}),e=>e.message.includes('401')&&!e.message.includes(token('a')));await assert.rejects(callCodexModel({provider,messages:[],fetchImpl:async()=>{throw new Error(token('a'))}}),e=>!e.message.includes(token('a')));
});
test('Responses encodes all tool outputs before attached observation images',async()=>{
 register();await callCodexModel({provider,messages:[{role:'assistant',toolCalls:[{id:'a1',name:'see',arguments:{}},{id:'a2',name:'read',arguments:{}}]},{role:'tool',toolCallId:'a1',text:'frame',images:['data:image/jpeg;base64,YQ==']},{role:'tool',toolCallId:'a2',text:'done'},{role:'user',text:'continue'}],fetchImpl:async(url,o)=>{const input=JSON.parse(o.body).input;assert.deepEqual(input.slice(2,4).map(x=>x.type),['function_call_output','function_call_output']);assert.equal(input[4].content[0].type,'input_image');return response([completed()]);}});
});
test('registered SIWC authorization uses fresh PKCE/state/nonce and issued client',async()=>{
 const a=await startCodexLogin({method:'authorization-code',hostId:'stable-host'}),b=await startCodexLogin({method:'authorization-code',hostId:'stable-host'});const u=new URL(a.authorizationUrl);assert.equal(u.searchParams.get('client_id'),'dynamic_agent_client');assert.equal(u.searchParams.get('agent_name_hint'),'iPhone Agent Harness');assert.notEqual(a.state,b.state);assert.notEqual(a.nonce,b.nonce);assert.notEqual(a.verifier,b.verifier);
 const returning=await startCodexLogin({method:'authorization-code',hostId:'stable-host',clientId:'oaiapp_fixture'});assert.equal(new URL(returning.authorizationUrl).searchParams.has('agent_name_hint'),false);
 await assert.rejects(completeCodexLogin(a,{callbackUrl:a.redirectUri+'?code=c&state=wrong&client_id=oaiapp_fixture',fetchImpl:async()=>{throw new Error('must not fetch')}}),/state/);
});
test('SIWC code exchange validates signed ID token and direct plan scope',async()=>{
 const login=await startCodexLogin({method:'authorization-code',hostId:'stable-host'});const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);jwk.kid='fixture';
 const head=b64({alg:'RS256',kid:'fixture'}),claims=b64({iss:'https://auth.openai.com',sub:'subject',aud:'oaiapp_fixture',nonce:login.nonce,exp:Math.floor(Date.now()/1000)+3600,email:'same@example.invalid'});const sig=Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,enc.encode(head+'.'+claims))).toString('base64url');
 const account=await completeCodexLogin(login,{accountId:'plan',callbackUrl:login.redirectUri+'?code=c&state='+login.state+'&client_id=oaiapp_fixture',loadPublicKeys:async()=>({keys:[jwk]}),fetchImpl:async(url,o)=>{if(url===CODEX_ENDPOINTS.planToken){assert.equal(new URLSearchParams(o.body).get('client_id'),'oaiapp_fixture');return Response.json({access_token:'opaque-plan-token',refresh_token:'fixture-plan-refresh',id_token:head+'.'+claims+'.'+sig,scope:'openid chatgpt.tokens.use.direct',expires_in:3600});}throw new Error('Unexpected credential fetch destination');}});
 assert.equal(account.flow,'chatgpt-plan');assert.equal(account.identityVerified,true);assert.equal(account.clientId,'oaiapp_fixture');await callCodexModel({provider:{accountId:'plan',model:'fixture'},messages:[],fetchImpl:async(url,o)=>{assert.equal(url,'https://igent.cc/api/openai/responses');assert.equal(o.headers.authorization,'Bearer opaque-plan-token');return response([completed()]);}});
});
test('SIWC refresh keeps issued client and resource, and missing scope is rejected',async()=>{
 assert.throws(()=>registerCodexAccount('bad',{access_token:'fake',flow:'chatgpt-plan',clientId:'oaiapp_fixture',identityVerified:true}),/授权/);
 const a=registerCodexAccount('plan',{access_token:'opaque',refresh_token:'fixture',flow:'chatgpt-plan',clientId:'oaiapp_fixture',identityVerified:true,scopes:['chatgpt.tokens.use.direct'],expiresAt:0});await a.accessToken({fetchImpl:async(url,o)=>{assert.equal(url,CODEX_ENDPOINTS.planToken);const form=new URLSearchParams(o.body);assert.equal(form.get('client_id'),'oaiapp_fixture');assert.equal(form.get('resource'),'https://api.openai.com/v1');return Response.json({access_token:'new-opaque',refresh_token:'next',expires_in:3600});}});assert.equal(getCodexAccount('plan').exportTokens().refresh_token,'next');
});

test('token observers support multiple subscribers and unsubscribe without raw credentials',async()=>{
 const events=[],second=[];const firstOff=setCodexTokenObserver(e=>events.push(e)),secondOff=setCodexTokenObserver(e=>second.push(e));
 try{firstOff();const a=register('a',{expiresAt:0});await a.accessToken({fetchImpl:async()=>Response.json({access_token:token('a'),refresh_token:'new-secret-fixture',expires_in:3600})});assert.equal(events.length,0);assert.deepEqual(second,[{id:'a',event:'refreshed'}]);assert.deepEqual(Object.keys(second[0]).sort(),['event','id']);assert.ok(!JSON.stringify(second).includes('new-secret-fixture'));}finally{firstOff();secondOff();}
});
test('throwing and rejecting token observers do not break refresh or other observers',async()=>{
 let exported;const off1=setCodexTokenObserver(()=>{throw new Error('observer failed')}),off2=setCodexTokenObserver(async()=>{throw new Error('async observer failed')}),off3=setCodexTokenObserver(e=>{exported=getCodexAccount(e.id).exportTokens();});
 try{const a=register('a',{expiresAt:0});assert.equal(await a.accessToken({fetchImpl:async()=>Response.json({access_token:token('a'),refresh_token:'rotated-observer-fixture',expires_in:3600})}),token('a'));await new Promise(r=>setTimeout(r,0));assert.equal(exported.refresh_token,'rotated-observer-fixture');}finally{off1();off2();off3();}
});
test('stateless Codex preserves encrypted reasoning and assistant phase without rendering hidden state',async()=>{
 register();let visible='';const reasoning={type:'reasoning',id:'rs_fixture',summary:[],encrypted_content:'opaque-fixture-signature'};
 const message={type:'message',id:'msg_fixture',role:'assistant',phase:'final_answer',status:'completed',content:[{type:'output_text',text:'ready'}]};
 const first=await callCodexModel({provider,messages:[{role:'user',text:'first'}],onDelta:d=>visible+=d,fetchImpl:async(url,o)=>{assert.deepEqual(JSON.parse(o.body).include,['reasoning.encrypted_content']);return response([completed([reasoning,message])]);}});
 assert.equal(first.text,'ready');assert.equal(visible,'ready');assert.equal(first.providerState.kind,'codex-responses/1');assert.deepEqual(first.providerState.items,[reasoning,message]);
 await callCodexModel({provider,messages:[{role:'user',text:'first'},{role:'assistant',text:first.text,toolCalls:first.toolCalls,providerState:first.providerState},{role:'user',text:'next'}],fetchImpl:async(url,o)=>{const input=JSON.parse(o.body).input;assert.deepEqual(input.slice(1,3),[reasoning,message]);assert.equal(input.filter(i=>i.type==='message'&&i.role==='assistant').length,1);assert.equal(input.filter(i=>i.role==='assistant').length,1);return response([completed()]);}});
});
test('multi-step tool continuation replays reasoning and exactly one function call before result',async()=>{
 register();const reasoning={type:'reasoning',id:'rs_tool',summary:[],encrypted_content:'tool-opaque-fixture'};
 const call={type:'function_call',id:'fc_fixture',call_id:'call_fixture',name:'phone_observe',arguments:'{}',status:'completed'};
 const first=await callCodexModel({provider,messages:[{role:'user',text:'observe'}],fetchImpl:async()=>response([{type:'response.output_item.done',output_index:0,item:{...reasoning,encrypted_content:undefined}},completed([reasoning,call])])});
 assert.equal(first.providerState.items[0].encrypted_content,'tool-opaque-fixture');
 await callCodexModel({provider,messages:[{role:'user',text:'observe'},{role:'assistant',text:first.text,toolCalls:first.toolCalls,providerState:first.providerState},{role:'tool',toolCallId:'call_fixture',text:'observed'}],fetchImpl:async(url,o)=>{const input=JSON.parse(o.body).input;assert.deepEqual(input.slice(1,3),[reasoning,call]);assert.equal(input.filter(i=>i.type==='function_call').length,1);assert.equal(input[3].type,'function_call_output');assert.equal(input[3].call_id,'call_fixture');return response([completed()]);}});
});
test('opaque state cannot cross account, endpoint origin, model, flow or client registration',async()=>{
 register();const first=await callCodexModel({provider,messages:[],fetchImpl:async()=>response([completed([{type:'reasoning',id:'rs',summary:[],encrypted_content:'do-not-cross'}, {type:'message',role:'assistant',content:[{type:'output_text',text:'answer'}]}])])});
 for(const patch of [{accountId:'other'},{origin:'https://api.openai.com'},{model:'other-model'},{flow:'chatgpt-plan'},{clientId:'other-client'},{kind:'other-provider'}]){
  await callCodexModel({provider,messages:[{role:'assistant',text:'answer',toolCalls:[],providerState:{...first.providerState,...patch}}],fetchImpl:async(url,o)=>{const body=JSON.parse(o.body);assert.ok(!JSON.stringify(body.input).includes('do-not-cross'));assert.equal(body.input[0].content[0].text,'answer');return response([completed()]);}});
 }
});
test('edited messages do not resurrect stale opaque text or tool instructions',async()=>{
 register();const first=await callCodexModel({provider,messages:[],fetchImpl:async()=>response([completed([{type:'reasoning',id:'r',summary:[],encrypted_content:'old-state'}, {type:'message',role:'assistant',content:[{type:'output_text',text:'old answer'}]}])])});
 await callCodexModel({provider,messages:[{role:'assistant',text:'edited answer',providerState:first.providerState}],fetchImpl:async(url,o)=>{const input=JSON.parse(o.body).input;assert.ok(!JSON.stringify(input).includes('old-state'));assert.equal(input[0].content[0].text,'edited answer');return response([completed()]);}});
});
test('oversized SSE event is rejected and its reader is cancelled and released',async()=>{
 register();let cancelled=0;const body=new ReadableStream({start(c){c.enqueue(enc.encode('data: '+ 'x'.repeat(2000001)));},cancel(){cancelled++;}});
 await assert.rejects(callCodexModel({provider,messages:[],fetchImpl:async()=>new Response(body)}),/容量/);assert.equal(cancelled,1);assert.equal(body.locked,false);
});
test('cumulative text, tool arguments, tool count and opaque state have independent limits',async()=>{
 register();const longDelta={type:'response.output_text.delta',delta:'x'.repeat(600000)};
 await assert.rejects(callCodexModel({provider,messages:[],fetchImpl:async()=>response([longDelta,longDelta],65536)}),/容量/);
 const many=Array.from({length:9},(_,i)=>({type:'response.output_item.added',output_index:i,item:{type:'function_call',id:'item'+i,call_id:'call'+i,name:'read',arguments:'{}'}}));
 await assert.rejects(callCodexModel({provider,messages:[],fetchImpl:async()=>response(many,65536)}),/数量/);
 await assert.rejects(callCodexModel({provider,messages:[],fetchImpl:async()=>response([{type:'response.output_item.added',output_index:0,item:{type:'function_call',id:'large',call_id:'large',name:'read',arguments:'x'.repeat(64001)}}],65536)}),/容量/);
 await assert.rejects(callCodexModel({provider,messages:[],fetchImpl:async()=>response([completed([{type:'reasoning',id:'large',encrypted_content:'x'.repeat(1000001),summary:[]},{type:'message',role:'assistant',content:[{type:'output_text',text:'ok'}]}])],65536)}),/容量/);
});
test('oversized subscription JSON and local opaque replay are rejected without echoing content',async()=>{
 register();await assert.rejects(discoverCodexModels({accountId:'a',fetchImpl:async()=>new Response('x'.repeat(2000001))}),/容量/);
 const state={kind:'codex-responses/1',origin:'https://chatgpt.com',accountId:'a',backendAccountId:'a',clientId:CODEX_CLIENT_ID,flow:'codex',model:provider.model,items:[{type:'reasoning',id:'r',summary:[],encrypted_content:'x'.repeat(1000001)},{type:'message',role:'assistant',content:[{type:'output_text',text:'ok'}]}]};let calls=0;
 await assert.rejects(callCodexModel({provider,messages:[{role:'assistant',text:'ok',providerState:state}],fetchImpl:async()=>{calls++;return response([completed()]);}}),/容量/);assert.equal(calls,0);
});
test('aborting a pending response read cancels and unlocks the reader',async()=>{
 register();let began,cancelled=0;const entered=new Promise(r=>began=r),controller=new AbortController();const body=new ReadableStream({pull(){began();},cancel(){cancelled++;}});
 const pending=callCodexModel({provider,messages:[],signal:controller.signal,fetchImpl:async()=>new Response(body)});await entered;controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(cancelled,1);assert.equal(body.locked,false);
});


test('subscription HTTP and SSE context-window failures carry the recovery code without raw server text',async()=>{
 register();for(const fetchImpl of [async()=>Response.json({error:{code:'context_length_exceeded',message:'raw sensitive request text'}},{status:400}),async()=>response([{type:'response.failed',response:{error:{code:'context_length_exceeded',message:'raw sensitive request text'}}}])])await assert.rejects(callCodexModel({provider,messages:[],fetchImpl}),e=>e.code==='CONTEXT_WINDOW_EXCEEDED'&&!e.message.includes('sensitive'));
});

test('Codex catalog GET uses only JSON accept and account-scoped authorization headers',async()=>{
 register('a');register('b');const original=getCodexAccount('b').exportTokens();
 const result=await discoverCodexModels({accountId:'b',clientVersion:'0.1.0',fetchImpl:async(url,options)=>{
  assert.equal(new URL(url).origin,'https://chatgpt.com');assert.equal(new URL(url).pathname,'/backend-api/codex/models');assert.equal(new URL(url).searchParams.get('client_version'),'0.1.0');
  assert.equal(options.method||'GET','GET');assert.equal(options.body,undefined);assert.equal(options.credentials,'omit');
  assert.deepEqual(options.headers,{authorization:'Bearer '+token('b'),accept:'application/json','chatgpt-account-id':'b'});
  return Response.json({models:[{slug:'older-unlabelled',display_name:'Older model'},{slug:'hidden',visibility:'hide'},{slug:'listed',visibility:'list',context_window:100000}]});
 }});
 assert.deepEqual(result.map(item=>item.id),['older-unlabelled','listed']);assert.equal(result[1].contextWindowTokens,100000);assert.deepEqual(getCodexAccount('b').exportTokens(),original);
});

test('ChatGPT plan catalog keeps only list-visible models in server order without Codex inference headers',async()=>{
 registerCodexAccount('plan-catalog',{access_token:'fixture-plan-access',flow:'chatgpt-plan',clientId:'oaiapp_fixture',identityVerified:true,scopes:['chatgpt.tokens.use.direct'],expires_in:3600});
 const result=await discoverCodexModels({accountId:'plan-catalog',fetchImpl:async(url,options)=>{
  assert.equal(url,'https://igent.cc/api/openai/models');assert.deepEqual(options.headers,{authorization:'Bearer fixture-plan-access',accept:'application/json'});
  return Response.json({models:[{slug:'second',display_name:'Second listed model',visibility:'list'},{slug:'hidden',visibility:'hide'},{slug:'unlabelled'},{slug:'first',visibility:'list'},{slug:'unknown-visibility',visibility:'other'},null,{visibility:'list'}]});
 }});
 assert.deepEqual(result.map(item=>item.id),['second','first']);assert.equal(result[0].name,'Second listed model');assert.ok(result.every(item=>item.catalogOnly));assert.equal(getCodexAccount('plan-catalog').flow,'chatgpt-plan');
});

test('legacy Codex data-array catalogs without visibility remain usable',async()=>{
 register('a');const result=await discoverCodexModels({accountId:'a',fetchImpl:async()=>Response.json({data:[{id:'old-a'},{id:'old-b',visibility:'list'},{id:'hidden',visibility:'hide'}]})});assert.deepEqual(result.map(item=>item.id),['old-a','old-b']);assert.equal(getCodexAccount('a').flow,'codex');
});

test('legacy inference preserves Codex routing headers and rejects credential redirects',async()=>{
 register('a');await callCodexModel({provider,messages:[],sessionId:'legacy-session',fetchImpl:async(url,options)=>{assert.deepEqual(options.headers,{authorization:'Bearer '+token('a'),'content-type':'application/json',accept:'text/event-stream',originator:'iphone_automation_harness','chatgpt-account-id':'a','OpenAI-Beta':'responses=experimental','session-id':'legacy-session'});assert.equal(options.redirect,'error');return response([completed()]);}});
});
