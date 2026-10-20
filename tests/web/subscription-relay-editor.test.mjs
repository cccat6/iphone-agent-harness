import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {normalizeSubscriptionRelay} from '../../apps/web/core/codex.js';
const source=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');
const apply=source.slice(source.indexOf('  const applyModels='),source.indexOf("  $('#discover-models').onclick="));
const success=source.match(/onSuccess:(async\(account,signal\)=>\{[^\n]+)\n/)[1];
function fixture(){let saved={id:'account',protocol:'codex',flow:'chatgpt-plan',subscriptionRelayUrl:'https://relay.example/a',model:'a-model',models:[{id:'a-model'}]},resolve;const updates=[],fields={protocol:{value:'codex'},subscriptionRelayUrl:{value:'https://relay.example/a'},model:{value:'a-model'}},nodes=new Map();
 const context=vm.createContext({normalizeSubscriptionRelay,provider:{...saved},editorForm:{elements:fields},state:{providerModels:[],store:{updateProviderModels:async(id,models)=>{updates.push(models);return {};}}},providers:()=>[saved],getCodexAccount:()=>({flow:'chatgpt-plan'}),editorActive:()=>true,modelContextMetadata:()=>({}),modelReasoningMetadata:()=>({}),renderModelOptions(){},modelsStatus(){},escapeHTML:String,$:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);},discoverCodexModels:()=>new Promise(r=>resolve=r)});
 vm.runInContext('let modelSequence=0;'+apply+'\nthis.apply=applyModels;this.success='+success+';this.invalidate=()=>modelSequence++;',context);return {context,updates,fields,resolve:value=>resolve(value)};
}
test('discovering models for an unsaved relay does not mutate the saved account catalog',async()=>{const f=fixture();f.fields.subscriptionRelayUrl.value='https://relay.example/b';await f.context.apply([{id:'b-model'}],{sequence:0,relayUrl:'https://relay.example/b'});assert.equal(f.updates.length,0);assert.equal(f.context.state.providerModels[0].id,'b-model');});
test('matching persisted relay can update its catalog',async()=>{const f=fixture();await f.context.apply([{id:'new-model'}],{sequence:0,relayUrl:'https://relay.example/a'});assert.equal(f.updates.length,1);});
test('late automatic login discovery is ignored after relay edit, including A to B to A',async()=>{for(const restored of [false,true]){const f=fixture(),pending=f.context.success({flow:'chatgpt-plan',clientId:'client'},new AbortController().signal);f.fields.subscriptionRelayUrl.value='https://relay.example/b';f.context.invalidate();if(restored){f.fields.subscriptionRelayUrl.value='https://relay.example/a';f.context.invalidate();}f.resolve([{id:'stale-a-model'}]);await pending;assert.equal(f.updates.length,0);assert.equal(f.context.state.providerModels.length,0);}});
