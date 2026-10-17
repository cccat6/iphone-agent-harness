import test from 'node:test';
import assert from 'node:assert/strict';
import {callModel,discoverModels} from '../../apps/web/core/providers.js';

// Query parameters are ordinary endpoint configuration, not credentials. Keep
// them intact when deriving the inference route from a base or full endpoint.
for(const protocol of ['openai','anthropic'])for(const fullEndpoint of [false,true])test(`independent R3: ${protocol} ${fullEndpoint?'full':'base'} endpoint preserves routing query parameters`,async()=>{
 const suffix=protocol==='openai'?'chat/completions':'messages';
 const path='/tenant/v1'+(fullEndpoint?'/'+suffix:'');
 const baseUrl=`https://gateway.invalid${path}?api-version=2026-01-01&route=account-a`;
 let sent;
 const models=await discoverModels({protocol,baseUrl,fetchImpl:async(url)=>{
  const discovered=new URL(url);
  assert.equal(discovered.pathname,'/tenant/v1/models');
  assert.equal(discovered.searchParams.get('api-version'),'2026-01-01');
  assert.equal(discovered.searchParams.get('route'),'account-a');
  return Response.json({data:[{id:'synthetic-model'}]});
 }});
 assert.equal(models[0].id,'synthetic-model');
 await callModel({provider:{id:'synthetic-query-account',protocol,baseUrl,model:'synthetic-model',stream:false},messages:[{role:'user',text:'Synthetic question'}],fetchImpl:async(url)=>{
  sent=new URL(url);
  return Response.json(protocol==='openai'?{choices:[{finish_reason:'stop',message:{content:'ok'}}]}:{stop_reason:'end_turn',content:[{type:'text',text:'ok'}]});
 }});
 assert.equal(sent.pathname,'/tenant/v1/'+suffix,'The inference suffix must be appended to the path, not a query value');
 assert.equal(sent.searchParams.get('api-version'),'2026-01-01');
 assert.equal(sent.searchParams.get('route'),'account-a');
});
