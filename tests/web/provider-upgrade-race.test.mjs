import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');
test('upgrading a legacy login invalidates its pending catalog before the editor changes accounts',async()=>{
 const a=source.indexOf('  const applyModels=async '),b=source.indexOf('\n\n  const legacyConnection=',a),c=source.indexOf('    prepareProvider:async()=>{',b),d=source.indexOf('\n    onSuccess:',c);assert.ok(a>=0&&d>c);
 let release;const pending=new Promise(resolve=>release=resolve),form={elements:{protocol:{value:'codex'},subscriptionRelayUrl:{value:''},baseUrl:{value:''},model:{value:''},modelChoice:{value:'',disabled:false},name:{value:'Migrated'}}};
 const nodes={'#discover-models':{disabled:false},'#provider-models':{innerHTML:''},'#codex-legacy-note':{hidden:false},'#subscription-relay-settings':{hidden:true}};let seenAccount;
 const state={providerModels:[{id:'legacy'}],settings:{providers:[{id:'legacy'}]},navigation:{go(){}},store:{}};
 const ctx=vm.createContext({state,editorForm:form,editorActive:()=>true,provider:{id:'legacy',flow:'codex',protocol:'codex'},modelSequence:0,providers:()=>state.settings.providers,$:selector=>nodes[selector],guard:fn=>fn,AbortController,modelContextMetadata:()=>({}),modelReasoningMetadata:()=>({}),isCodex:()=>true,getCodexAccount:()=>null,hasCodexAccount:id=>id==='legacy',normalizeSubscriptionRelay:value=>value,prepareCodexSignInProfile:()=>({independent:true,provider:{id:'new-plan',name:'Migrated'},options:{}}),shortId:()=> 'new-plan',discoverCodexModels:({accountId})=>{seenAccount=accountId;return pending;},modelsStatus(){},escapeHTML:String,t:key=>key});
 const invalidateStart=source.indexOf('  const invalidateModels=',source.indexOf('function renderProviderForm(')),invalidateEnd=source.indexOf('\n  editorForm.elements.baseUrl',invalidateStart);assert.ok(invalidateStart>=0&&invalidateEnd>invalidateStart);
 vm.runInContext(source.slice(invalidateStart,invalidateEnd)+'\n'+source.slice(a,b)+'\nthis.prepare=async()=>{'+source.slice(c+'    prepareProvider:async()=>{'.length,d).replace(/},\s*$/,'')+'};',ctx);
 const request=nodes['#discover-models'].onclick(),requestSignal=state.modelsAbort.signal;await ctx.prepare();assert.equal(requestSignal.aborted,true);release([{id:'old-codex-model'}]);await request;
 assert.equal(seenAccount,'legacy');assert.equal(form.elements.model.value,'');assert.equal(state.providerModels.length,0);assert.equal(form.elements.modelChoice.disabled,true);assert.doesNotMatch(nodes['#provider-models'].innerHTML,/old-codex-model/);
});
