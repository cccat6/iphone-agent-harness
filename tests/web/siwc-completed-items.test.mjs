import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {registerCodexAccount,clearCodexAccounts,callCodexModel} from '../../apps/web/core/codex.js';
const provider={accountId:'plan',model:'fixture'},tools=[{name:'report_color',schema:{type:'object',properties:{color:{type:'string'}}}}];
const item={type:'function_call',id:'item1',call_id:'call1',namespace:'harness',name:'report_color',arguments:'{"color":"red"}',status:'completed'};
const added={type:'response.output_item.added',output_index:1,item:{...item,arguments:'',status:'in_progress'}},argsDone={type:'response.function_call_arguments.done',item_id:item.id,arguments:item.arguments},itemDone={type:'response.output_item.done',output_index:1,item};
const complete=output=>({type:'response.completed',response:{id:'response1',status:'completed',...(output===undefined?{}:{output})}});
const stream=events=>new Response(events.map(event=>'data: '+JSON.stringify(event)+'\n\n').join(''));
const call=(events,extra={})=>callCodexModel({provider,tools,messages:[],fetchImpl:async()=>stream(events),...extra});
beforeEach(()=>{clearCodexAccounts();registerCodexAccount('plan',{access_token:'synthetic',expires_in:3600,scope:'chatgpt.tokens.use.direct'},{flow:'chatgpt-plan',clientId:'oaiapp_fixture',identityVerified:true});});
test('real SIWC event shape: completed item survives empty or omitted terminal output',async()=>{
 for(const output of [[],undefined]){const result=await call([added,argsDone,itemDone,complete(output)]);assert.deepEqual(result.toolCalls,[{id:'call1',name:'report_color',arguments:{color:'red'}}]);assert.deepEqual(result.providerState.items,[item]);assert.equal(result.finish,'tool_calls');}
});
test('completed reasoning, message and function items rebuild ordered replay and tool-result pairing',async()=>{
 const reasoning={id:'reason1',type:'reasoning',encrypted_content:'synthetic-encrypted'},message={id:'message1',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Looking'}]};
 const result=await call([added,argsDone,itemDone,{type:'response.output_item.done',output_index:0,item:reasoning},{type:'response.output_item.done',output_index:2,item:message},complete([])]);assert.deepEqual(result.providerState.items,[reasoning,item,message]);assert.equal(result.text,'Looking');
 await call([complete([{...message,content:[{type:'output_text',text:'Done'}]}])],{messages:[{role:'assistant',text:result.text,toolCalls:result.toolCalls,providerState:result.providerState},{role:'tool',toolCallId:'call1',text:'Color accepted'}],fetchImpl:async(url,options)=>{const input=JSON.parse(options.body).input;assert.deepEqual(input.slice(0,3),[reasoning,item,message]);assert.equal(input[3].call_id,'call1');assert.equal(input[3].type,'function_call_output');return stream([complete([{...message,content:[{type:'output_text',text:'Done'}]}])]);}});
});
test('valid JSON deltas or argument-done alone cannot substitute for completed output item',async()=>{
 for(const events of [[added,{type:'response.function_call_arguments.delta',item_id:'item1',delta:item.arguments}],[added,argsDone]])for(const output of [[],undefined])await assert.rejects(call([...events,complete(output)]),/工具调用结束状态缺失/);
});
test('no completed terminal, incomplete, failed or cancelled responses never yield tools',async()=>{
 for(const ending of [[],[{type:'response.cancelled',response:{status:'cancelled'}}],[{type:'response.incomplete',response:{status:'incomplete'}}],[{type:'response.failed',response:{status:'failed'}}],[{type:'response.completed',response:{status:'in_progress',output:[]}}]])await assert.rejects(call([added,argsDone,itemDone,...ending]));
 const controller=new AbortController();await assert.rejects(call([],{signal:controller.signal,fetchImpl:async()=>{controller.abort();return stream([itemDone,complete([])]);}}),{name:'AbortError'});
});
test('completed-item identity, namespace, arguments and terminal conflicts are rejected',async()=>{
 for(const changed of [{call_id:'other-call'},{name:'other_tool'},{namespace:'other'},{arguments:'{"color":"blue"}'},{status:'in_progress'}])await assert.rejects(call([added,argsDone,{...itemDone,item:{...item,...changed}},complete([])]));
 await assert.rejects(call([added,argsDone,itemDone,complete([{...item,arguments:'{"color":"blue"}'}])]),/冲突/);
 await assert.rejects(call([itemDone,{...itemDone,item:{...item,arguments:'{"color":"blue"}'}},complete([])]),/冲突/);
 await assert.rejects(call([added,argsDone,{type:'response.function_call_arguments.delta',item_id:'item1',delta:' '},itemDone,complete([])]),/完成后/);
});
test('reconstructed items retain JSON-object, namespace and offered-tool validation',async()=>{
 for(const patch of [{arguments:'{'},{arguments:'null'},{namespace:'foreign'},{name:'not_offered'}])await assert.rejects(call([{...itemDone,item:{...item,...patch}},complete([])]));
 await assert.rejects(call([itemDone,{...itemDone,output_index:2,item:{...item,id:'other'}},complete([])]),/重复/);
});
test('full terminal output remains authoritative and accepts completed calls without streamed item events',async()=>{const result=await call([complete([item])]);assert.deepEqual(result.providerState.items,[item]);assert.equal(result.toolCalls.length,1);});
test('fallback preserves refusal and aggregate state size checks',async()=>{
 await assert.rejects(call([{type:'response.output_item.done',output_index:0,item:{id:'refused',type:'message',status:'completed',content:[{type:'refusal',refusal:'no'}]}},complete([])]),/拒绝/);
 await assert.rejects(call([{type:'response.output_item.done',output_index:0,item:{id:'reason',type:'reasoning',encrypted_content:'x'.repeat(1000001)}},complete([])]),/容量/);
});
test('text-only delta with an empty completed output still succeeds',async()=>{const result=await call([{type:'response.output_text.delta',delta:'OK'},complete([])]);assert.equal(result.text,'OK');assert.deepEqual(result.toolCalls,[]);assert.equal(result.finish,'stop');});
