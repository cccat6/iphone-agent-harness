import test from 'node:test';import assert from 'node:assert/strict';
import {downloadSkill} from '../../apps/web/core/skills.js';
const entry={id:'qa-json',url:'./qa-json.skill.json',version:'1.0.0'},base='https://skills.invalid/catalog.json';
const load=value=>downloadSkill(entry,base,{fetchImpl:async()=>Response.json(value)});
test('JSON catalog downloads extract the declared instruction fields and stay community-owned',async()=>{
 for(const field of ['content','instructions','body']){const result=await load({id:entry.id,name:'JSON Skill',version:'1.1.0',[field]:'# Actual instructions\nRead the screen.',source:'authored',readonly:false,creatorId:'forged',provenance:{kind:'authored'},resources:{'notes.md':'Reference'}});assert.equal(result.content,'# Actual instructions\nRead the screen.');assert.equal(result.name,'JSON Skill');assert.equal(result.source,'community');assert.equal(result.readonly,true);assert.equal(result.provenance.kind,'community');assert.equal(result.resources['notes.md'],'Reference');assert.ok(result.id.startsWith('community-url:'));assert.equal(result.creatorId,undefined);}
});
test('JSON catalog downloads reject wrong identity, invalid JSON/body and unsafe resources',async()=>{
 for(const value of [{id:'other',content:'Hi'},{id:entry.id,content:{}},{id:entry.id,body:'Hi',resources:{'../escape.md':'No'}},{id:entry.id,body:'Hi',requiredCapabilities:[{}]},null])await assert.rejects(load(value));
 await assert.rejects(downloadSkill(entry,base,{fetchImpl:async()=>new Response('{bad')}));
});
test('plain Markdown catalog downloads keep their complete original body',async()=>{const content='# Markdown\n{"example":"literal JSON"}';const result=await downloadSkill({...entry,url:'./SKILL.md'},base,{fetchImpl:async()=>new Response(content)});assert.equal(result.content,content);assert.equal(result.source,'community');});

test('extensionless JSON endpoints use their response media type',async()=>{const result=await downloadSkill({...entry,url:'./download'},base,{fetchImpl:async()=>Response.json({id:entry.id,instructions:'# Endpoint instructions'})});assert.equal(result.content,'# Endpoint instructions');});
