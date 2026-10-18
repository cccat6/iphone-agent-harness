import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');
const begin=source.indexOf('function panelBack('),end=source.indexOf('function renderProviderForm(');
assert.ok(begin>=0&&end>begin);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(){
 let nodes={},title='',backs=0;
 const reads=[],saves=[],estimate=deferred();
 const state={settings:{},store:{getSettings(){const d=deferred();reads.push(d);return d.promise;},saveSettings(value){const d=deferred();saves.push({...d,value});return d.promise;}}};
 const dialog={open:true,close(){this.open=false;state.panelGeneration=(state.panelGeneration||0)+1;},showModal(){this.open=true;}};
 const ctx=vm.createContext({state,t:k=>k,escapeHTML:String,systemTextHTML:k=>k,discardProviderDraft(){},providers:()=>[],guard:f=>f,normalizeContextSettings:()=>({triggerTokens:750000}),normalizeImageSettings:()=>({qualityPreset:'balanced'}),languageField:()=>'',wireLanguageSelector(){},navigator:{storage:{estimate:()=>estimate.promise,persisted:async()=>true}},FormData:class{constructor(target){this.target=target;}has(k){return k==='autoCompact';}get(k){return this.target.values?.[k];}},setLocalizedText:(node,render)=>{if(node)node.textContent=render();},panel:(t,s,body)=>{state.panelGeneration=(state.panelGeneration||0)+1;title=t;nodes={};backs=0;for(const id of body.matchAll(/id="([^"]+)"/g))nodes['#'+id[1]]={style:{},textContent:''};dialog.open=true;},$:s=>s==='#panel-dialog'?dialog:s==='.panel-header'?{insertAdjacentHTML(){backs++;nodes['#panel-back']={};}}:nodes[s],$$:()=>[]});
 vm.runInContext(source.slice(begin,end)+'\nglobalThis.openSettings=showSettings;',ctx);
 return {open:s=>ctx.openSettings(s),reads,saves,dialog,estimate,get title(){return title},get backs(){return backs},node:s=>nodes[s]};
}
async function settleOpen(f,section){const pending=f.open(section);f.reads.at(-1).resolve({});await pending;}
test('settings navigation keeps the last selected section when storage reads finish out of order',async()=>{
 const f=fixture(),first=f.open('accounts'),second=f.open('language');f.reads[1].resolve({});await second;f.reads[0].resolve({});await first;
 assert.equal(f.title,'language.label');assert.equal(f.backs,1);
});
test('closing while a settings section is loading does not reopen the sheet',async()=>{
 const f=fixture(),pending=f.open('accounts');f.dialog.close();f.reads[0].resolve({});await pending;
 assert.equal(f.dialog.open,false);assert.equal(f.title,'');
});
test('storage completion after navigating elsewhere cannot add a second back button',async()=>{
 const f=fixture(),storage=f.open('storage');f.reads[0].resolve({});await Promise.resolve();await Promise.resolve();await settleOpen(f,'language');f.estimate.resolve({usage:0,quota:1});await storage;
 assert.equal(f.title,'language.label');assert.equal(f.backs,1);
});
test('a context save finishing after re-entry does not mark a new edited form as saved',async()=>{
 const f=fixture();await settleOpen(f,'context');const old=f.node('#context-form');old.values={triggerTokens:750000,qualityPreset:'balanced'};
 const saving=old.onsubmit({preventDefault(){},target:old});await settleOpen(f,'language');await settleOpen(f,'context');const fresh=f.node('#context-form');fresh.values={triggerTokens:900000,qualityPreset:'high'};
 f.saves[0].resolve(f.saves[0].value);await saving;assert.equal(f.node('#context-result').textContent,'');assert.equal(fresh.values.triggerTokens,900000);
});
test('a context save in its original section confirms the saved values',async()=>{
 const f=fixture();await settleOpen(f,'context');const form=f.node('#context-form');form.values={triggerTokens:900000,qualityPreset:'high'};
 const saving=form.onsubmit({preventDefault(){},target:form});f.saves[0].resolve(f.saves[0].value);await saving;assert.equal(f.node('#context-result').textContent,'context.saved');assert.equal(f.saves[0].value.context.triggerTokens,900000);
});

test('device opening checks current navigation after its local settings read',async()=>{
 const {createDevicePanel}=await import('../../apps/web/ui/device-panel.js');
 const read=deferred();let current=true,opened=0;
 const panel=createDevicePanel({store:{getSettings:()=>read.promise},capture:{active:false},openPanel(){opened++;},getPanelRoot(){throw new Error('Cancelled opening must not access DOM');}});
 const pending=panel.open({isCurrent:()=>current});current=false;read.resolve({});assert.equal(await pending,null);assert.equal(opened,0);panel.destroy();
});
test('disposing while device opening awaits storage prevents reopening',async()=>{
 const {createDevicePanel}=await import('../../apps/web/ui/device-panel.js');
 const read=deferred();let opened=0;
 const panel=createDevicePanel({store:{getSettings:()=>read.promise},capture:{active:false},openPanel(){opened++;},getPanelRoot(){throw new Error('Disposed opening must not access DOM');}});
 const pending=panel.open();panel.dispose();read.resolve({});assert.equal(await pending,null);assert.equal(opened,0);panel.destroy();
});

function sessionRefreshFixture(){
 const input={value:''},reads=[],renders=[],state={archived:false,sessions:[],store:{listSessions(options){const d=deferred();reads.push({...d,options});return d.promise;}}};
 const ctx=vm.createContext({state,$:()=>input,renderSessions:()=>renders.push(state.sessions)});
 const begin=source.indexOf('async function refreshSessions()'),end=source.indexOf('\nfunction renderSessions()',begin);
 assert.ok(begin>=0&&end>begin);vm.runInContext(source.slice(begin,end)+'\nglobalThis.refresh=refreshSessions;',ctx);
 return {input,reads,renders,state,refresh:()=>ctx.refresh()};
}
test('late filtered results cannot overwrite the unfiltered list after search is cancelled',async()=>{
 const f=sessionRefreshFixture();f.input.value='meeting';const filtered=f.refresh();f.input.value='';const cancelled=f.refresh();
 f.reads[1].resolve([{id:'all'}]);await cancelled;f.reads[0].resolve([{id:'filtered'}]);await filtered;
 assert.equal(f.reads[0].options.search,'meeting');assert.equal(f.reads[1].options.search,'');assert.equal(f.state.sessions[0].id,'all');assert.equal(f.renders.length,1);
});
test('late active-list results cannot replace a newly opened archived list',async()=>{
 const f=sessionRefreshFixture(),active=f.refresh();f.state.archived=true;const archived=f.refresh();
 f.reads[1].resolve([{id:'archive'}]);await archived;f.reads[0].resolve([{id:'active'}]);await active;
 assert.equal(f.reads[0].options.archived,false);assert.equal(f.reads[1].options.archived,true);assert.equal(f.state.sessions[0].id,'archive');assert.equal(f.renders.length,1);
});
