import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');
function closeHandlers(){
 const handlers={},effects=[],nodes={
  '#panel-dialog':{open:true,navigationClosing:true,addEventListener(type,fn){handlers.panel=fn;}},
  '#action-dialog':{open:true,navigationClosing:false,addEventListener(type,fn){handlers.action=fn;}},
 };
 const state={panelGeneration:8,navigation:{restoring:false,async dismissPanel(){effects.push('dismiss-panel');},async dismissAction(){effects.push('dismiss-action');}},devicePanel:{dispose(){effects.push('dispose-device');}},codexAbort:{abort(){effects.push('abort-login');}},modelsAbort:{abort(){effects.push('abort-models');}},mcpPanel:{disposeView(){effects.push('dispose-mcp');}}};
 const ctx=vm.createContext({state,$:selector=>nodes[selector],discardProviderDraft(){effects.push('discard-draft');},report(){}});
 const start=source.indexOf("  $('#panel-dialog').addEventListener('close',"),end=source.indexOf("  $$('dialog').forEach",start);
 assert.ok(start>=0&&end>start);vm.runInContext(source.slice(start,end),ctx);
 return {handlers,nodes,state,effects};
}
test('queued old panel close cannot invalidate a newly reopened panel during rapid Back and Forward',()=>{
 const f=closeHandlers();f.handlers.panel();assert.equal(f.state.panelGeneration,8);assert.deepEqual(f.effects,[]);assert.equal(f.nodes['#panel-dialog'].navigationClosing,false);
 // A genuine later dismissal still cleans up the current view.
 f.nodes['#panel-dialog'].open=false;f.handlers.panel();assert.equal(f.state.panelGeneration,9);assert.ok(f.effects.includes('dispose-device'));assert.ok(f.effects.includes('dismiss-panel'));
});
test('queued old action close cannot go Back again after Forward has reopened the action menu',()=>{
 const f=closeHandlers();f.handlers.action();assert.deepEqual(f.effects,[]);
 f.nodes['#action-dialog'].open=false;f.handlers.action();assert.deepEqual(f.effects,['dismiss-action']);
});

import {openStore} from '../../apps/web/core/store.js';
import {createHarness} from '../../apps/web/core/harness.js';
import {clearCredentials,resolveProviderCredential} from '../../apps/web/core/credentials.js';

test('default production Harness preserves keyless custom endpoints and omits both authentication headers',async()=>{
 clearCredentials();const store=await openStore({memory:true}),profile={id:'public-endpoint',protocol:'openai',baseUrl:'https://public-model.invalid/v1',model:'public-model',stream:false};
 await store.saveSettings({providers:[profile],activeProviderId:profile.id});const session=await store.createSession({title:'Existing public conversation',mode:'chat'});const originalFetch=globalThis.fetch;let count=0;
 globalThis.fetch=async(url,options)=>{count++;assert.equal(String(url),'https://public-model.invalid/v1/chat/completions');assert.equal(options.headers.authorization,undefined);assert.equal(options.headers['x-api-key'],undefined);return Response.json({choices:[{finish_reason:'stop',message:{content:'Public endpoint reply'}}]});};
 try{const result=await createHarness({store}).run({sessionId:session.id,text:'Hello'});assert.equal(result.text,'Public endpoint reply');assert.equal(count,1);}finally{globalThis.fetch=originalFetch;store.close();clearCredentials();}
});
test('official missing keys and old locked custom credentials fail locally without dropping preserved vault records',async()=>{
 clearCredentials();const store=await openStore({memory:true});
 try{
 for(const [host,protocol] of [['api.openai.com','openai'],['api.deepseek.com','openai'],['api.anthropic.com','anthropic']])await assert.rejects(resolveProviderCredential(store,{id:'official-'+host,protocol,baseUrl:'https://'+host}),error=>error.code==='PROVIDER_CREDENTIAL_MISSING');
 const vault={version:1,data:'synthetic-retained-encrypted-vault'},profile={id:'old-custom',protocol:'openai',baseUrl:'https://public-model.invalid/v1'};await store.saveSettings({credentialVault:{[profile.id]:vault}});
 await assert.rejects(resolveProviderCredential(store,profile),error=>error.code==='PROVIDER_CREDENTIAL_LOCKED');assert.deepEqual((await store.getSettings()).credentialVault[profile.id],vault);
 }finally{store.close();clearCredentials();}
});

test('skill child return uses existing history instead of pushing another skills list',async()=>{
 const calls=[],state={navigation:{async back(view){calls.push(['back',view]);}}};
 const ctx=vm.createContext({state,isIOSPlatform:()=>true,showSkills:async tab=>calls.push(['list',tab])}),start=source.indexOf('async function returnFromSkillPanel('),end=source.indexOf('\nasync function showSkillEditor(',start);assert.ok(start>=0&&end>start);vm.runInContext(source.slice(start,end),ctx);
 await ctx.returnFromSkillPanel();assert.equal(calls.length,1);assert.equal(calls[0][0],'back');assert.equal(calls[0][1].panel.kind,'skills');assert.equal(calls[0][1].action,null);
 state.navigation=null;await ctx.returnFromSkillPanel();assert.deepEqual(calls[1],['list','local']);
});
test('desktop skill child return restores the community page without leaving that page or reopening Harness',async()=>{
 const calls=[],dialog={open:true},state={navigation:{go(view,options){calls.push(['view',view,options]);}}};
 const ctx=vm.createContext({state,isIOSPlatform:()=>false,location:{pathname:'/skills'},routeForPath:path=>path==='/skills'?'skills':null,$:()=>dialog,closeNavigationDialog(node){node.open=false;},async renderCommunityPage(){calls.push(['community']);},async showSkills(){throw new Error('Desktop return must not reopen the mobile skill panel');}});
 const start=source.indexOf('async function returnFromSkillPanel('),end=source.indexOf('\nasync function showSkillEditor(',start);vm.runInContext(source.slice(start,end),ctx);
 await ctx.returnFromSkillPanel();assert.equal(dialog.open,false);assert.equal(calls[0][0],'view');assert.equal(calls[0][1].panel,null);assert.equal(calls[0][2].replace,true);assert.deepEqual(calls[1],['community']);
});
test('skill catalog/local tabs still select their tab without navigating Back',async()=>{
 const nodes={'#skills-local':{},'#skills-catalog':{}},calls=[];
 const ctx=vm.createContext({$:selector=>nodes[selector],guard:fn=>fn,showSkills:async tab=>calls.push(tab)}),start=source.indexOf("  $('#skills-local').onclick="),end=source.indexOf('\n  if(local)',start);assert.ok(start>=0&&end>start);vm.runInContext(source.slice(start,end),ctx);
 await nodes['#skills-catalog'].onclick();await nodes['#skills-local'].onclick();assert.deepEqual(calls,['catalog','local']);
});
test('skill editor save refreshes local records then follows the child return path',async()=>{
 const calls=[],fresh=[{id:'new-authored'}],form={},state={store:{async listSkills(){calls.push('list');return fresh;}}},fields=new Map([['name','New skill'],['description','Summary'],['content','Body'],['slug','new-skill']]);
 const ctx=vm.createContext({state,$:()=>form,guard:fn=>fn,skill:null,identity:{creatorId:'owner'},FormData:class{get(key){return fields.get(key);}},async createAuthoredSkill(){calls.push('create');},async updateAuthoredSkill(){throw new Error('must create');},async returnFromSkillPanel(){calls.push('back');},toast(){calls.push('toast');},t:key=>key}),start=source.indexOf("  $('#skill-editor').onsubmit="),end=source.indexOf('\n}',start);assert.ok(start>=0&&end>start);vm.runInContext(source.slice(start,end),ctx);
 await form.onsubmit({preventDefault(){},target:form});assert.deepEqual(calls,['create','list','back','toast']);assert.equal(state.skills,fresh);
});
