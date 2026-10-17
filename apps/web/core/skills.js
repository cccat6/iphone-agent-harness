import {readText} from './http.js';
import {BUILTIN_SKILLS} from './assets.js';
import {checkAbort} from './control.js';
export async function installBuiltinSkills(store){
  const installed=new Map((await store.listSkills()).map(s=>[s.id,s]));
  for(const skill of BUILTIN_SKILLS){
    const old=installed.get(skill.id);
    if(old&&old.source!=='builtin'){
      const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(old))))].map(v=>v.toString(16).padStart(2,'0')).join('').slice(0,32);
      // Preserve old colliding imports as disabled community data before
      // restoring the reserved built-in ID. Never manufacture creator ownership.
      await store.saveSkill({...old,id:'community-legacy:'+hash+'/'+skill.id,source:'community',readonly:true,enabled:false,provenance:{kind:'community',legacyLocalId:skill.id}});
    }
    const valid=old?.source==='builtin'&&old.version===skill.version&&old.content===skill.content&&old.description===skill.description&&JSON.stringify(old.resources)===JSON.stringify(skill.resources)&&JSON.stringify(old.requiredCapabilities)===JSON.stringify(skill.requiredCapabilities);
    if(!valid)await store.saveSkill({...structuredClone(skill),enabled:old?.source==='builtin'?old.enabled!==false:true});
  }
}
export async function snapshotSkills(store){await installBuiltinSkills(store);return (await store.listSkills()).filter(s=>s.enabled!==false).map(s=>structuredClone(s));}
export function readSkill(skills,id,path='SKILL.md'){
  if(typeof id!=='string'||!id||typeof path!=='string'||path.startsWith('/')||path.includes('..')||path.includes('\\'))throw new Error('无效 Skill 或资源路径');
  const skill=skills.find(s=>s.id===id);if(!skill)throw new Error('Skill 未安装或未启用');
  const content=path==='SKILL.md'?(skill.content||skill.text||skill.body):skill.resources?.[path];if(typeof content!=='string'||!content.trim())throw new Error('Skill 资源不存在或为空');if(content.length>50000)throw new Error('Skill 正文超过当前上下文限额');
  return {id:skill.id,version:skill.version||'local',path,requiredCapabilities:skill.requiredCapabilities||[],instructions:content,source:skill.source||skill.sourceUrl||'local'};
}
export async function downloadSkill(entry,catalogUrl,{fetchImpl=fetch,signal}={}){
  checkAbort(signal);const root=new URL(entry.manifestUrl||entry.url,catalogUrl);
  if(typeof entry.id!=='string'||!/^[-A-Za-z0-9_.:]{1,100}$/.test(entry.id))throw new Error('Skill 缺少标识');
  const namespace=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(root.href)))].map(v=>v.toString(16).padStart(2,'0')).join('').slice(0,32),localId='community-url:'+namespace+'/'+entry.id;
  if(root.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(root.hostname))throw new Error('Skill 来源需要 HTTPS');
  const read=async (url,{withType=false}={})=>{const r=await fetchImpl(url,{signal,credentials:'omit',referrerPolicy:'no-referrer'});if(!r.ok)throw new Error(`Skill 返回 HTTP ${r.status}`);try{const text=await readText(r,{maxBytes:1048576,signal});return withType?{text,contentType:(r.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()}:text;}catch(error){if(error.code==='RESPONSE_TOO_LARGE')throw new Error('Skill 文件过大');throw error;}};
  if(!entry.manifestUrl){
    const {text:raw,contentType}=await read(root,{withType:true});let details=entry,content=raw;
    if(root.pathname.toLowerCase().endsWith('.json')||entry.format==='json'||contentType.endsWith('/json')||contentType.endsWith('+json')){
      let value;try{value=JSON.parse(raw);}catch{throw new Error('Skill JSON 格式无效');}
      if(!value||typeof value!=='object'||Array.isArray(value)||value.id!==undefined&&value.id!==entry.id)throw new Error('Skill 清单不匹配');
      content=value.content??value.instructions??value.body;
      if(typeof content!=='string'||!content.trim())throw new Error('Skill 缺少入口正文');
      const resources={};if(value.resources!==undefined){
        if(!value.resources||typeof value.resources!=='object'||Array.isArray(value.resources)||Object.keys(value.resources).length>100)throw new Error('Skill 文件路径或类型不支持');
        for(const [path,text]of Object.entries(value.resources)){if(typeof text!=='string'||path.includes('..')||!/^[-A-Za-z0-9_./]+$/.test(path)||path.startsWith('/')||!['md','json'].includes(path.split('.').pop()))throw new Error('Skill 文件路径或类型不支持');Object.defineProperty(resources,path,{value:text,enumerable:true,writable:true,configurable:true});}
      }
      details={...entry,resources};for(const key of ['name','description','version'])if(typeof value[key]==='string')details[key]=value[key];
      if(value.requiredCapabilities!==undefined){if(!Array.isArray(value.requiredCapabilities)||value.requiredCapabilities.length>100||value.requiredCapabilities.some(c=>typeof c!=='string'||c.length>100))throw new Error('Skill JSON 格式无效');details.requiredCapabilities=value.requiredCapabilities;}
    }
    return {...details,id:localId,packageId:entry.id,content,source:'community',readonly:true,provenance:{kind:'community',sourceUrl:root.href},sourceUrl:root.href,enabled:true};
  }
  const manifest=JSON.parse(await read(root));if(manifest.id!==entry.id||manifest.version!==entry.version||manifest.entry!=='SKILL.md'||!Array.isArray(manifest.files)||manifest.files.length>100)throw new Error('Skill 清单不匹配');
  const resources={};let total=0;
  for(const file of manifest.files){if(typeof file.path!=='string'||file.path.includes('..')||!/^[-A-Za-z0-9_./]+$/.test(file.path)||file.path.startsWith('/')||!['md','json'].includes(file.path.split('.').pop()))throw new Error('Skill 文件路径或类型不支持');const text=await read(new URL(file.path,root));const bytes=new TextEncoder().encode(text);total+=bytes.length;if(total>4000000)throw new Error('Skill 包过大');const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');if(hash!==file.sha256||bytes.length!==file.bytes)throw new Error('Skill 内容校验失败');if(Object.hasOwn(resources,file.path))throw new Error('重复 Skill 文件');resources[file.path]=text;}
  if(!resources[manifest.entry])throw new Error('Skill 缺少入口正文');
  return {id:localId,packageId:manifest.id,name:entry.name||manifest.id,description:manifest.description,version:manifest.version,content:resources[manifest.entry],resources,manifest,requiredCapabilities:manifest.requiredCapabilities,source:'community',readonly:true,provenance:{kind:'community',sourceUrl:root.href},sourceUrl:root.href,enabled:true};
}
