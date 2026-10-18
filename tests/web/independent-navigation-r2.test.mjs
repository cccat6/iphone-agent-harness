import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(){
 let nodes={},title='',closeCount=0;
 const writes=[],refresh=deferred(),button={dataset:{providerDefault:'provider-a'}};
 const state={settings:{providers:[]},store:{getSettings:async()=>({providers:[]}),saveSettings(value){const d=deferred();writes.push({...d,value});return d.promise;}}};
 const dialog={open:true,close(){closeCount++;this.open=false;state.panelGeneration=(state.panelGeneration||0)+1;}};
 const ctx=vm.createContext({state,t:k=>k,escapeHTML:String,systemTextHTML:k=>k,discardProviderDraft(){},providers:()=>[],guard:f=>f,languageField:()=>'',wireLanguageSelector(){},renderModelOptions(){},refreshSessions:()=>refresh.promise,panel:(t,s,body)=>{state.panelGeneration=(state.panelGeneration||0)+1;title=t;nodes={};for(const id of body.matchAll(/id="([^"]+)"/g))nodes['#'+id[1]]={};dialog.open=true;},$:s=>s==='#panel-dialog'?dialog:s==='#app'?{classList:{remove(){}}}:s==='.panel-header'?{insertAdjacentHTML(){nodes['#panel-back']={};}}:nodes[s],$$:s=>s==='[data-provider-default]'?[button]:[]});
 const begin=source.indexOf('function panelBack('),end=source.indexOf('async function renderStorage()',begin);
 vm.runInContext(source.slice(begin,end)+'\nglobalThis.openSettings=showSettings;',ctx);
 return {open:s=>ctx.openSettings(s),writes,refresh,button,dialog,get title(){return title;},get closeCount(){return closeCount;},node:s=>nodes[s]};
}
test('setting a default account must not reopen accounts after the user navigates away',async()=>{
 const f=fixture();await f.open('accounts');const saving=f.button.onclick();await f.open('language');
 f.writes[0].resolve({...f.writes[0].value,providers:[]});await saving;
 assert.equal(f.title,'language.label');
});
test('archive list loading must not close a settings page opened afterward',async()=>{
 const f=fixture();await f.open('home');const opening=f.node('#settings-archive').onclick();await f.open('language');
 f.refresh.resolve();await opening;
 assert.equal(f.dialog.open,true);assert.equal(f.title,'language.label');assert.equal(f.closeCount,0);
});
test('setting a default account still refreshes its current accounts page',async()=>{
 const f=fixture();await f.open('accounts');const saving=f.button.onclick();
 f.writes[0].resolve({...f.writes[0].value,providers:[]});await saving;
 assert.equal(f.title,'settings.accounts');assert.equal(f.dialog.open,true);
});
test('archive list completion closes the original settings directory normally',async()=>{
 const f=fixture();await f.open('home');const opening=f.node('#settings-archive').onclick();
 f.refresh.resolve();await opening;
 assert.equal(f.dialog.open,false);assert.equal(f.closeCount,1);
});
test('finishing default-account persistence after closing settings does not reopen it',async()=>{
 const f=fixture();await f.open('accounts');const saving=f.button.onclick();f.dialog.close();
 f.writes[0].resolve({...f.writes[0].value,providers:[]});await saving;
 assert.equal(f.dialog.open,false);assert.equal(f.closeCount,1);
});
