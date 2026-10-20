import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');
const start=source.indexOf("  if($('#unlock-provider'))$('#unlock-provider').onclick=guard(");
const end=source.indexOf("\n  $('#provider-form').onsubmit=",start);
const protocolStart=source.indexOf('  const protocolChanged='),protocolEnd=source.indexOf('\n',protocolStart);
assert.ok(start>=0&&end>start&&protocolStart>=0);
function harness(protocol='openai'){
 let resolve,reject,active=true,decryptCount=0;const pending=new Promise((res,rej)=>{resolve=res;reject=rej;});
 const oldForm={elements:Object.fromEntries(['protocol','passphrase','baseUrl','model','secret','subscriptionRelayUrl'].map(name=>[name,{value:name==='protocol'?protocol:name==='passphrase'?'synthetic passphrase':''}]))};let currentForm=oldForm;
 const nodes=new Map(),calls=[];const $=selector=>{if(selector==='#provider-form')return currentForm;if(!nodes.has(selector))nodes.set(selector,{disabled:false,hidden:false,replaceChildren(){}});return nodes.get(selector);};
 const state={store:{},settings:{credentialVault:{original:{synthetic:true}}}},vaultPassphrases=new Map();
 const context=vm.createContext({state,$,editorForm:oldForm,provider:{id:'original'},providers:()=>[],getCodexAccount:()=>null,guard:f=>f,editorActive:()=>active&&currentForm===oldForm,isCodex:()=>currentForm.elements.protocol.value==='codex',invalidateModels(){},unsealCredentials:(cipher,passphrase)=>{decryptCount++;calls.push(['decrypt',passphrase]);return pending;},hasCodexAccount:()=>false,registerCodexAccount:(...args)=>calls.push(['codex',...args]),setCredential:(...args)=>calls.push(['api',...args]),saveProviderCredential:async()=>{},setLocalizedText(){},t:k=>k,vaultPassphrases,loginStatus:()=>calls.push(['loginStatus']),toast:()=>calls.push(['toast'])});
 vm.runInContext('let unlockGeneration=0,login=null;\n'+source.slice(protocolStart,protocolEnd)+'\n'+source.slice(start,end),context);
 return {start:()=>$('#unlock-provider').onclick(),resolve,reject,calls,oldForm,vaultPassphrases,button:$('#unlock-provider'),get decryptCount(){return decryptCount;},cancel(){active=false;},replace(){currentForm={elements:{protocol:{value:'codex'},passphrase:{value:'replacement'}}};},protocol(value){oldForm.elements.protocol.value=value;vm.runInContext('protocolChanged(false)',context);}};
}
const installed=h=>h.calls.filter(call=>call[0]!=='decrypt');
for(const transition of ['cancel','replace'])test(`unlock resolved after editor ${transition} installs no credential or feedback`,async()=>{
 const h=harness(),running=h.start();h[transition]();h.resolve({apiKey:'synthetic-key'});await running;assert.deepEqual(installed(h),[]);assert.equal(h.oldForm.elements.passphrase.value,'synthetic passphrase');
});
test('unlock resolved after protocol changes away and back is stale',async()=>{
 const h=harness(),running=h.start();h.protocol('codex');h.protocol('openai');h.resolve({apiKey:'synthetic-key'});await running;assert.deepEqual(installed(h),[]);assert.equal(h.button.disabled,false);
});
test('unlock rejection after cancelled editor is ignored',async()=>{
 const h=harness(),running=h.start();h.cancel();h.reject(new Error('Synthetic bad password'));await running;assert.deepEqual(installed(h),[]);
});
for(const protocol of ['openai','codex'])test(`legacy ${protocol} recovery installs original credential and clears passphrase`,async()=>{
 const h=harness(protocol),running=h.start();assert.equal(h.button.disabled,true);await h.start();assert.equal(h.decryptCount,1);
 const value=protocol==='codex'?{access_token:'synthetic-token'}:{apiKey:'synthetic-key'};h.resolve(value);await running;
 assert.deepEqual(installed(h),protocol==='codex'?[['codex','original',value],['loginStatus'],['toast']]:[['api','original','synthetic-key'],['toast']]);
 assert.equal(h.oldForm.elements.passphrase.value,'');assert.equal(h.button.disabled,false);assert.equal(h.vaultPassphrases.get('original'),undefined);
});
test('active unlock failure reports the expected error and permits retry',async()=>{
 const h=harness(),running=h.start();h.reject(new Error('Synthetic bad password'));await assert.rejects(running,{code:'CREDENTIAL_UNLOCK_FAILED'});assert.equal(h.button.disabled,false);assert.deepEqual(installed(h),[]);
});
