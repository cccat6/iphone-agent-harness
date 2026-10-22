import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {openStore} from '../../apps/web/core/store.js';
import {createMCPAccess} from '../../apps/web/core/mcp.js';
import {createMCPSettingsModel} from '../../apps/web/ui/mcp-settings.js';
function transport(requests,{available=['lookup']}={}){return async(url,options)=>{const rpc=JSON.parse(options.body);requests.push({url:String(url),authorization:options.headers.authorization,method:rpc.method});if(rpc.method==='notifications/initialized')return new Response(null,{status:202});return Response.json({jsonrpc:'2.0',id:rpc.id,result:rpc.method==='initialize'?{protocolVersion:'2025-11-25'}:rpc.method==='tools/list'?{tools:available.map(name=>({name,inputSchema:{type:'object'}}))}:{content:[{type:'text',text:'ok'}]}});};}
async function add(model,name,endpoint,token){const id=model.add();model.edit(id,{name,endpoint});await model.connect(id,token);await model.select(id,['lookup']);await model.enable(id,true);return id;}

test('fresh database and access objects restore two authenticated servers and selected tools without session credential leakage',async()=>{
 const name='mcp-persistence-'+crypto.randomUUID(),first=await openStore({name}),requests=[];
 const a=createMCPAccess({fetchImpl:transport(requests)}),model=createMCPSettingsModel({access:a,store:first});model.load();
 const one=await add(model,'Notes','https://notes.example/mcp?token=synthetic-query','synthetic-notes'),two=await add(model,'Docs','https://docs.example/mcp','synthetic-docs');
 const settings=await first.getSettings(),session=await first.createSession({title:'Test'});await first.addMessage(session.id,{role:'user',text:'hello'});
 const exported=JSON.stringify(await first.exportSession(session.id));assert.ok(!exported.includes('synthetic-'));assert.ok(!JSON.stringify(settings).includes('synthetic-'));
 first.close();const reopened=await openStore({name}),nextRequests=[],b=createMCPAccess({fetchImpl:transport(nextRequests)}),restored=createMCPSettingsModel({access:b,store:reopened});
 await restored.restore(await reopened.getSettings().then(s=>({servers:s.mcpServers})));
 assert.deepEqual((await b.listForModel()).tools.map(t=>[t.serverId,t.name]),[[one,'lookup'],[two,'lookup']].sort((a,b)=>a[0]<b[0]?-1:1));
 assert.deepEqual(nextRequests.filter(r=>r.method==='initialize').map(r=>r.authorization),['Bearer synthetic-notes','Bearer synthetic-docs']);
 assert.ok(nextRequests[0].url.includes('token=synthetic-query'));
 assert.ok(!JSON.stringify(restored.getRows()).includes('synthetic-notes'));
 await restored.disconnect(one);assert.equal((await reopened.getLocalCredential('mcp:'+one)).token,'synthetic-notes');
 const third=createMCPAccess({fetchImpl:transport([])}),thirdModel=createMCPSettingsModel({access:third,store:reopened});await thirdModel.restore({servers:settings.mcpServers});
 assert.deepEqual(third.getSnapshot().map(r=>r.id),[two]);await thirdModel.connect(one);assert.equal(third.getSnapshot().find(r=>r.id===one).enabled,true);
 await thirdModel.remove(one);assert.equal(await reopened.getLocalCredential('mcp:'+one),null);assert.ok(await reopened.getLocalCredential('mcp:'+two));
 reopened.close();
});

test('restoring selected tools never grants newly added tools, and missing tools are filtered',async()=>{
 const store=await openStore({memory:true}),model=createMCPSettingsModel({access:createMCPAccess({fetchImpl:transport([])}),store});model.load();await add(model,'Notes','https://notes.example/mcp','synthetic');
 const access=createMCPAccess({fetchImpl:transport([],{available:['new-tool']})}),next=createMCPSettingsModel({access,store});await next.restore({servers:(await store.getSettings()).mcpServers});assert.equal(access.hasAuthorizedTools(),false);assert.deepEqual(access.getSnapshot()[0].allowedTools,[]);
});

const deferred=()=>{let resolve;return {promise:new Promise(r=>{resolve=r;}),resolve:value=>resolve(value)};};
async function delayedHydration(){
 const store=await openStore({memory:true}),id='slow',endpoint='https://notes.example/mcp',record={endpoint,token:'saved-token',allowedTools:['lookup'],enabled:true,reconnect:true};await store.saveLocalCredential('mcp:'+id,record);
 const access=createMCPAccess({fetchImpl:transport([],{available:['lookup','search']})});access.configure({id,name:'Notes',url:endpoint,token:record.token});await access.connect(id);access.setAllowedTools(id,['lookup']);access.setEnabled(id,true);
 const entered=deferred(),release=deferred();let reads=0;
 const delayed={...store,async getLocalCredential(key){const value=await store.getLocalCredential(key);if(++reads===1){entered.resolve();await release.promise;}return value;}};
 const model=createMCPSettingsModel({access,store:delayed}),options={servers:[{id,name:'Notes',endpoint}]};model.load(options);await entered.promise;
 return {store,access,model,id,options,release};
}
test('reopening settings during hydration preserves queued selection and token in fresh rows',async()=>{
 const f=await delayedHydration(),pending=f.model.select(f.id,['search']);f.model.cancelPending();f.model.load(f.options);f.release.resolve();await pending;
 await f.model.enable(f.id,false);const saved=await f.store.getLocalCredential('mcp:'+f.id);assert.equal(saved.token,'saved-token');assert.deepEqual(saved.allowedTools,['search']);assert.equal(saved.enabled,false);assert.equal(saved.reconnect,true);
});
test('disconnect during hydration revokes immediately while preserving the credential and latest grants',async()=>{
 const f=await delayedHydration(),selection=f.model.select(f.id,['search']),disconnected=f.model.disconnect(f.id);assert.equal(f.access.hasAuthorizedTools(),false);f.release.resolve();await Promise.all([selection,disconnected]);
 const saved=await f.store.getLocalCredential('mcp:'+f.id);assert.equal(saved.token,'saved-token');assert.deepEqual(saved.allowedTools,['search']);assert.equal(saved.reconnect,false);
});
test('deleting a server during hydration cannot recreate its private record through a late permission write',async()=>{
 const f=await delayedHydration(),pending=f.model.select(f.id,['search']),removed=f.model.remove(f.id);f.release.resolve();await Promise.all([pending,removed]);assert.equal(await f.store.getLocalCredential('mcp:'+f.id),null);assert.deepEqual(f.model.getRows(),[]);
});
test('endpoint edits cancel queued old permission writes before saving a new credential',async()=>{
 const f=await delayedHydration(),pending=f.model.select(f.id,['search']);f.model.edit(f.id,{endpoint:'https://other.example/mcp'});f.release.resolve();await pending;
 await f.model.connect(f.id,'new-token');const saved=await f.store.getLocalCredential('mcp:'+f.id);assert.equal(saved.endpoint,'https://other.example/mcp');assert.equal(saved.token,'new-token');assert.deepEqual(saved.allowedTools,[]);assert.equal(saved.enabled,false);
});

test('opening settings while startup credentials are still loading preserves app restoration',async()=>{
 const store=await openStore({memory:true}),id='startup-local',endpoint='https://notes.example/mcp';await store.saveLocalCredential('mcp:'+id,{endpoint,token:'saved',allowedTools:['lookup'],enabled:true,reconnect:true});
 const entered=deferred(),release=deferred(),delayed={...store,async getLocalCredential(key){entered.resolve();await release.promise;return store.getLocalCredential(key);}},access=createMCPAccess({fetchImpl:transport([])}),model=createMCPSettingsModel({access,store:delayed}),options={servers:[{id,name:'Notes',endpoint}]};
 const restoring=model.restore(options);await entered.promise;model.cancelPending();model.load(options);model.cancelPending();release.resolve();await restoring;assert.equal(access.hasAuthorizedTools(),true);
});
for(const action of ['disconnect','edit','remove'])test(`explicit ${action} still cancels app-level startup restoration`,async()=>{
 const store=await openStore({memory:true}),id='startup-cancel',endpoint='https://notes.example/mcp';await store.saveLocalCredential('mcp:'+id,{endpoint,token:'saved',allowedTools:['lookup'],enabled:true,reconnect:true});
 const entered=deferred(),release=deferred(),base=transport([]),access=createMCPAccess({fetchImpl:async(url,options)=>{if(JSON.parse(options.body).method==='initialize'){entered.resolve();await release.promise;}return base(url,options);}}),model=createMCPSettingsModel({access,store});
 const restoring=model.restore({servers:[{id,name:'Notes',endpoint}]});await entered.promise;
 const cancelled=action==='edit'?model.edit(id,{endpoint:'https://changed.example/mcp'}):model[action](id);release.resolve();await Promise.all([restoring,cancelled]);assert.equal(access.hasAuthorizedTools(),false);assert.deepEqual(access.getSnapshot(),[]);
});
