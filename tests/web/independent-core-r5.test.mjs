import test from 'node:test';
import assert from 'node:assert/strict';
import {createMCPAccess,MCP_LIMITS} from '../../apps/web/core/mcp.js';
import {createHarness} from '../../apps/web/core/harness.js';
import {openStore} from '../../apps/web/core/store.js';
import {callModel,discoverModels} from '../../apps/web/core/providers.js';

const secret='r5-synthetic+credential/秘密-not-real';
const endpoint='https://review.invalid/mcp?route=public&api_key='+encodeURIComponent(secret);
const forms=[secret,encodeURIComponent(secret),encodeURI(secret),new URLSearchParams({v:secret}).toString().slice(2),endpoint,encodeURIComponent(endpoint)];
const assertSafe=value=>{const wire=JSON.stringify(value);for(const form of forms)assert.ok(!wire.includes(form),'Known credential appeared in model-facing or durable output');};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function enabled({result,onCall}={}){
 const requests=[];
 const access=createMCPAccess({fetchImpl:async(url,options)=>{
  const body=JSON.parse(options.body);requests.push(body);const reply=value=>Response.json({jsonrpc:'2.0',id:body.id,result:value});
  if(body.method==='initialize')return reply({protocolVersion:'2025-11-25'});
  if(body.method==='notifications/initialized')return new Response(null,{status:202});
  if(body.method==='tools/list')return reply({tools:[{name:'lookup',description:'metadata '+forms.join(' | '),inputSchema:{type:'object',properties:{value:{type:'string',description:'nested '+secret}},required:['value']}}]});
  if(onCall)return onCall({body,reply});
  return reply(result||{content:[{type:'text',text:'public'}]});
 }});
 access.configure({id:'server',name:'Label '+secret,url:endpoint,token:'r5-bearer-only'});await access.connect('server');access.setAllowedTools('server',['lookup']);access.setEnabled('server',true);
 return {access,requests};
}
async function harnessSetup(mode='task'){
 const store=await openStore({memory:true});await store.saveSettings({providers:[{id:'review',protocol:'openai',baseUrl:'https://offline.invalid/v1',model:'synthetic',stream:false}],activeProviderId:'review'});
 return {store,session:await store.createSession({mode})};
}

test('independent R5: catalog label/schema masking survives the real Harness list-to-history boundary',async()=>{
 const {access}=await enabled(),{store,session}=await harnessSetup('chat');let turns=0;
 await createHarness({store,mcp:access,invoke:async request=>{
  if(!turns++)return {text:'',toolCalls:[{id:'catalog',name:'mcp_list_tools',arguments:{serverId:'server'}}]};
  assertSafe(request.messages);const list=JSON.parse(request.messages.find(m=>m.toolCallId==='catalog').text);assert.match(list.tools[0].serverName,/\[redacted\]/);assert.match(list.tools[0].inputSchema.properties.value.description,/\[redacted\]/);return {text:'done',toolCalls:[]};
 }}).run({sessionId:session.id,text:'Inspect only the selected synthetic catalog.'});
 assert.equal(turns,2);assertSafe(await store.getMessages(session.id));assertSafe(await store.exportSession(session.id));
 assert.equal(access.getSnapshot()[0].url,endpoint);
});

test('independent R5: successful bounded text projection masks nested metadata and secrets at its cut boundary',async()=>{
 const echo=forms.join(' | '),{access,requests}=await enabled({result:{content:[{type:'text',text:'x'.repeat(60000)+echo+'y'.repeat(20000),annotations:{audience:['assistant'],echo}},{type:'text',text:'last '+echo}],structuredContent:{[secret]:{url:endpoint}},_meta:{echo}}});
 const result=await access.call({serverId:'server',name:'lookup',arguments:{value:'public'}},{mode:'task'});
 assert.equal(result.status,'returned');assert.equal(result.result.truncated,true);assertSafe(result);assert.equal(result.result.projection,'ordered_text_prefix');assert.ok(result.result.structuredContentOmitted.originalBytes>0);assert.ok(new TextEncoder().encode(JSON.stringify(result)).length<=MCP_LIMITS.resultBytes);assert.equal(requests.filter(r=>r.method==='tools/call').length,1);
});

test('independent R5: reconfiguration discards a late secret-bearing result and revokes old dispatch permissions',async()=>{
 const entered=deferred(),late=deferred(),{access,requests}=await enabled({onCall:async({reply})=>{entered.resolve();await late.promise;return reply({content:[{type:'text',text:secret}]});}});
 const pending=access.call({serverId:'server',name:'lookup',arguments:{value:'public'}},{mode:'task'});await entered.promise;
 access.configure({id:'server',url:'https://review.invalid/new?route=public',token:'replacement-synthetic'});
 await assert.rejects(pending,e=>e.code==='MCP_CALL_UNCERTAIN'&&e.unknown===true);
 late.resolve();await new Promise(r=>setImmediate(r));
 assert.equal(access.hasAuthorizedTools(),false);assert.deepEqual((await access.listForModel()).tools,[]);
 await assert.rejects(access.call({serverId:'server',name:'lookup',arguments:{value:'public'}},{mode:'task'}),e=>e.code==='MCP_NOT_AUTHORIZED'&&!e.unknown);
 assert.equal(requests.filter(r=>r.method==='tools/call').length,1);
});

test('independent R5: cancellation settles durable unknown once and ignores a late credential-bearing reply',async()=>{
 const entered=deferred(),late=deferred(),{access,requests}=await enabled({onCall:async({reply})=>{entered.resolve();await late.promise;return reply({content:[{type:'text',text:secret}]});}}),{store,session}=await harnessSetup();let turns=0;
 const harness=createHarness({store,mcp:access,invoke:async()=>{turns++;return {text:'',toolCalls:[{id:'first',name:'mcp_call',arguments:{serverId:'server',name:'lookup',arguments:{value:'public'}}},{id:'second',name:'mcp_call',arguments:{serverId:'server',name:'lookup',arguments:{value:'public'}}}]};}});
 const pending=harness.run({sessionId:session.id,text:'Execute the selected synthetic call once.'});await entered.promise;harness.stop();await assert.rejects(pending,e=>e.status==='cancelled');late.resolve();await new Promise(r=>setImmediate(r));
 const messages=await store.getMessages(session.id),first=messages.filter(m=>m.toolCallId==='first'),second=messages.filter(m=>m.toolCallId==='second');
 assert.equal(turns,1);assert.equal(requests.filter(r=>r.method==='tools/call').length,1);assert.equal(first.length,1);assert.equal(JSON.parse(first[0].text).status,'unknown');assert.equal(second.length,1);assert.equal(JSON.parse(second[0].text).status,'not_executed');assertSafe(messages);assert.equal(harness.running,false);
});

for(const protocol of ['openai','anthropic'])test(`independent R5: ${protocol} HTTP error codes preserve status and never expose a remote error body`,async()=>{
 const body='private remote error '+secret,fetchImpl=async()=>new Response(body,{status:429});
 await assert.rejects(discoverModels({protocol,baseUrl:'https://review.invalid/v1?route=public',fetchImpl}),e=>e.code==='PROVIDER_MODELS_HTTP'&&e.status===429&&e.message.endsWith('(HTTP 429)')&&!e.message.includes(secret));
 await assert.rejects(callModel({provider:{id:'review',protocol,baseUrl:'https://review.invalid/v1?route=public',model:'synthetic',stream:false},messages:[],fetchImpl}),e=>e.code==='PROVIDER_HTTP_ERROR'&&e.status===429&&e.message.endsWith('(HTTP 429)')&&!e.message.includes(secret));
});
