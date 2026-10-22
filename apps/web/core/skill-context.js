import {readSkill} from './skills.js';
// Only full instructions still present in the actual projected context count as
// loaded. A compacted-away procedure must be loaded again unless pinned above.
export function contextSkills(messages,skills,current=[]){
 const loaded=new Map();
 const accept=value=>{
  if(!value||typeof value.id!=='string'||typeof value.instructions!=='string')return;
  const path=value.path||'SKILL.md',installed=skills.find(s=>s.id===value.id);if(!installed)return;
  let latest;try{latest=readSkill(skills,value.id,path);}catch{return;}
  // Updated installed instructions are appended in runtime context, while the
  // earlier version remains untouched in the cached history.
  loaded.set(value.id+'\n'+path,latest);
 };
 for(const value of current)accept(value);
 for(const message of messages){
  if(message.role==='tool'&&message.toolName==='skills_load'){
   try{const result=JSON.parse(message.text);if(result.status==='loaded')accept(result);}catch{}
  }
  if(message.runtimeContext===true){try{const value=JSON.parse(message.text.slice(message.text.indexOf('\n')+1));for(const skill of value.loadedSkills||[])accept(skill);}catch{}}
 }
 return [...loaded.values()];
}
export function validPromptPrefix(value,{mode,locale}){
 return value?.version===1&&value.mode===mode&&value.locale===locale&&Array.isArray(value.messages)&&value.messages.length===2&&value.messages[0]?.role==='system'&&value.messages[1]?.role==='user'&&value.messages.every(m=>typeof m.text==='string'&&m.text.length<=1000000);
}
