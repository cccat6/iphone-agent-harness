import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');
const start=source.indexOf('  const applyModels='),end=source.indexOf("\n  $('#discover-models').onclick",start);
assert.ok(start>=0&&end>start);
function harness(){
 let resolve,active=true;const pending=new Promise(r=>{resolve=r;});
 const form={elements:{protocol:{value:'openai'},baseUrl:{value:'https://example.com/v1'},model:{value:''}}};
 const dropdown={innerHTML:'original',options:[{}]},field={hidden:true};
 let nodes={'#provider-form':form,'#discovered-models':dropdown,'#discovered-models-field':field};
 const calls=[],state={providerModels:[],store:{saveSettings:patch=>{calls.push(['save',patch]);return pending;}}};
 const context=vm.createContext({state,editorForm:form,provider:{id:'original',protocol:'openai',baseUrl:'https://example.com/v1'},editorActive:()=>active,$:s=>nodes[s],isCodex:()=>false,modelContextMetadata:()=>({}),safeURL:x=>x,providers:()=>[{id:'original'}],renderModelOptions(){},t:x=>x,escapeHTML:x=>x,modelsStatus:x=>calls.push(['status',x]),setLocalizedText(){}});
 vm.runInContext('let modelSequence=1;\n'+source.slice(start,end)+'\nglobalThis.apply=applyModels;',context);
 return {form,dropdown,field,state,calls,start:()=>context.apply([{id:'original-model',name:'Original model'}]),resolve:()=>resolve({providers:[]}),replace(){active=false;const next={innerHTML:'replacement',options:[{}]},nextField={hidden:true};nodes={'#provider-form':{},'#discovered-models':next,'#discovered-models-field':nextField};return {next,nextField};},close(){active=false;nodes={};},invalidate(){state.providerModels=[];vm.runInContext('modelSequence++;',context);}};
}
test('model-list save finishing after editor replacement does not overwrite replacement controls',async()=>{
 const h=harness(),running=h.start(),replacement=h.replace();h.resolve();await running;
 assert.equal(replacement.next.innerHTML,'replacement');assert.equal(replacement.nextField.hidden,true);assert.equal(h.form.elements.model.value,'');assert.equal(h.calls.filter(c=>c[0]==='status').length,0);
});
test('model-list save finishing after editor closure does not access removed controls',async()=>{
 const h=harness(),running=h.start();h.close();h.resolve();await running;assert.equal(h.form.elements.model.value,'');
});
test('model-list save finishing after same-editor endpoint invalidation does not apply stale models',async()=>{
 const h=harness(),running=h.start();h.invalidate();h.resolve();await running;assert.equal(h.dropdown.innerHTML,'original');assert.equal(h.field.hidden,true);assert.equal(h.form.elements.model.value,'');
});
test('model-list save in active unchanged editor populates fetched models',async()=>{
 const h=harness(),running=h.start();h.resolve();await running;assert.match(h.dropdown.innerHTML,/original-model/);assert.equal(h.field.hidden,false);assert.equal(h.form.elements.model.value,'original-model');assert.equal(h.calls.filter(c=>c[0]==='save').length,1);assert.equal(h.calls.filter(c=>c[0]==='status').length,1);
});
