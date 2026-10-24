import test from 'node:test';
import assert from 'node:assert/strict';
import {callModel,PROVIDER_LIMITS} from '../../apps/web/core/providers.js';
import {executePhonePlan} from '../../apps/web/core/plan.js';

const packet=value=>'data: '+JSON.stringify(value)+'\n\n';
const provider={id:'review-account',model:'synthetic',baseUrl:'https://review.invalid/v1',stream:true};
// A surrogate pair may be split between complete SSE JSON strings. Count the
// reconstructed UTF-8 arguments, without penalizing a legitimate exact-limit call.
for(const protocol of ['openai','anthropic'])for(const over of [false,true])test(`independent R4: ${protocol} split-surrogate arguments ${over?'reject above':'accept at'} the exact UTF8 boundary`,async()=>{
 const prefix='{"q":"'+'x'.repeat(PROVIDER_LIMITS.toolArgumentBytes-12),suffix='"}';
 const chunks=[prefix+'\ud83d','\ude00'+(over?'你':'')+suffix];
 const complete=chunks.join('');assert.equal(new TextEncoder().encode(complete).length,PROVIDER_LIMITS.toolArgumentBytes+(over?3:0));
 const events=protocol==='openai'?[
  packet({choices:[{delta:{tool_calls:[{index:0,id:'call',function:{name:'synthetic_tool',arguments:chunks[0]}}]}}]}),
  packet({choices:[{delta:{tool_calls:[{index:0,function:{arguments:chunks[1]}}]},finish_reason:'tool_calls'}]}),'data: [DONE]\n\n',
 ]:[
  packet({type:'content_block_start',index:0,content_block:{type:'tool_use',id:'call',name:'synthetic_tool',input:{}}}),
  ...chunks.map(partial_json=>packet({type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json}})),
  packet({type:'message_delta',delta:{stop_reason:'tool_use'}}),packet({type:'message_stop'}),
 ];
 const request=()=>callModel({provider:{...provider,protocol},messages:[],fetchImpl:async()=>new Response(events.join(''))});
 if(over)await assert.rejects(request(),e=>e.code==='PROVIDER_RESPONSE_LIMIT');
 else assert.deepEqual((await request()).toolCalls[0].arguments,JSON.parse(complete));
});

test('independent R4: post-hash capability reduction rejects the whole batch before any input',async()=>{
 const plan={version:1,planId:'plan',sessionId:'session',boardId:'board',targetId:'phone',basedOnFrameId:'frame',orientationEpoch:1,ttlMs:15000,maxExecutionMs:1000,steps:[{id:'tap',op:'tap',point:{x:4000,y:5000},holdMs:100},{id:'home',op:'home',settleMs:0}]};
 const caps={operations:['tap','home'],maxHoldMs:3000,maxRequestBytes:8192};
 const context={mode:'task',sessionId:'session',boardId:'board',bootId:'boot',clientId:'client',targetId:'phone',leaseId:'lease',orientationEpoch:1,identityVerified:true,bindingVerified:true,leaseVerified:true,executionEnabled:true,inputState:'released',knownFrames:new Map([['frame',{targetId:'phone',orientationEpoch:1}]]),capabilities:caps};
 let checks=0,submissions=0;
 context.getState=async()=>({...context,capabilities:++checks>=3?{...caps,operations:['tap']}:caps});
 const result=await executePhonePlan(plan,{context,device:{async submitSegment(){submissions++;throw new Error('unexpected dispatch');},async getResult(){throw new Error('unexpected receipt lookup');},async release(){throw new Error('unexpected release before dispatch');}}});
 assert.equal(result.status,'failed');assert.equal(submissions,0);
 assert.match(result.steps[0].detail,/Operation not permitted.*home/);
 assert.equal(result.steps[1].status,'skipped');
});
