import test from 'node:test';
import assert from 'node:assert/strict';
import {createMCPAccess} from '../../apps/web/core/mcp.js';
import {createMCPSettingsModel} from '../../apps/web/ui/mcp-settings.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function setup({beforeRPC,saveSettings}={}){
  const requests=[],saved=[];let settings={};
  const access=createMCPAccess({fetchImpl:async(url,request)=>{
    const rpc=JSON.parse(request.body),host=new URL(url).hostname;
    requests.push({host,method:rpc.method,token:request.headers.authorization});await beforeRPC?.({host,rpc});
    if(rpc.method==='notifications/initialized')return new Response(null,{status:202});
    const result=rpc.method==='initialize'?{protocolVersion:'2025-11-25'}:rpc.method==='tools/list'?{tools:[{name:'lookup',description:host,inputSchema:{type:'object',properties:{},additionalProperties:false}}]}:{content:[{type:'text',text:host}]};
    return Response.json({jsonrpc:'2.0',id:rpc.id,result});
  }});
  const model=createMCPSettingsModel({access,store:{async saveSettings(patch){await saveSettings?.(patch);saved.push(structuredClone(patch));settings={...settings,...structuredClone(patch)};return settings;}}});
  model.load();return {model,access,requests,saved,get settings(){return settings;}};
}
function add(f,name,endpoint){const id=f.model.add();f.model.edit(id,{name,endpoint});return id;}

test('two saved MCP servers route identical tool names independently, with separate tokens and grants',async()=>{
  const f=setup(),a=add(f,'Docs','https://docs.example/mcp?token=private-query'),b=add(f,'Notes','https://notes.example/mcp');
  await Promise.all([f.model.connect(a,'docs-token'),f.model.connect(b,'notes-token')]);
  assert.equal(f.settings.mcpServers.length,2);assert.equal(f.settings.mcpEndpoint,'');
  assert.ok(!JSON.stringify(f.saved).includes('token'));assert.equal(f.settings.mcpServers[0].endpoint,'https://docs.example/mcp');
  for(const id of [a,b]){f.model.select(id,['lookup']);f.model.enable(id,true);}
  const directory=await f.access.listForModel();assert.deepEqual(directory.tools.map(t=>[t.serverId,t.serverName,t.name]),[[a,'Docs','lookup'],[b,'Notes','lookup']]);
  for(const [id,host,token] of [[a,'docs.example','docs-token'],[b,'notes.example','notes-token']]){
    const reply=await f.access.call({serverId:id,name:'lookup',arguments:{}},{mode:'task'});assert.equal(reply.result.content[0].text,host);
    assert.equal(f.requests.find(r=>r.host===host&&r.method==='tools/call').token,'Bearer '+token);
  }
  f.model.disconnect(a);assert.deepEqual((await f.access.listForModel()).tools.map(t=>t.serverId),[b]);
  await f.model.remove(a);assert.deepEqual(f.settings.mcpServers.map(s=>s.id),[b]);assert.equal(f.access.hasAuthorizedTools(),true);
});

test('editing one server aborts its pending discovery, leaves the other connected, and stale results cannot enable it',async()=>{
  const entered=deferred(),release=deferred(),f=setup({beforeRPC:async({host,rpc})=>{if(host==='slow.example'&&rpc.method==='tools/list'){entered.resolve();await release.promise;}}});
  const a=add(f,'Slow','https://slow.example/mcp'),b=add(f,'Ready','https://ready.example/mcp');await f.model.connect(b);f.model.select(b,['lookup']);f.model.enable(b,true);
  const connecting=f.model.connect(a);await entered.promise;f.model.edit(a,{endpoint:'https://replacement.example/mcp'});release.resolve();await connecting;
  assert.equal(f.model.getRows().find(r=>r.id===a).connection,undefined);assert.equal(f.model.getRows().find(r=>r.id===a).connecting,false);assert.equal(f.model.getRows().find(r=>r.id===b).connection.enabled,true);
  await f.model.connect(a);assert.equal(f.settings.mcpServers.find(r=>r.id===a).endpoint,'https://replacement.example/mcp');assert.equal(f.model.getRows().find(r=>r.id===a).connection.connected,true);
});

test('deleting a connecting server cannot restore it after the response arrives',async()=>{
  const entered=deferred(),release=deferred(),f=setup({beforeRPC:async({rpc})=>{if(rpc.method==='initialize'){entered.resolve();await release.promise;}}});
  const id=add(f,'Delete me','https://delete.example/mcp'),connecting=f.model.connect(id);await entered.promise;await f.model.remove(id);release.resolve();await connecting;
  assert.deepEqual(f.settings.mcpServers,[]);assert.deepEqual(f.model.getRows(),[]);assert.deepEqual(f.access.getSnapshot(),[]);
});

test('failed public-settings save makes no network request and can be retried',async()=>{
  let fail=true;const f=setup({saveSettings:async()=>{if(fail)throw new Error('Storage unavailable');}}),id=add(f,'Retry','https://retry.example/mcp');
  await f.model.connect(id);assert.equal(f.requests.length,0);assert.match(f.model.getRows()[0].failure.message,/Storage/);
  fail=false;await f.model.connect(id);assert.equal(f.model.getRows()[0].connection.connected,true);assert.equal(f.settings.mcpServers.length,1);
});

test('legacy endpoint migrates on save and reload restores public entries without tokens or tool grants',async()=>{
  const f=setup();f.model.load({endpoint:'https://legacy.example/mcp?key=private'});assert.equal(f.model.getRows()[0].id,'default');await f.model.connect('default','one-page-token');f.model.select('default',['lookup']);f.model.enable('default',true);
  const reloaded=setup();reloaded.model.load({servers:f.settings.mcpServers,endpoint:'https://unused.example/mcp'});assert.deepEqual(reloaded.model.getRows().map(r=>[r.id,r.endpoint]),[['default','https://legacy.example/mcp']]);assert.equal(reloaded.access.hasAuthorizedTools(),false);assert.deepEqual(reloaded.requests,[]);
});

test('serialized settings writes preserve all independently connected servers',async()=>{
  const first=deferred();let saves=0;const f=setup({saveSettings:async()=>{if(++saves===1)await first.promise;}}),a=add(f,'A','https://a.example/mcp'),b=add(f,'B','https://b.example/mcp');
  const one=f.model.connect(a),two=f.model.connect(b);await tick();first.resolve();await Promise.all([one,two]);assert.equal(f.saved.length,2);assert.deepEqual(f.settings.mcpServers.map(row=>row.id),[a,b]);
});

test('closing settings cancels only pending connections; connected tools remain usable',async()=>{
  const entered=deferred(),release=deferred(),f=setup({beforeRPC:async({host,rpc})=>{if(host==='slow.example'&&rpc.method==='initialize'){entered.resolve();await release.promise;}}});
  const a=add(f,'Connected','https://ready.example/mcp'),b=add(f,'Pending','https://slow.example/mcp');await f.model.connect(a);f.model.select(a,['lookup']);f.model.enable(a,true);const pending=f.model.connect(b);await entered.promise;f.model.cancelPending();release.resolve();await pending;
  assert.equal(f.access.hasAuthorizedTools(),true);assert.deepEqual(f.access.getSnapshot().map(row=>row.id),[a]);
});
