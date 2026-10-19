import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createHistoryWindow} from '../../apps/web/core/history-window.js';
import {openStore} from '../../apps/web/core/store.js';
import {createMCPAccess} from '../../apps/web/core/mcp.js';
import {createMCPSettingsModel} from '../../apps/web/ui/mcp-settings.js';
const deferred=()=>{let resolve;return {promise:new Promise(r=>{resolve=r;}),resolve:()=>resolve()};};
const tick=()=>new Promise(r=>setImmediate(r));
const app=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');
function appFunction(name){const start=app.indexOf('async function '+name+'(');assert.ok(start>=0);const rest=app.slice(start);const end=rest.slice(1).search(/\n(?:async )?function /);return end<0?rest:rest.slice(0,end+1);}
function appHarness({ready=false,current=null,liveReady=ready}={}){
 const counts={openedDevice:0,created:0,model:0,openedSession:0},nodes=new Map(),node=s=>{if(!nodes.has(s))nodes.set(s,{value:s==='#message-input'?'hello':s==='#mode-select'?'chat':'p::m',classList:{add(){},remove(){}},focus(){}});return nodes.get(s);};
 const state={current,settings:{},running:false,submitting:false,runGeneration:0,drafts:new Map(),store:{async createSession(){counts.created++;return {id:'new'};},async updateSession(){},async getMessages(){return [];},async getSession(id){return {id,title:'Existing',mode:'chat'};}},harness:{async run(){counts.model++;}},devicePanel:{getState:()=>({connected:ready,inputVerified:ready}),ensureReady:async()=>liveReady}};
 const context=vm.createContext({conversationFollow:()=>({follow(){}}),capture:{active:true},createHistoryWindow,clipboard:{clear(){}},renderClipboard(){},state,$:node,deviceSessionAvailable:()=>ready,ensureSessionDevice:async()=>liveReady,async showDevices(){counts.openedDevice++;},toast(){},t:k=>k,getBrowserCompatibility:()=>({supportedForHarness:true}),renderPlatform(){},selectedProvider:()=>({id:'p'}),providers:()=>[{id:'p'}],async showSettings(){},async refreshSessions(){},async openSession(id){counts.openedSession++;state.current={id};},setRunning(value){state.running=value;},resizeInput(){},renderMessages(){},renderRunControls(){},renderReasoningOptions(){},renderModelOptions(){},updateModeDescription(){},renderSessions(){},modeLabel:m=>m,report(e){throw e;},AbortController,console});
 vm.runInContext(app.slice(app.indexOf('function historyWindow()'),app.indexOf('async function openSession(')),context);
 vm.runInContext(app.slice(app.indexOf('function selectionParts('),app.indexOf('function profileModels(')),context);
 vm.runInContext(appFunction('newSession')+'\n'+appFunction('sendMessage'),context);
 return {context,state,counts};
}
test('production newSession gate never creates an offline session',async()=>{const h=appHarness();await h.context.newSession();assert.equal(h.counts.created,0);assert.equal(h.counts.openedDevice,1);});
// Current requirement: an existing session can explain a disconnected bridge.
// Physical input rejection is covered by bridge-runtime-awareness.test.mjs.
test('existing offline session can still ask the model without creating a new session',async()=>{const h=appHarness({current:{id:'existing'}});await h.context.sendMessage({preventDefault(){}});assert.equal(h.counts.model,1);assert.equal(h.counts.created,0);assert.equal(h.counts.openedDevice,0);});

for(const operation of ['select','enable'])test(`MCP ${operation} during local credential restoration keeps the saved token`,async()=>{
 const store=await openStore({memory:true}),access=createMCPAccess({fetchImpl:async(url,o)=>{const rpc=JSON.parse(o.body);if(rpc.method==='notifications/initialized')return new Response(null,{status:202});return Response.json({jsonrpc:'2.0',id:rpc.id,result:rpc.method==='initialize'?{protocolVersion:'2025-11-25'}:{tools:['lookup','search'].map(name=>({name,inputSchema:{type:'object'}}))}});}});
 const id='notes',endpoint='https://notes.example/mcp',record={endpoint,token:'synthetic-notes-key',allowedTools:['lookup'],enabled:true,reconnect:true};
 await store.saveLocalCredential('mcp:'+id,record);access.configure({id,name:'Notes',url:endpoint,token:record.token});await access.connect(id);access.setAllowedTools(id,['lookup']);access.setEnabled(id,true);
 const entered=deferred(),release=deferred(),delayedStore={...store,async getLocalCredential(key){const value=await store.getLocalCredential(key);entered.resolve();await release.promise;return value;}};
 const model=createMCPSettingsModel({access,store:delayedStore});model.load({servers:[{id,name:'Notes',endpoint}]});await entered.promise;
 const editing=operation==='select'?model.select(id,['search']):model.enable(id,false);await tick();release.resolve();await editing;await tick();
 const saved=await store.getLocalCredential('mcp:'+id);assert.equal(saved.token,record.token);assert.equal(saved.reconnect,true);assert.deepEqual(saved.allowedTools,operation==='select'?['search']:['lookup']);assert.equal(saved.enabled,operation==='select');
});

// The stale UI may still display ready until the next status poll. The action
// itself must require a fresh board response before mutating/sending anything.
test('production newSession performs live readiness check, rejecting stale ready state',async()=>{const h=appHarness({ready:true,liveReady:false});await h.context.newSession();assert.equal(h.counts.created,0);});
test('existing session remains conversational after its live readiness check fails',async()=>{const h=appHarness({ready:true,liveReady:false,current:{id:'existing'}});await h.context.sendMessage({preventDefault(){}});assert.equal(h.counts.model,1);assert.equal(h.counts.openedDevice,0);});
test('production existing conversation remains readable while device is offline',async()=>{const h=appHarness();vm.runInContext(appFunction('openSession'),h.context);await h.context.openSession('existing');assert.equal(h.state.current.id,'existing');assert.equal(h.counts.model,0);assert.equal(h.counts.openedDevice,0);});

function accountEditorHarness(){
 const start=app.indexOf("$('#provider-form').onsubmit=guard("),end=app.indexOf('\n  const header=',start);assert.ok(start>=0&&end>start);
 const release=deferred(),entered=deferred(),counts={saved:0,reopened:0,credential:0};let active=true;
 const fields=new Map([['name','Example API'],['protocol','openai'],['baseUrl','https://model.example/v1'],['model','m'],['secret','synthetic-key'],['encrypt','on'],['passphrase','synthetic-passphrase']]);
 const submit={disabled:false},form={elements:{secret:{value:'synthetic-key'},passphrase:{value:'synthetic-passphrase'}},querySelector:()=>submit},state={settings:{providers:[]},providerModels:[],providerEdit:null};
 state.store={async getLocalCredential(){entered.resolve();await release.promise;return null;},async saveSettings(patch){counts.saved++;return patch;}};
 const sandbox=vm.createContext({state,provider:{id:'',name:'',protocol:'openai',models:[]},$:()=>form,guard:fn=>fn,FormData:class{get(k){return fields.get(k);}has(k){return fields.has(k);}},shortId:()=> 'new-account',safeURL:x=>x,normalizeProviderEndpoint:x=>x,getCodexAccount:()=>null,saveProviderCredential:async()=>{counts.credential++;},removeProviderCredential:async()=>{},t:k=>k,profileModels:p=>[{id:p.model}],providers:()=>[],setCredential(){counts.credential++;},getCredential:()=> 'synthetic-key',vaultPassphrases:new Map(),async sealCredentials(){entered.resolve();await release.promise;return {encrypted:'synthetic'};},renderModelOptions(){},async showSettings(){counts.reopened++;active=false;},toast(){},editorActive:()=>active,editorToken:'editor-1',editorForm:form});
 vm.runInContext(app.slice(start,end),sandbox);
 return {submit:()=>form.onsubmit({preventDefault(){},target:form}),cancel(){active=false;},counts,release,entered,state,button:submit};
}
test('cancelling an account editor while credential read is pending does not save the abandoned draft',async()=>{
 const h=accountEditorHarness(),save=h.submit();await h.entered.promise;h.cancel();h.release.resolve();await save;
 assert.equal(h.counts.saved,0);assert.equal(h.counts.reopened,0);assert.equal(h.counts.credential,0);
});
test('account save is single-flight and successfully stores exactly one requested profile',async()=>{
 const h=accountEditorHarness(),save=h.submit();await h.entered.promise;assert.equal(h.button.disabled,true);await h.submit();h.release.resolve();await save;
 assert.equal(h.counts.saved,1);assert.equal(h.counts.reopened,1);assert.equal(h.counts.credential,1);assert.equal(h.state.settings.providers.length,1);assert.equal(h.state.settings.providers[0].name,'Example API');assert.equal(h.state.providerSavingToken,null);
});

test('opening MCP settings while startup reconnection is in flight does not cancel restoration',async()=>{
 const store=await openStore({memory:true}),entered=deferred(),release=deferred(),id='startup',endpoint='https://startup.example/mcp';
 await store.saveLocalCredential('mcp:'+id,{endpoint,token:'synthetic-startup',allowedTools:['lookup'],enabled:true,reconnect:true});
 const access=createMCPAccess({fetchImpl:async(url,o)=>{const rpc=JSON.parse(o.body);if(rpc.method==='initialize'){entered.resolve();await release.promise;}if(rpc.method==='notifications/initialized')return new Response(null,{status:202});return Response.json({jsonrpc:'2.0',id:rpc.id,result:rpc.method==='initialize'?{protocolVersion:'2025-11-25'}:{tools:[{name:'lookup',inputSchema:{type:'object'}}]}});}});
 const model=createMCPSettingsModel({access,store}),options={servers:[{id,name:'Startup',endpoint}]};
 const restoring=model.restore(options);await entered.promise;
 // createMCPSettings.mount currently disposes its previous view then load(options).
 model.cancelPending();model.load(options);release.resolve();await restoring;await tick();
 assert.equal(access.getSnapshot().find(row=>row.id===id)?.connected,true);assert.equal(access.hasAuthorizedTools(),true);
});
