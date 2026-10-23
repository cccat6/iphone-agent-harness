import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createViewNavigation} from '../../apps/web/ui/navigation.js';
import {modelContextMetadata} from '../../apps/web/core/models.js';
import {modelReasoningMetadata} from '../../apps/web/core/reasoning.js';

const initial={route:'harness',screen:'list',sessionId:null,panel:null,action:null};
function navigationFixture(){
 const entries=[{state:null,url:'/'}],applied=[];let index=0,navigation;
 const history={get state(){return entries[index].state;},replaceState(state,unused,url){entries[index]={state:structuredClone(state),url:String(url)};},pushState(state,unused,url){entries.splice(++index);entries.push({state:structuredClone(state),url:String(url)});},back(){if(index>0){index--;queueMicrotask(()=>navigation.pop({state:history.state}));}},forward(){if(index+1<entries.length){index++;queueMicrotask(()=>navigation.pop({state:history.state}));}}};
 navigation=createViewNavigation({history,location:{},urlForView:view=>'/'+view.route+(view.sessionId?'?session='+view.sessionId:''),initialView:initial,applyView:async view=>{applied.push(view);}});
 return {navigation,history,applied,entries,flush:()=>new Promise(resolve=>setImmediate(resolve))};
}
test('settings, account editor, save, Back and Forward keep explicit screens in one document',async()=>{
 const f=navigationFixture();f.navigation.go({screen:'session',sessionId:'one'});f.navigation.go({panel:{kind:'settings',section:'home'}});f.navigation.go({panel:{kind:'settings',section:'accounts'}});f.navigation.go({panel:{kind:'provider',id:null}});
 await f.navigation.back();await f.flush();assert.deepEqual(f.navigation.current.panel,{kind:'settings',section:'accounts'});assert.equal(f.navigation.current.sessionId,'one');
 f.history.forward();await f.flush();assert.deepEqual(f.navigation.current.panel,{kind:'provider',id:null});
 f.navigation.go({panel:{kind:'provider',id:'saved'}},{replace:true});await f.navigation.back();await f.flush();assert.deepEqual(f.navigation.current.panel,{kind:'settings',section:'accounts'});
 await f.navigation.back();await f.flush();assert.deepEqual(f.navigation.current.panel,{kind:'settings',section:'home'});
 await f.navigation.back();await f.flush();assert.equal(f.navigation.current.panel,null);assert.equal(f.navigation.current.screen,'session');
 await f.navigation.back();await f.flush();assert.equal(f.navigation.current.screen,'list');assert.equal(f.navigation.current.sessionId,null);
});
test('same-document website navigation retains conversation identity through browser history',async()=>{
 const f=navigationFixture();f.navigation.go({screen:'session',sessionId:'one'});f.navigation.go({route:'main'});f.navigation.go({route:'skills'});await f.navigation.back();await f.flush();assert.equal(f.navigation.current.route,'main');await f.navigation.back();await f.flush();assert.equal(f.navigation.current.route,'harness');assert.equal(f.navigation.current.sessionId,'one');
});

const source=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');
function viewFixture(){
 const classes=new Set(['in-conversation']),nodes={'#panel-dialog':{open:false},'#action-dialog':{open:false},'#app':{classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)}}},loads=[];
 const refreshes=[];const state={devicePanel:{refreshConnection:async()=>refreshes.push('refresh')},current:{id:'one'},running:true,submitting:true,capturePaused:true,pending:'Live reply',skills:[]};
 const ctx=vm.createContext({state,$:selector=>nodes[selector],closeNavigationDialog(){},renderDeviceStatus(){refreshes.push('badge');},report(error){throw error;},renderPlatform(){},toast(){},t:key=>key,openSession:async id=>{loads.push(id);},showSettings:async()=>{},renderProviderForm(){},providers:()=>[],showDevices:async()=>{},showSkills:async()=>{},showSessionMenu:async()=>{}});
 const start=source.indexOf('async function applyNavigationView('),end=source.indexOf('\nfunction rememberRouteDraft(',start);assert.ok(start>=0&&end>start);vm.runInContext(source.slice(start,end)+'\nglobalThis.apply=applyNavigationView;',ctx);
 return {state,classes,loads,refreshes,apply:view=>ctx.apply(view)};
}
test('restoring a panel on the active conversation does not reload or reset a live stream or capture pause',async()=>{
 const f=viewFixture();await f.apply({route:'harness',screen:'session',sessionId:'one',panel:{kind:'settings',section:'accounts'}});assert.deepEqual(f.loads,[]);assert.equal(f.state.pending,'Live reply');assert.equal(f.state.capturePaused,true);assert.ok(f.classes.has('in-conversation'));assert.deepEqual(f.refreshes,['refresh','badge']);
});

function realSessionViewFixture(){
 let release;const read=new Promise(resolve=>release=resolve),classes=new Set(['in-conversation']);
 const nodes={'#panel-dialog':{open:false},'#action-dialog':{open:false},'#app':{classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)}},'#message-input':{value:'draft'}};
 const refreshes=[];const state={devicePanel:{refreshConnection:async()=>refreshes.push('refresh')},current:{id:'one'},running:false,submitting:false,drafts:new Map(),navigation:{restoring:true},store:{getSession:()=>read}};
 let historyLoads=0;const ctx=vm.createContext({state,$:selector=>nodes[selector],closeNavigationDialog(){},renderDeviceStatus(){refreshes.push('badge');},report(error){throw error;},renderPlatform(){},toast(){},t:key=>key,historyWindow:()=>({load:async()=>{historyLoads++;throw new Error('Stale or missing session must not load history');}})});
 const sessionStart=source.indexOf('async function openSession('),sessionEnd=source.indexOf('\nasync function pageHistory(',sessionStart),viewStart=source.indexOf('async function applyNavigationView('),viewEnd=source.indexOf('\nfunction rememberRouteDraft(',viewStart);
 vm.runInContext(source.slice(sessionStart,sessionEnd)+'\n'+source.slice(viewStart,viewEnd)+'\nglobalThis.apply=applyNavigationView;',ctx);
 return {state,classes,release,apply:view=>ctx.apply(view),get historyLoads(){return historyLoads;}};
}
test('a delayed historical session cannot reopen conversation after a later Back to list',async()=>{
 const f=realSessionViewFixture(),old=f.apply({route:'harness',screen:'session',sessionId:'two'});await f.apply({...initial});f.release({id:'two'});await old;assert.equal(f.classes.has('in-conversation'),false);assert.equal(f.historyLoads,0);assert.equal(f.state.current.id,'one');
});
test('history entries referring to a deleted session safely return to the list',async()=>{
 const f=realSessionViewFixture(),opening=f.apply({route:'harness',screen:'session',sessionId:'deleted'});f.release(null);const adjusted=await opening;assert.equal(adjusted.screen,'list');assert.equal(adjusted.sessionId,null);assert.equal(f.classes.has('in-conversation'),false);assert.equal(f.historyLoads,0);
});


test('provider editor retains exact catalog reasoning metadata when applying and saving discovered models',async()=>{
 const state={},nodes={'#provider-models':{innerHTML:''}},editorForm={elements:{model:{value:''},protocol:{value:'codex'}}};
 const ctx=vm.createContext({state,modelSequence:0,editorActive:()=>true,provider:{},providers:()=>[],editorForm,modelContextMetadata,modelReasoningMetadata,$:selector=>nodes[selector],escapeHTML:String,modelsStatus(){}});
 const start=source.indexOf('  const applyModels='),end=source.indexOf("  $('#discover-models').onclick",start);assert.ok(start>=0&&end>start);vm.runInContext(source.slice(start,end)+'\nglobalThis.apply=applyModels;',ctx);
 await ctx.apply([{id:'catalog-model',supported_reasoning_levels:[{effort:'low'},{effort:'ultra'}],default_reasoning_level:'low',context_window:1000000}]);
 assert.deepEqual(Array.from(state.providerModels[0].supportedReasoningEfforts),['low','ultra']);assert.equal(state.providerModels[0].defaultReasoningEffort,'low');assert.equal(state.providerModels[0].contextWindowTokens,1000000);assert.equal(editorForm.elements.model.value,'catalog-model');
});

test('reopening the running conversation from the list preserves task, streaming text and history state',async()=>{
 const start=source.indexOf('async function openSession('),end=source.indexOf('\nasync function pageHistory(',start);
 for(const submitting of [true,false]){
  const classes=new Set(),moves=[],current={id:'active'},state={current,running:true,submitting,pending:'partial reply',messages:[{text:'history'}],drafts:new Map(),navigation:{go:view=>moves.push(view)},store:{getSession:()=>assert.fail('active conversation must not reload storage')}};
  const nodes={'#app':{classList:{add:name=>classes.add(name)}},'#message-input':{value:'draft'}};let renders=0;
  const context=vm.createContext({state,$:s=>nodes[s],renderRunControls:()=>renders++});vm.runInContext(source.slice(start,end)+'\nglobalThis.open=openSession;',context);
  assert.equal(await context.open('active'),current);assert.equal(classes.has('in-conversation'),true);assert.equal(moves[0].sessionId,'active');assert.equal(state.pending,'partial reply');assert.equal(state.running,true);assert.equal(state.submitting,submitting);assert.equal(renders,1);
  await assert.rejects(context.open('different'),/请先停止/);
 }
});
