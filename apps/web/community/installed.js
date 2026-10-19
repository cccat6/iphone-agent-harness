import {digest} from './common.js';
// Local edits are never an upstream update. Keep this baseline separate from
// publisher signatures and from the user's enabled/disabled preference.
export function installedContent(skill){return {name:skill.name||'',description:skill.description||'',version:skill.version||'',content:skill.content||'',resources:skill.resources||{},requiredCapabilities:skill.requiredCapabilities||[]};}
export const installedDigest=skill=>digest(installedContent(skill));
export async function sealInstalledSkill(skill){return {...skill,installedDigest:await installedDigest(skill)};}
export async function isUnchangedInstall(skill){
 if(skill?.source!=='community'||skill.readonly!==true||skill.provenance?.kind!=='community')return false;
 const publication=skill.publication,publisher=skill.provenance.creatorId;
 if(publisher&&(publication?.digest!==skill.provenance.digest||publication?.revision!==skill.provenance.revision||publication?.envelope?.payload?.package?.creatorId!==publisher||publication?.envelope?.payload?.package?.slug!==skill.provenance.slug))return false;
 if(!publisher&&skill.provenance.sourceUrl!==skill.sourceUrl)return false;
 const actual=await installedDigest(skill);if(skill.installedDigest)return actual===skill.installedDigest;
 // Signed downloads from earlier releases already retain their original package.
 const pkg=skill.publication?.envelope?.payload?.package;
 if(!pkg||pkg.creatorId!==skill.provenance.creatorId||pkg.slug!==skill.provenance.slug)return false;
 return actual===await installedDigest({name:pkg.name,description:pkg.description,version:pkg.version,content:pkg.files?.['SKILL.md'],resources:pkg.files});
}
