import test from 'node:test';
import assert from 'node:assert/strict';
import {callModel} from '../../apps/web/core/providers.js';
import {DeviceClient} from '../../apps/web/core/device.js';
import {validatePlan} from '../../apps/web/core/plan.js';

const provider={id:'account',accountId:'account',model:'model',protocol:'openai',stream:false,baseUrl:'https://gateway.invalid/tenant-a/v1'};
const response=protocol=>Response.json(protocol==='anthropic'?{stop_reason:'end_turn',content:[{type:'text',text:'ok'}]}:{choices:[{finish_reason:'stop',message:{content:'ok'}}]});

for(const protocol of ['openai','anthropic'])test(`independent: ${protocol} opaque state does not cross same-origin backend paths`,async()=>{
 const p={...provider,protocol};
 const first=await callModel({provider:p,messages:[],fetchImpl:async()=>Response.json(protocol==='anthropic'?{stop_reason:'end_turn',content:[{type:'thinking',thinking:'synthetic-private-state',signature:'tenant-a-signature'},{type:'text',text:'old answer'}]}:{choices:[{finish_reason:'stop',message:{content:'old answer',reasoning_content:'synthetic-private-state'}}]})});
 let wire;
 await callModel({provider:{...p,baseUrl:'https://gateway.invalid/tenant-b/v1'},messages:[{role:'assistant',text:first.text,providerState:first.providerState},{role:'user',text:'Continue'}],fetchImpl:async(u,o)=>{wire=JSON.parse(o.body);return response(protocol);}});
 assert.ok(!JSON.stringify(wire).includes('synthetic-private-state'),'Tenant A opaque protocol state was sent to tenant B');
});

for(const protocol of ['openai','anthropic'])test(`independent: ${protocol} streamed tool arguments are bounded before JSON parse`,async()=>{
 const args=JSON.stringify({q:'x'.repeat(256000)}),pack=value=>'data: '+JSON.stringify(value)+'\n\n';
 const events=protocol==='openai'?[
  pack({choices:[{delta:{tool_calls:[{index:0,id:'c',function:{name:'synthetic_tool',arguments:args}}]},finish_reason:'tool_calls'}]}),'data: [DONE]\n\n',
 ]:[
  pack({type:'content_block_start',index:0,content_block:{type:'tool_use',id:'c',name:'synthetic_tool',input:{}}}),
  pack({type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:args}}),
  pack({type:'message_delta',delta:{stop_reason:'tool_use'}}),pack({type:'message_stop'}),
 ];
 const stream=new ReadableStream({start(c){for(const e of events)c.enqueue(new TextEncoder().encode(e));c.close();}});
 await assert.rejects(callModel({provider:{...provider,protocol,stream:true},messages:[],fetchImpl:async()=>new Response(stream)}),/参数|容量|limit|size/i);
});

test('independent: fresh running binding revokes an old released input state',async()=>{
 let now=1000,running=false;
 const meta={boardId:'board',bootId:'boot',clientId:'client'},fingerprint='a'.repeat(64);
 const client=new DeviceClient({baseUrl:'https://board.invalid',now:()=>now,cacheMs:0,fetchImpl:async(url,o)=>{
  const path=new URL(url).pathname,body=o.body?JSON.parse(o.body):null;
  if(path==='/v1/identity')return Response.json({...meta,publicKeyFingerprint:fingerprint});
  if(path==='/v1/binding')return Response.json({...meta,targetId:'phone',bindingVerified:true,targets:[{targetId:'phone',connected:true,encrypted:true,hidSubscribed:true,inputState:running?'unknown':'released',running}]});
  if(path==='/v1/clock')return Response.json({...meta,deviceTimeMs:now});
  if(path==='/v1/capabilities')return Response.json({...meta,executionEnabled:true,operations:['home']});
  if(path.endsWith('/leases/claim'))return Response.json({...meta,targetId:'phone',leaseId:body.leaseId,inputState:'released',expiresAtDeviceMs:now+15000});
  throw new Error('Unexpected mock request');
 }});
 client.restoreCredentials({format:'iah-device-credential/1',baseUrl:'https://board.invalid',...meta,token:'synthetic-device-token-only',publicKeyFingerprint:fingerprint,expectedFingerprint:fingerprint});
 assert.equal((await client.getExecutionContext({writerId:'run',allowClaim:true})).inputState,'released');
 running=true;now++;
 const next=await client.getExecutionContext({writerId:'run',orientationEpoch:1});
 const plan={version:1,planId:'plan',sessionId:'session',boardId:'board',targetId:'phone',basedOnFrameId:'frame',orientationEpoch:1,ttlMs:15000,maxExecutionMs:1000,steps:[{id:'home',op:'home'}]};
 const validation=validatePlan(plan,{...next,mode:'task',sessionId:'session',knownFrames:new Map([['frame',{targetId:'phone',orientationEpoch:1}]])});
 assert.equal(next.inputState,'unknown','A running/unknown binding retained the previous released state');
 assert.equal(validation.valid,false,'An input plan passed preflight while the current binding reports running input');
});
