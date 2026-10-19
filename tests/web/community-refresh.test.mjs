import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from '../../apps/web/core/store.js';
import {openCreatorIdentity} from '../../apps/web/community/identity.js';
import {createAuthoredSkill,updateAuthoredSkill,toSkillPackage,importOwnSkillFile} from '../../apps/web/community/authoring.js';
import {digest} from '../../apps/web/community/common.js';
import {CommunityClient} from '../../apps/web/community/client.js';
import {publicBuiltinSkills,loadCommunityCatalog,readCatalogSkill,syncInstalledCommunitySkills,snapshotSkills,downloadSkill} from '../../apps/web/core/skills.js';
import {COMMUNITY_REFINEMENT_MESSAGES} from '../../apps/web/locales/community-refinement.js';
const endpoint='https://community.example/api';
async function fixture(){
 const store=await openStore({memory:true}),identity=await openCreatorIdentity({memory:true});let authored=await createAuthoredSkill({store,identity,input:{slug:'picker',name:'Picker',description:'Time picker',content:'Version one'}}),revision=1;
 async function record(){const pkg=toSkillPackage(authored,identity.creatorId),payload={format:'iah-publication/1',action:'publish',audience:'https://community.example',creatorId:identity.creatorId,nonce:crypto.randomUUID().replaceAll('-',''),issuedAt:Date.now(),expiresAt:Date.now()+120000,expectedRevision:revision-1,previousDigest:'',package:pkg};return {revision,digest:await digest(pkg),envelope:{publicKey:identity.publicKey,payload,signature:await identity.sign(payload)}};}
 const fetchImpl=async()=>Response.json(await record()),client=new CommunityClient({baseUrl:endpoint,fetchImpl});
 return {store,identity,client,fetchImpl,async next(){authored=await updateAuthoredSkill({store,identity,id:authored.id,patch:{content:'Version two'}});revision++;},get authored(){return authored;}};
}
test('public catalog always exposes read-only bundled instructions even if community backend fails, and paginates publications without duplicate builtins',async()=>{
 const result=await loadCommunityCatalog({endpoint,fetchImpl:async()=>{throw new Error('offline');}});assert.ok(result.error);assert.deepEqual(result.entries.map(item=>item.id),publicBuiltinSkills().map(item=>item.id));assert.ok(result.entries.every(item=>item.readonly&&item.source==='builtin'));
 const skill=await readCatalogSkill(result.entries[0]);assert.ok(skill.content.length>0);assert.equal(skill.readonly,true);
 const page=await loadCommunityCatalog({endpoint,cursor:'next',fetchImpl:async url=>{assert.equal(new URL(url).searchParams.get('cursor'),'next');return Response.json({items:[{slug:'published',source:'builtin'}],cursor:null});}});assert.equal(page.entries.length,1);assert.equal(page.entries[0].source,'community');
});
test('refresh updates only untouched signed downloads, retains enabled state and cannot change a running snapshot',async()=>{
 const f=await fixture();try{const downloaded=await f.client.download(f.identity.creatorId,'picker');await f.store.saveSkill(downloaded);const snapshot=await snapshotSkills(f.store);await f.store.saveSkill({...downloaded,enabled:false});await f.next();const result=await syncInstalledCommunitySkills(f.store,{endpoint,fetchImpl:f.fetchImpl});assert.deepEqual(result.updated,[downloaded.id]);const installed=(await f.store.listSkills()).find(s=>s.id===downloaded.id);assert.equal(installed.content,'Version two');assert.equal(installed.enabled,false);assert.equal(installed.source,'community');assert.equal(installed.readonly,true);assert.equal(installed.provenance.creatorId,f.identity.creatorId);assert.equal(f.authored.content,'Version two');assert.equal(snapshot.find(s=>s.id===f.authored.id).content,'Version one');assert.equal(snapshot.find(s=>s.id===downloaded.id).content,'Version one');assert.equal(snapshot.find(s=>s.id===downloaded.id).enabled,true);}finally{f.store.close();}
});
test('refresh skips edited downloads, changed provenance, unknown legacy imports, and authored content',async()=>{
 const f=await fixture();try{const downloaded=await f.client.download(f.identity.creatorId,'picker');await f.store.saveSkill({...downloaded,content:'My local adjustment'});await f.next();let calls=0;let result=await syncInstalledCommunitySkills(f.store,{endpoint,fetchImpl:async(...args)=>{calls++;return f.fetchImpl(...args);}});assert.equal(calls,0);assert.deepEqual(result.skipped,[downloaded.id]);assert.equal((await f.store.listSkills()).find(s=>s.id===downloaded.id).content,'My local adjustment');
 await f.store.saveSkill({...downloaded,provenance:{...downloaded.provenance,digest:'changed'}});result=await syncInstalledCommunitySkills(f.store,{endpoint,fetchImpl:async()=>{calls++;throw new Error('must not fetch');}});assert.equal(calls,0);assert.deepEqual(result.skipped,[downloaded.id]);assert.equal((await f.store.listSkills()).find(s=>s.id===f.authored.id).source,'authored');
 }finally{f.store.close();}
});
test('one failed update retains existing content and newer site endpoint cannot redirect an old installed source',async()=>{
 const f=await fixture();try{const downloaded=await f.client.download(f.identity.creatorId,'picker');await f.store.saveSkill(downloaded);let result=await syncInstalledCommunitySkills(f.store,{endpoint,fetchImpl:async()=>{throw new Error('offline');}});assert.equal(result.errors.length,1);assert.equal((await f.store.listSkills()).find(s=>s.id===downloaded.id).content,'Version one');let calls=0;result=await syncInstalledCommunitySkills(f.store,{endpoint:'https://other.example/api',fetchImpl:async()=>{calls++;}});assert.equal(calls,0);assert.deepEqual(result.skipped,[downloaded.id]);}finally{f.store.close();}
});
test('a downloaded record changed while an upstream request is pending is not overwritten by its late update',async()=>{
 const f=await fixture();try{const downloaded=await f.client.download(f.identity.creatorId,'picker');await f.store.saveSkill(downloaded);await f.next();let release,entered;const started=new Promise(resolve=>entered=resolve);const pending=syncInstalledCommunitySkills(f.store,{endpoint,fetchImpl:async(...args)=>{entered();await new Promise(resolve=>release=resolve);return f.fetchImpl(...args);}});await started;await f.store.saveSkill({...downloaded,content:'Edited during request'});release();const result=await pending;assert.deepEqual(result.updated,[]);assert.deepEqual(result.skipped,[downloaded.id]);assert.equal((await f.store.listSkills()).find(s=>s.id===downloaded.id).content,'Edited during request');}finally{f.store.close();}
});
test('own file creation/editing preserves owner namespace and rejects imported community ownership',async()=>{
 const f=await fixture();try{const created=await importOwnSkillFile({store:f.store,identity:f.identity,text:'# My procedure',fileName:'my-procedure.md'});assert.equal(created.source,'authored');assert.equal(created.provenance.creatorId,f.identity.creatorId);const changed=await importOwnSkillFile({store:f.store,identity:f.identity,text:JSON.stringify({...created,content:'New procedure'}),fileName:'own.json'});assert.equal(changed.id,created.id);assert.equal(changed.version,'1.0.1');const downloaded=await f.client.download(f.identity.creatorId,'picker');await assert.rejects(importOwnSkillFile({store:f.store,identity:f.identity,text:JSON.stringify(downloaded),fileName:'downloaded.json'}),error=>error.code==='SKILL_NOT_OWNED');const other=await openCreatorIdentity({memory:true});await assert.rejects(importOwnSkillFile({store:f.store,identity:other,text:JSON.stringify(created),fileName:'other.json'}),error=>error.code==='SKILL_NOT_OWNED');}finally{f.store.close();}
});
test('community workflow and update guidance are present in all eight supported languages',()=>{assert.equal(Object.keys(COMMUNITY_REFINEMENT_MESSAGES).length,8);for(const table of Object.values(COMMUNITY_REFINEMENT_MESSAGES))for(const value of Object.values(table))assert.equal(typeof value,'string');});

test('URL catalog refresh keeps its exact approved source and updates only an unchanged saved package',async()=>{
 const store=await openStore({memory:true}),catalogUrl='https://catalog.example/skills/catalog.json',entry={id:'picker-helper',version:'1.0.0',url:'./picker.json'};let version='1.0.0';
 const fetchImpl=async url=>Response.json(String(url)===catalogUrl?{skills:[{...entry,version}]}:{id:entry.id,name:'Picker helper',version,content:'Instructions '+version});
 try{const skill=await downloadSkill(entry,catalogUrl,{fetchImpl});await store.saveSkill(skill);version='1.0.1';const result=await syncInstalledCommunitySkills(store,{fetchImpl});assert.deepEqual(result.updated,[skill.id]);const updated=(await store.listSkills())[0];assert.equal(updated.content,'Instructions 1.0.1');assert.equal(updated.sourceUrl,skill.sourceUrl);assert.equal(updated.provenance.sourceUrl,skill.sourceUrl);assert.equal(updated.source,'community');}finally{store.close();}
});
test('signed downloads from the previous release can establish their unchanged content from retained signed publication',async()=>{
 const f=await fixture();try{const skill=await f.client.download(f.identity.creatorId,'picker');delete skill.installedDigest;await f.store.saveSkill(skill);await f.next();const result=await syncInstalledCommunitySkills(f.store,{endpoint,fetchImpl:f.fetchImpl});assert.deepEqual(result.updated,[skill.id]);assert.equal((await f.store.listSkills()).find(row=>row.id===skill.id).content,'Version two');}finally{f.store.close();}
});
