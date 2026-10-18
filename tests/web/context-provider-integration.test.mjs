import test from 'node:test';
import assert from 'node:assert/strict';
import {callModel,discoverModels} from '../../apps/web/core/providers.js';
import {resolveModelSelection} from '../../apps/web/core/models.js';
import {contextOverflowError} from '../../apps/web/core/provider-errors.js';
import {createHarness} from '../../apps/web/core/harness.js';
import {openStore} from '../../apps/web/core/store.js';

const provider={id:'p',protocol:'openai',baseUrl:'https://models.example/v1',model:'m',stream:false};
test('discovered context capacity survives model selection and malformed capacities are not guessed',async()=>{
 const models=await discoverModels({...provider,fetchImpl:async()=>Response.json({data:[{id:'m',context_window:131072},{id:'unknown'},{id:'invalid',context_length:'1000000'}]})});
 assert.equal(models[0].contextWindowTokens,131072);assert.equal(models[1].contextWindowTokens,undefined);assert.equal(models[2].contextWindowTokens,undefined);
 const selected=resolveModelSelection({providers:[{...provider,models}]},'p::m');assert.equal(selected.contextWindowTokens,131072);
});
test('OpenAI and Anthropic context overflow errors are actionable without exposing raw provider response',async()=>{
 for(const [protocol,error]of [['openai',{code:'context_length_exceeded',message:'maximum context length; secret request contents'}],['anthropic',{type:'invalid_request_error',message:'prompt is too long: 100000 tokens; secret request contents'}]]){
  await assert.rejects(callModel({provider:{...provider,protocol},messages:[{role:'user',text:'test'}],fetchImpl:async()=>Response.json({error},{status:400})}),e=>e.code==='CONTEXT_WINDOW_EXCEEDED'&&!e.message.includes('secret'));
 }
 assert.equal(contextOverflowError({error:{type:'invalid_request_error',message:'Malformed tools schema'}}),null);
});
async function conversation(){const store=await openStore({memory:true});await store.saveSettings({providers:[provider],activeProviderId:'p',context:{schemaVersion:2,triggerTokens:750000}});const session=await store.createSession({mode:'chat'});for(let i=0;i<16;i++)await store.addMessage(session.id,{role:i%2?'assistant':'user',text:`history-${i} `+'detail '.repeat(600)});return {store,session};}
test('a server-confirmed overflow summarizes once and retries the current model request before any tools execute',async()=>{
 const {store,session}=await conversation();let requests=0,summaries=0;const lengths=[];
 const harness=createHarness({store,invoke:async args=>{
  if(args.tools.length===0){summaries++;return {text:'Earlier conversation summary: preserve task and observed results.',toolCalls:[]};}
  lengths.push(JSON.stringify(args.messages).length);
  if(++requests===1)throw Object.assign(new Error('CONTEXT_WINDOW_EXCEEDED'),{code:'CONTEXT_WINDOW_EXCEEDED'});
  return {text:'Continued after compaction.',toolCalls:[]};
 }});
 await harness.run({sessionId:session.id,text:'Continue with the same task.'});assert.equal(requests,2);assert.ok(summaries>0&&summaries<=4,`unexpected ${summaries} summary requests`);assert.ok(lengths[1]<lengths[0]);
 assert.equal((await store.getSession(session.id)).checkpoint.kind,'model-summary');assert.equal((await store.getMessages(session.id)).filter(m=>m.role==='assistant'&&m.text==='Continued after compaction.').length,1);
});
test('a second overflow does not loop, and disabled compaction never makes summary requests',async()=>{
 for(const enabled of [true,false]){const {store,session}=await conversation();await store.saveSettings({context:{schemaVersion:2,autoCompact:enabled,triggerTokens:750000}});let requests=0,summaries=0;
 const harness=createHarness({store,invoke:async args=>{if(args.tools.length===0){summaries++;return {text:'Useful earlier summary.',toolCalls:[]};}requests++;throw Object.assign(new Error('CONTEXT_WINDOW_EXCEEDED'),{code:'CONTEXT_WINDOW_EXCEEDED'});}});
 await assert.rejects(harness.run({sessionId:session.id,text:'Continue.'}),/CONTEXT_WINDOW_EXCEEDED/);assert.equal(requests,enabled?2:1);if(!enabled)assert.equal(summaries,0);
 }
});
