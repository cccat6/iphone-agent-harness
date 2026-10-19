import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {openStore} from '../../apps/web/core/store.js';
import {openCreatorIdentity} from '../../apps/web/community/identity.js';
import {createAuthoredSkill,importOwnSkillFile} from '../../apps/web/community/authoring.js';
import {downloadSkill,syncInstalledCommunitySkills,snapshotSkills} from '../../apps/web/core/skills.js';

test('creator identity persists without an iPhone or device UID and authored files remain owned after reopening',async t=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'indexedDB');Object.defineProperty(globalThis,'indexedDB',{value:indexedDB,configurable:true});
 t.after(()=>{if(previous)Object.defineProperty(globalThis,'indexedDB',previous);else delete globalThis.indexedDB;});
 const store=await openStore({memory:true});t.after(()=>store.close());
 const first=await openCreatorIdentity(),second=await openCreatorIdentity();assert.equal(first.creatorId,second.creatorId);assert.match(first.creatorId,/^[a-f0-9]{64}$/);
 const skill=await createAuthoredSkill({store,identity:first,input:{slug:'desktop-only-fixture',name:'Desktop procedure',content:'Observe before acting.'}});
 const reimported=await importOwnSkillFile({store,identity:second,text:JSON.stringify({...skill,content:'Observe after the animation settles.'}),fileName:'own.json'});
 assert.equal(reimported.id,skill.id);assert.equal(reimported.provenance.creatorId,first.creatorId);assert.equal(reimported.version,'1.0.1');
});

test('an installed skill edited after the final reread is never overwritten by an automatic update',async t=>{
 const store=await openStore({memory:true});t.after(()=>store.close());const catalogUrl='https://fixture.example/catalog.json',entry={id:'local-correction',version:'1.0.0',url:'./skill.json'};let version='1.0.0';
 const fetchImpl=async url=>Response.json(String(url)===catalogUrl?{skills:[{...entry,version}]}:{id:entry.id,name:'Correction',version,content:'Upstream '+version});
 const installed=await downloadSkill(entry,catalogUrl,{fetchImpl});await store.saveSkill(installed);const activeSnapshot=await snapshotSkills(store);version='1.0.1';
 let reads=0,edited=false;const racingStore=Object.create(store);racingStore.listSkills=async()=>{const rows=await store.listSkills();if(++reads===2)queueMicrotask(async()=>{await store.saveSkill({...installed,content:'My local correction'});edited=true;});return rows;};
 const result=await syncInstalledCommunitySkills(racingStore,{fetchImpl});assert.equal(edited,true);assert.equal((await store.listSkills()).find(skill=>skill.id===installed.id).content,'My local correction');assert.deepEqual(result.updated,[]);assert.equal(activeSnapshot.find(skill=>skill.id===installed.id).content,'Upstream 1.0.0');
});

test('real IndexedDB update commits respect content edits, enabled changes, and deletion from a second handle',async t=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'indexedDB');Object.defineProperty(globalThis,'indexedDB',{value:indexedDB,configurable:true});
 t.after(()=>{if(previous)Object.defineProperty(globalThis,'indexedDB',previous);else delete globalThis.indexedDB;});
 for(const mutation of ['content','disabled','deleted','unchanged'])await t.test(mutation,async t=>{
  const name='independent-skill-update-'+crypto.randomUUID(),first=await openStore({name}),second=await openStore({name});t.after(()=>{first.close();second.close();});
  const catalogUrl='https://fixture.example/catalog.json',entry={id:'correction',version:'1.0.0',url:'./skill.json'};let version='1.0.0';
  const fetchImpl=async url=>Response.json(String(url)===catalogUrl?{skills:[{...entry,version}]}:{id:entry.id,name:'Correction',version,content:'Upstream '+version});
  const old=await downloadSkill(entry,catalogUrl,{fetchImpl});await first.saveSkill(old);version='1.0.1';
  const updater=Object.create(first);let commits=0;updater.replaceSkillIfUnchanged=async(expected,next)=>{
   commits++;assert.equal(expected.content,'Upstream 1.0.0');
   if(mutation==='content')await second.saveSkill({...old,content:'New local correction'});
   if(mutation==='disabled')await second.saveSkill({...old,enabled:false});
   if(mutation==='deleted')await second.deleteSkill(old.id);
   return first.replaceSkillIfUnchanged(expected,next);
  };
  const result=await syncInstalledCommunitySkills(updater,{fetchImpl}),actual=(await second.listSkills()).find(skill=>skill.id===old.id);assert.equal(commits,1);
  if(mutation==='unchanged'){assert.deepEqual(result.updated,[old.id]);assert.equal(actual.content,'Upstream 1.0.1');}
  else{assert.deepEqual(result.updated,[]);assert.deepEqual(result.skipped,[old.id]);if(mutation==='deleted')assert.equal(actual,undefined);else if(mutation==='content')assert.equal(actual.content,'New local correction');else{assert.equal(actual.enabled,false);assert.equal(actual.content,'Upstream 1.0.0');}}
 });
});

test('actual Harness import action preserves an owned export and makes a foreign export read-only without stealing ownership',async t=>{
 const {readFile}=await import('node:fs/promises'),{default:vm}=await import('node:vm'),source=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');
 const store=await openStore({memory:true});t.after(()=>store.close());const identity=await openCreatorIdentity({memory:true}),foreign=await openCreatorIdentity({memory:true});
 const own=await createAuthoredSkill({store,identity,input:{slug:'own-export',name:'Own procedure',content:'Original own instructions'}}),context=vm.createContext({state:{store},creatorIdentity:async()=>identity,importOwnSkillFile,shortId:()=>crypto.randomUUID(),Date,JSON});
 const start=source.indexOf('async function importSkillFileToLibrary('),end=source.indexOf('\nasync function returnFromSkillPanel(',start);vm.runInContext(source.slice(start,end),context);const validation=source.indexOf('function validateSkill(');vm.runInContext(source.slice(validation,source.indexOf('\nfunction viewSkill(',validation)),context);
 const reimport=await context.importSkillFileToLibrary(JSON.stringify({...own,content:'Revised owned instructions'}),'own.skill.json');assert.equal(reimport.id,own.id);assert.equal(reimport.source,'authored');assert.equal(reimport.provenance.creatorId,identity.creatorId);
 const otherStore=await openStore({memory:true});t.after(()=>otherStore.close());const other=await createAuthoredSkill({store:otherStore,identity:foreign,input:{slug:'foreign-export',name:'Foreign procedure',content:'Read-only foreign instructions'}});
 const imported=await context.importSkillFileToLibrary(JSON.stringify(other),'foreign.skill.json');assert.equal(imported.source,'community');assert.equal(imported.readonly,true);assert.equal(imported.provenance.kind,'community');assert.equal(imported.provenance.originalId,other.id);assert.notEqual(imported.id,identity.creatorId+'/foreign-export');
 await assert.rejects(context.importSkillFileToLibrary('{invalid','broken.json'),error=>error.code==='INVALID_PAYLOAD');assert.equal((await store.listSkills()).length,2,'invalid authoring data must not become a fallback foreign import');
});

test('actual Harness market lists builtins while offline and paginates community entries without repeating builtins',async t=>{
 const {readFile}=await import('node:fs/promises'),{default:vm}=await import('node:vm'),{loadCommunityCatalog,publicBuiltinSkills,readCatalogSkill,installCatalogSkill}=await import('../../apps/web/core/skills.js');
 const source=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8'),start=source.indexOf('async function loadSkillMarket('),end=source.indexOf('\nfunction languageField(',start),creator='a'.repeat(64);
 for(const offline of [false,true])await t.test(offline?'offline builtins':'two community pages',async t=>{
  const store=await openStore({memory:true});t.after(()=>store.close());let html='',nodes=[];const container={isConnected:true,get innerHTML(){return html;},set innerHTML(value){html=value;nodes=[...value.matchAll(/<button\b([^>]*)>/g)].map(match=>{const attributes=match[1],dataset={};for(const item of attributes.matchAll(/data-([\w-]+)(?:="([^"]*)")?/g))dataset[item[1].replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=item[2]||'';return {dataset,disabled:/\bdisabled\b/.test(attributes),isConnected:true};});}};
  const match=(selector,node)=>{const name=/\[data-([\w-]+)/.exec(selector)?.[1]?.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());return name&&Object.hasOwn(node.dataset,name);};
  const fetchImpl=async url=>{if(offline)throw new Error('community offline');const page=new URL(url).searchParams.get('cursor');return Response.json({items:[{creatorId:creator,slug:page?'second':'first',name:page?'Second community item':'First community item',version:'1.0.0'}],cursor:page?'':'next'});};
  const previews=new Map(),context=vm.createContext({state:{store},communityEndpoint:()=> 'https://fixture.example/api',publicBuiltinSkills,loadCommunityCatalog:options=>loadCommunityCatalog({...options,fetchImpl}),readCatalogSkill,installCatalogSkill,guard:fn=>fn,t:key=>key,escapeHTML:String,localizeError:error=>error.message,skillTextHTML:(skill,key)=>skill[key]||skill.id,toast(){},$:(selector)=>{if(selector==='#catalog-list')return container;if(selector.startsWith('[data-market-preview')){if(!previews.has(selector))previews.set(selector,{});return previews.get(selector);}return nodes.find(node=>match(selector,node));},$$:selector=>nodes.filter(node=>match(selector,node))});
  vm.runInContext(source.slice(start,end),context);await context.loadSkillMarket();if(offline)assert.ok(html.includes('communityRefinement.sourceError'));assert.ok(html.includes(publicBuiltinSkills()[0].id));assert.equal(nodes.filter(node=>Object.hasOwn(node.dataset,'marketAdd')).length,publicBuiltinSkills().length+(offline?0:1));
  await nodes.find(node=>node.dataset.marketRead==='0').onclick();assert.ok(previews.get('[data-market-preview="0"]').textContent.length>0);await nodes.find(node=>node.dataset.marketAdd==='0').onclick();assert.equal((await store.listSkills()).length,1);assert.equal((await store.listSkills())[0].source,'builtin');assert.equal(nodes.find(node=>node.dataset.marketAdd==='0').disabled,true);
  if(offline){assert.equal(nodes.some(node=>Object.hasOwn(node.dataset,'marketMore')),false);}
  else{await nodes.find(node=>Object.hasOwn(node.dataset,'marketMore')).onclick();assert.ok(html.includes('First community item'));assert.ok(html.includes('Second community item'));assert.equal(nodes.filter(node=>Object.hasOwn(node.dataset,'marketAdd')).length,publicBuiltinSkills().length+2);assert.equal(nodes.some(node=>Object.hasOwn(node.dataset,'marketMore')),false);}
 });
});

test('community requests terminate stalled fetch and stalled bodies with a bounded timeout',async t=>{
 const {CommunityClient}=await import('../../apps/web/community/client.js');
 for(const stall of ['fetch','body'])await t.test(stall,async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let requestSignal,cancelled=false;
  const client=new CommunityClient({baseUrl:'https://fixture.example/api',timeoutMs:25,fetchImpl:async(url,options)=>{requestSignal=options.signal;if(stall==='fetch')return new Promise(()=>{});return {ok:true,headers:new Headers(),body:{getReader:()=>({read:()=>new Promise(()=>{}),cancel:async()=>{cancelled=true;},releaseLock(){}})}};}});
  const promise=client.list(),rejected=assert.rejects(promise,error=>error.code==='COMMUNITY_UNREACHABLE');for(let i=0;i<10;i++)await Promise.resolve();t.mock.timers.tick(25);await rejected;assert.equal(requestSignal.aborted,true);if(stall==='body')assert.equal(cancelled,true);
 });
});

test('explicit community cancellation retains its own code during stalled fetch or stalled response',async t=>{
 const {CommunityClient}=await import('../../apps/web/community/client.js');
 for(const stall of ['fetch','body'])await t.test(stall,async()=>{
  const controller=new AbortController(),client=new CommunityClient({baseUrl:'https://fixture.example/api',timeoutMs:1000,fetchImpl:async()=>stall==='fetch'?new Promise(()=>{}):new Response(new ReadableStream({start(){}}))});
  const promise=client.list({signal:controller.signal}),rejected=assert.rejects(promise,error=>error.code==='REQUEST_CANCELLED');for(let i=0;i<10;i++)await Promise.resolve();controller.abort();await rejected;
 });
});

test('actual Harness and desktop catalogs show builtins before their remote catalog request resolves',async t=>{
 const {readFile}=await import('node:fs/promises'),{default:vm}=await import('node:vm'),{publicBuiltinSkills}=await import('../../apps/web/core/skills.js'),source=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');
 for(const page of ['harness','desktop'])await t.test(page,async()=>{
  let resolve;const remote=new Promise(done=>resolve=done),fields=new Map(),field=selector=>{if(!fields.has(selector))fields.set(selector,{isConnected:true,innerHTML:'',textContent:'',hidden:false});return fields.get(selector);};
  const state={store:page==='desktop'?null:{listSkills:async()=>[]}},context=vm.createContext({state,publicBuiltinSkills,isIOSPlatform:()=>false,communityEndpoint:()=> 'https://fixture.example/api',loadCommunityCatalog:()=>remote,showCreatorIdentity(){},guard:fn=>fn,t:key=>key,escapeHTML:String,localizeError:error=>error.message,skillTextHTML:(skill,key)=>skill[key]||skill.id,toast(){},routeForPath:()=> 'skills',location:{pathname:'/skills'},$:selector=>selector==='[data-market-more]'?undefined:field(selector),$$:()=>[]});
  const start=source.indexOf(page==='harness'?'async function loadSkillMarket(':'async function renderCommunityPage('),end=source.indexOf(page==='harness'?'\nfunction languageField(':'\nasync function renderFlashPage(',start);vm.runInContext(source.slice(start,end),context);
  const pending=page==='harness'?context.loadSkillMarket():context.renderCommunityPage();for(let i=0;i<10;i++)await Promise.resolve();const rendered=field(page==='harness'?'#catalog-list':'#community-cards').innerHTML;assert.ok(rendered.includes(publicBuiltinSkills()[0].id));assert.equal((rendered.match(/class="skill-card"/g)||[]).length,publicBuiltinSkills().length);if(page==='desktop')assert.equal(rendered.includes('data-community-install'),false);
  resolve({entries:publicBuiltinSkills(),error:new Error('later offline')});await pending;assert.ok(field(page==='harness'?'#catalog-list':'#community-cards').innerHTML.includes(publicBuiltinSkills()[0].id));
 });
});
