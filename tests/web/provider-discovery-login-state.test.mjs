import {imageFileProvider} from '../../apps/web/core/provider-images.js';
import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {registerCodexAccount,clearCodexAccounts,hasCodexAccount,getCodexAccount} from '../../apps/web/core/codex.js';
const source=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');
afterEach(()=>clearCodexAccounts());
function register(id){return registerCodexAccount(id,{access_token:'synthetic-access',expires_in:3600,scope:'chatgpt.tokens.use.direct'},{flow:'chatgpt-plan',clientId:'oaiapp-'+id,identityVerified:true});}
function fixture(provider={}){
 const nodes=new Map(),node=s=>{if(!nodes.has(s))nodes.set(s,{hidden:false,disabled:false,value:'',innerHTML:'',replaceChildren(){}});return nodes.get(s);};
 const form={elements:{protocol:{value:'codex'},subscriptionRelayUrl:{value:''},baseUrl:{value:''},model:{value:''},modelChoice:{value:'',innerHTML:'',disabled:true},secret:{value:''}}};nodes.set('#provider-form',form);const calls=[];
 const state={providerModels:[]},ctx=vm.createContext({imageFileProvider,provider,state,editorForm:form,modelSequence:0,unlockGeneration:0,$:node,providers:()=>[],isCodex:()=>form.elements.protocol.value==='codex',hasCodexAccount,getCodexAccount,modelsStatus(){},escapeHTML:String,t:k=>k,guard:f=>f,AbortController,editorActive:()=>true,applyModels:async list=>calls.push(['apply',list]),safeURL:x=>x,resolveProviderCredential:async()=> 'synthetic-api-key',discoverCodexModels:async options=>{calls.push(['codex',options.accountId]);return [{id:'model'}];},discoverModels:async()=>{calls.push(['api']);return [{id:'model'}];}});
 const a=source.indexOf('  const invalidateModels=',source.indexOf('function renderProviderForm(')),b=source.indexOf('\n  editorForm.elements.baseUrl',a),c=source.indexOf('  const protocolChanged=',b),d=source.indexOf("  $('#provider-form').elements.protocol.onchange",c),e=source.indexOf("  $('#discover-models').onclick=",d),f=source.indexOf('\n\n  const legacyConnection=',e);
 assert.ok(a>=0&&f>e);vm.runInContext(source.slice(a,b)+'\n'+source.slice(c,d)+'\n'+source.slice(e,f)+'\nthis.protocol=protocolChanged;this.invalidate=invalidateModels;',ctx);
 return {nodes,node,form,ctx,calls,state};
}
test('an unsaved subscription never borrows another active login for its discovery button or handler',async()=>{
 register('other-active');assert.equal(hasCodexAccount(undefined),true);const f=fixture();f.ctx.protocol(true);assert.equal(f.node('#discover-models').disabled,true);f.ctx.invalidate();assert.equal(f.node('#discover-models').disabled,true);await f.node('#discover-models').onclick();assert.deepEqual(f.calls,[]);assert.equal(f.state.modelsAbort,undefined);
});
test('only the matching subscription login enables discovery; API protocols remain usable',async()=>{
 register('other-active');const f=fixture({id:'selected',flow:'chatgpt-plan'});f.ctx.protocol(true);assert.equal(f.node('#discover-models').disabled,true);f.form.elements.protocol.value='openai';f.ctx.protocol();assert.equal(f.node('#discover-models').disabled,false);await f.node('#discover-models').onclick();assert.ok(f.calls.some(call=>call[0]==='api'));f.form.elements.protocol.value='codex';f.ctx.protocol();assert.equal(f.node('#discover-models').disabled,true);register('selected');f.ctx.protocol(true);assert.equal(f.node('#discover-models').disabled,false);await f.node('#discover-models').onclick();assert.ok(f.calls.some(call=>call[0]==='codex'&&call[1]==='selected'));
});
test('login success enables its model button before automatic directory discovery',async()=>{
 const f=fixture({id:'selected',flow:'chatgpt-plan'});f.ctx.protocol(true);const a=source.indexOf('    onSuccess:async(account,signal)=>',source.indexOf('state.codexLoginUI=mountCodexLogin')),b=source.indexOf('\n  });',a);assert.ok(a>=0&&b>a);vm.runInContext('this.success='+source.slice(a+'    onSuccess:'.length,b)+';',f.ctx);const account=register('selected');await f.ctx.success(account,new AbortController().signal);assert.equal(f.node('#discover-models').disabled,false);assert.ok(f.calls.some(call=>call[0]==='codex'&&call[1]==='selected'));
});
