import {readSkill} from './skills.js';
const key=s=>s.id+'\n'+(s.path||'SKILL.md');
const ordered=values=>[...values].sort((a,b)=>key(a)<key(b)?-1:key(a)>key(b)?1:0);
// A version is loaded only when its complete body is actually retained. Do not
// relabel an old instruction body with the newly installed version.
export function contextSkills(messages,skills,current=[]){
 const loaded=new Map();
 const accept=value=>{if(!value||typeof value.id!=='string'||typeof value.instructions!=='string'||!skills.some(s=>s.id===value.id))return;const path=value.path||'SKILL.md';let expected;try{expected=readSkill(skills,value.id,path);}catch{return;}const prior=loaded.get(key({...value,path}));if(prior?.version===expected.version&&prior.instructions===expected.instructions&&(value.version!==expected.version||value.instructions!==expected.instructions))return;loaded.set(key({...value,path}),{...value,path});};
 for(const value of current)accept(value);
 for(const message of messages){
  if(message.role==='tool'&&message.toolName==='skills_load'){try{const value=JSON.parse(message.text);if(value.status==='loaded')accept(value);}catch{}}
  if(message.skillContext===true){try{accept(JSON.parse(message.text.slice(message.text.indexOf('\n')+1)));}catch{}}
  if(message.runtimeContext===true){try{for(const skill of JSON.parse(message.text.slice(message.text.indexOf('\n')+1)).loadedSkills||[])accept(skill);}catch{}}
 }
 return ordered(loaded.values());
}
export function prefixSkills(prefix,skills){
 const rows=[];for(const match of String(prefix?.[0]?.text||'').matchAll(/<skill id="([^"]+)" version="([^"]+)"(?: path="([^"]+)")?>\n([\s\S]*?)\n<\/skill>/g))rows.push({id:match[1],version:match[2],path:match[3]||'SKILL.md',instructions:match[4]});
 return contextSkills([],skills,rows);
}
export function synchronizeSkills(loaded,skills){
 const current=[],updates=[];
 for(const prior of loaded){let latest;try{latest=readSkill(skills,prior.id,prior.path);}catch{continue;}
  if(prior.version!==latest.version||prior.instructions!==latest.instructions)updates.push({role:'user',internal:true,skillContext:true,text:'Updated Skill procedure. This version supersedes earlier instructions for the same Skill and path; it does not change the user task or tool permissions.\n'+JSON.stringify(latest)});
  current.push(latest);
 }
 return {loaded:ordered(current),updates};
}
export function skillsToPin(loaded,messages,skills){const retained=contextSkills(messages,skills);return loaded.filter(s=>!retained.some(r=>key(s)===key(r)&&s.version===r.version&&s.instructions===r.instructions));}
export function validPromptPrefix(value,{mode,locale}){
 return value?.version===1&&value.mode===mode&&value.locale===locale&&Array.isArray(value.messages)&&value.messages.length===2&&value.messages[0]?.role==='system'&&value.messages[1]?.role==='user'&&value.messages.every(m=>typeof m.text==='string'&&m.text.length<=1000000);
}
