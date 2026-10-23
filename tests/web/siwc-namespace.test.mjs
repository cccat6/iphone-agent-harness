import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {registerCodexAccount,clearCodexAccounts,callCodexModel,CODEX_ENDPOINTS,CODEX_TOOL_NAMESPACE} from '../../apps/web/core/codex.js';
const tools=[{name:'phone_observe',description:'Read the current phone screen.',schema:{type:'object',properties:{},additionalProperties:false}}];
const output=items=>new Response('data: '+JSON.stringify({type:'response.completed',response:{id:'response',status:'completed',output:items}})+'\n\n',{headers:{'content-type':'text/event-stream'}});
const call={type:'function_call',id:'item',call_id:'call',namespace:'harness',name:'phone_observe',arguments:'{}',status:'completed'};
const message={type:'message',role:'assistant',content:[{type:'output_text',text:'Done'}]};
const provider={accountId:'plan',model:'fixture'};
beforeEach(()=>{clearCodexAccounts();registerCodexAccount('plan',{flow:'chatgpt-plan',clientId:'oaiapp_fixture',identityVerified:true,scope:'chatgpt.tokens.use.direct',access_token:'fixture-plan-access',expires_in:3600});});
test('plan tools are grouped under the fixed namespace while local tool calls keep their original names',async()=>{
 const result=await callCodexModel({provider,messages:[{role:'user',text:'Look at the screen'}],tools,fetchImpl:async(url,options)=>{
  assert.equal(url,'https://igent.cc/api/openai/responses');const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.stream,true);assert.equal(body.tools.length,1);
  assert.equal(body.tools[0].type,'namespace');assert.equal(body.tools[0].name,CODEX_TOOL_NAMESPACE);assert.deepEqual(body.tools[0].tools,[{type:'function',name:'phone_observe',description:tools[0].description,parameters:tools[0].schema,strict:false}]);
  return output([call]);
 }});
 assert.deepEqual(result.toolCalls,[{id:'call',name:'phone_observe',arguments:{}}]);assert.equal(result.providerState.items[0].namespace,'harness');
});
test('plan response rejects missing or foreign namespaces and tools that were not offered',async()=>{
 for(const changed of [{namespace:undefined},{namespace:'other'},{namespace:''},{namespace:'harness',name:'phone_execute_plan'}])await assert.rejects(callCodexModel({provider,messages:[],tools,fetchImpl:async()=>output([{...call,...changed}])}),/工具调用身份/);
});
test('a resumed plan preserves namespace and pairs its result by the exact call ID',async()=>{
 const first=await callCodexModel({provider,messages:[{role:'user',text:'Observe'}],tools,fetchImpl:async()=>output([call])});
 const history=[{role:'assistant',text:first.text,toolCalls:first.toolCalls,providerState:first.providerState},{role:'tool',toolCallId:'call',text:'Screen observed'}];
 await callCodexModel({provider,messages:history,tools,fetchImpl:async(url,options)=>{const {input}=JSON.parse(options.body);assert.deepEqual(input[0],call);assert.deepEqual(input[1],{type:'function_call_output',call_id:'call',output:'Screen observed'});return output([message]);}});
});
test('plan history rebuilt without opaque state still emits a namespaced function call',async()=>{
 await callCodexModel({provider,tools,messages:[{role:'assistant',text:'',toolCalls:[{id:'old-call',name:'phone_observe',arguments:{}}]},{role:'tool',toolCallId:'old-call',text:'Observed'}],fetchImpl:async(url,options)=>{const {input}=JSON.parse(options.body);assert.deepEqual(input[0],{type:'function_call',call_id:'old-call',name:'phone_observe',namespace:'harness',arguments:'{}'});assert.equal(input[1].call_id,'old-call');return output([message]);}});
});
test('foreign opaque namespaces are dropped rather than replayed into a plan request',async()=>{
 const first=await callCodexModel({provider,tools,messages:[],fetchImpl:async()=>output([call])});first.providerState.items[0].namespace='foreign';
 await callCodexModel({provider,tools,messages:[{role:'assistant',text:'',toolCalls:first.toolCalls,providerState:first.providerState}],fetchImpl:async(url,options)=>{const {input}=JSON.parse(options.body);assert.equal(input[0].namespace,'harness');assert.equal(input[0].id,undefined);assert.ok(!JSON.stringify(input).includes('foreign'));return output([message]);}});
});
test('plain plan conversations send no namespace object when there are no tools',async()=>{
 await callCodexModel({provider,messages:[{role:'user',text:'Hello'}],fetchImpl:async(url,options)=>{const body=JSON.parse(options.body);assert.deepEqual(body.tools,[]);assert.equal(body.tool_choice,'none');return output([message]);}});
});

test('plan inference keeps native-only headers absent while passing stable cache affinity',async()=>{
 await callCodexModel({provider,messages:[],sessionId:'local-session-identifier',fetchImpl:async(url,options)=>{assert.equal(url,'https://igent.cc/api/openai/responses');assert.deepEqual(options.headers,{authorization:'Bearer fixture-plan-access','content-type':'application/json',accept:'text/event-stream','session-id':'local-session-identifier'});assert.equal(options.redirect,'error');return output([message]);}});
});
