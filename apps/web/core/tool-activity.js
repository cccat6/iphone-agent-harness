// Small, non-executable view metadata. Never copy typed text, tool arguments,
// clipboard contents, queries, credentials or provider protocol state into it.
const kinds={phone_observe:'observe',phone_execute_plan:'execute',phone_prepare_clipboard:'clipboard',phone_get_location:'location',phone_remember_interaction:'remember',skills_list:'skillsList',skills_load:'skillsLoad',skills_create:'skillsCreate',skills_update:'skillsUpdate',session_search:'search',user_request_input:'question',task_plan:'plan',task_report:'report',mcp_list_tools:'mcpList',mcp_call:'mcpCall'};
const ops=new Set(['tap','drag','swipe','pointer_sequence','capture','observe','wait','home','key']);
const keyKinds=new Set(['input','enter','backspace','tab','space','paste']);
const directions=new Set(['up','down','left','right']);
function point(value){return value&&Number.isFinite(value.x)&&Number.isFinite(value.y)&&value.x>=0&&value.x<=10000&&value.y>=0&&value.y<=10000?{x:Math.round(value.x/100),y:Math.round(value.y/100)}:null;}
function action(step){
 if(!step||!ops.has(step.op))return {op:'other'};
 const out={op:step.op};if(step.op==='tap'){const p=point(step.point);if(p)out.point=p;}
 if(['drag','swipe'].includes(step.op)&&Array.isArray(step.path)&&step.path.length>=2){const a=step.path[0],b=step.path.at(-1);if(point(a)&&point(b)){const x=b.x-a.x,y=b.y-a.y;if(x||y)out.direction=Math.abs(x)>Math.abs(y)?x<0?'left':'right':y<0?'up':'down';}}
 if(step.op==='pointer_sequence'&&Array.isArray(step.events))out.phases=[...new Set(step.events.slice(0,130).map(event=>event?.phase).filter(phase=>['down','move','up'].includes(phase)))];
 if(step.op==='key')out.key=step.usage===25&&(step.modifiers&9)?'paste':({40:'enter',42:'backspace',43:'tab',44:'space'}[step.usage]||'input');
 if(step.op==='wait'&&Number.isFinite(step.durationMs)&&step.durationMs>=0&&step.durationMs<=2000)out.durationMs=Math.round(step.durationMs);
 return out;
}
export function projectToolActivity(calls){
 if(!Array.isArray(calls))return [];
 return calls.slice(0,8).map(call=>{const kind=kinds[call?.name]||'tool',out={kind};if(kind==='skillsLoad'){out.skillId=typeof call.arguments?.id==='string'?call.arguments.id:'';out.skillPath=typeof call.arguments?.path==='string'?call.arguments.path:'SKILL.md';}if(kind==='execute'){const steps=call.arguments?.plan?.steps;if(Array.isArray(steps)){out.actions=steps.slice(0,12).map(action);out.more=Math.max(0,Math.min(10000,steps.length-12));}}return out;});
}
// Recheck incoming view records too: imports and callers may supply arbitrary data.
export function toolActivityForMessage(message){
 if(Array.isArray(message.toolCalls)&&message.toolCalls.length)return projectToolActivity(message.toolCalls);
 if(!Array.isArray(message.toolActivity))return [];
 return message.toolActivity.slice(0,8).map(value=>{
  const kind=Object.values(kinds).includes(value?.kind)?value.kind:'tool',out={kind};
  if(kind==='execute'){
   out.actions=Array.isArray(value.actions)?value.actions.slice(0,12).map(value=>{const op=ops.has(value?.op)?value.op:'other',item={op};if(op==='tap'&&value.point&&[value.point.x,value.point.y].every(n=>Number.isInteger(n)&&n>=0&&n<=100))item.point={x:value.point.x,y:value.point.y};if(directions.has(value.direction))item.direction=value.direction;if(op==='pointer_sequence'&&Array.isArray(value.phases))item.phases=[...new Set(value.phases.filter(phase=>['down','move','up'].includes(phase)))].slice(0,3);if(op==='key'&&keyKinds.has(value.key))item.key=value.key;if(op==='wait'&&Number.isInteger(value.durationMs)&&value.durationMs>=0&&value.durationMs<=2000)item.durationMs=value.durationMs;return item;}):[];
   out.more=Number.isInteger(value.more)?Math.max(0,Math.min(10000,value.more)):0;
  }return out;
 });
}
