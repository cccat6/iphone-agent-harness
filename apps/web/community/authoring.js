import {fail,validateSlug,validatePackage,digest} from './common.js';
export function isOwnedAuthored(skill,creatorId){return skill?.source==='authored'&&skill.provenance?.kind==='authored'&&skill.provenance.creatorId===creatorId&&skill.id===`${creatorId}/${skill.provenance.slug}`;}
export function toSkillPackage(skill,creatorId){if(!isOwnedAuthored(skill,creatorId))fail('SKILL_NOT_OWNED');return validatePackage({format:'iah-skill/1',creatorId,slug:skill.provenance.slug,name:skill.name,description:skill.description||'',version:skill.version,files:{...(skill.resources||{}),'SKILL.md':skill.content}});}
async function saved(store,identity,skill,{create=false,expectedDigest}={}){
 const pkg=toSkillPackage(skill,identity.creatorId);skill.provenance.digest=await digest(pkg);
 const write=create?store.createSkill:store.compareAndSwapSkill;if(typeof write!=='function')fail('AUTHORING_STORE_UNSUPPORTED');
 const result=await (create?write.call(store,skill):write.call(store,skill,expectedDigest));if(!result||result.id!==skill.id)fail('AUTHORING_STORE_UNSUPPORTED');return structuredClone(result);
}
export async function createAuthoredSkill({store,identity,input}){
 if(!identity?.creatorId)fail('IDENTITY_REQUIRED');if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['slug','name','description','content','resources'].includes(k)))fail('INVALID_PAYLOAD');const slug=validateSlug(input.slug),id=`${identity.creatorId}/${slug}`;if(id.length>200)fail('INVALID_SLUG');if((await store.listSkills()).some(s=>s.id===id))fail('SKILL_EXISTS');
 return saved(store,identity,{id,name:input.name,description:input.description||'',content:input.content,resources:structuredClone(input.resources||{}),version:'1.0.0',source:'authored',enabled:true,readonly:false,provenance:{kind:'authored',creatorId:identity.creatorId,slug}},{create:true});
}
export async function updateAuthoredSkill({store,identity,id,patch}){
 if(!identity?.creatorId)fail('IDENTITY_REQUIRED');const skill=(await store.listSkills()).find(s=>s.id===id);if(!skill)fail('SKILL_NOT_FOUND');if(!isOwnedAuthored(skill,identity.creatorId))fail('SKILL_READ_ONLY');if(!patch||Object.keys(patch).some(k=>!['name','description','content','resources'].includes(k)))fail('INVALID_PAYLOAD');const parts=skill.version.split('.').map(Number);parts[2]++;return saved(store,identity,{...skill,...structuredClone(patch),version:parts.join('.')},{expectedDigest:skill.provenance.digest});
}

// File import is an explicit authoring action, never an ownership conversion for
// a downloaded community package. Creator identity can be restored separately.
export async function importOwnSkillFile({store,identity,text,fileName='skill.md'}){
 if(!identity?.creatorId)fail('IDENTITY_REQUIRED');
 let value;if(/\.json$/i.test(fileName)){try{value=JSON.parse(text);}catch{fail('INVALID_PAYLOAD');}if(!value||typeof value!=='object'||Array.isArray(value))fail('INVALID_PAYLOAD');}
 else value={content:text,name:String(fileName).replace(/\.[^.]+$/,'')};
 if(['community','builtin'].includes(value.source)||value.readonly===true||value.id&&(typeof value.id!=='string'||!value.id.startsWith(identity.creatorId+'/'))||value.provenance?.creatorId&&value.provenance.creatorId!==identity.creatorId)fail('SKILL_NOT_OWNED');
 const candidate=value.slug||value.provenance?.slug||value.id?.slice(identity.creatorId.length+1)||String(fileName).replace(/\.[^.]+$/,'').toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');
 const slug=validateSlug(candidate||'skill-'+crypto.randomUUID().slice(0,8)),input={slug,name:value.name||slug,description:value.description||'',content:value.content||value.instructions||value.body,resources:value.resources||{}};
 const existing=(await store.listSkills()).find(skill=>skill.id===identity.creatorId+'/'+slug);
 if(existing){const {slug:unused,...patch}=input;return updateAuthoredSkill({store,identity,id:existing.id,patch});}
 return createAuthoredSkill({store,identity,input});
}
