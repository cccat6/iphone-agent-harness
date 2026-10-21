import {toolActivityForMessage} from '../core/tool-activity.js';
// Presentation is derived from stored records; original protocol data stays intact.
export function messagePresentation(message,{developerMode=false,t=key=>key}={}){
 const refs=message.frameRefs||[];
 if(message.internal&&!developerMode)return null;
 if(message.role!=='tool'){
  let text=message.taskPlan?'':message.text||'';
  if(message.role==='assistant'&&!message.taskPlan){const summary=toolActivityForMessage(message).map(activity=>{
   if(activity.kind!=='execute')return t('interaction.activity.'+activity.kind);
   const actions=(activity.actions||[]).map(action=>{let label=t('interaction.operation.'+(action.op==='key'?action.key||'input':action.op));if(action.phases?.length)label+=' ('+action.phases.map(phase=>t('interaction.pointer.'+phase)).join(', ')+')';if(action.direction)label+=' · '+t('interaction.direction.'+action.direction);if(action.point)label+=` (${action.point.x}%, ${action.point.y}%)`;if(action.durationMs!==undefined)label+=` · ${action.durationMs} ms`;return label;});
   return t('interaction.activity.execute')+(actions.length?': '+actions.join(' → '):'')+(activity.more?' · '+t('interaction.moreActions',{count:activity.more}):'');
  }).join('\n');if(summary)text+=(text.trim()?'\n\n':'')+summary;
  }
  if(!text.trim()&&!refs.length&&!message.taskPlan&&!developerMode)return null;
  return {text,frameRefs:refs,plan:message.taskPlan||null,kind:message.internal?'debug':'message',detail:developerMode&&message.toolCalls?.length?JSON.stringify(message.toolCalls,null,2):''};
 }
 let value;try{value=JSON.parse(message.text);}catch{}
 const status=value?.status,name=message.toolName||'';
 let text='';
 if(name==='phone_get_location'&&status==='located')text=t('location.located');
 else if(name==='phone_remember_interaction')text=t('interaction.correctionSaved');
 else if(name==='task_plan')text=value?.summary||'';
 else if(name==='task_report')text=value?.summary||'';
 else if(name==='user_request_input')text=value?.question||'';
 else if(['captured','observed'].includes(status)||refs.length)text=t('interaction.observed');
 else if(['completed','submitted','released','accepted'].includes(status))text=t('interaction.actionComplete');
 else if(['failed','rejected','not_executed','error'].includes(status))text=t('interaction.actionAdjust');
 else if(['unknown','unconfirmed'].includes(status))text=t('interaction.actionUnconfirmed');
 else if(['created','updated'].includes(status))text=t('interaction.skillSaved');
 else if(name.startsWith('skills_')||name==='session_search'||name==='mcp_list_tools')text='';
 else if(value?.summary&&typeof value.summary==='string')text=value.summary;
 else if(developerMode)text=t('interaction.toolResult');
 if(!text&&!refs.length&&!developerMode)return null;
 return {text,frameRefs:refs,kind:'activity',plan:null,detail:developerMode?JSON.stringify(value??message.text,null,2):''};
}

// Keep the reading position until the user returns to the latest message.
export function createConversationFollow({region,onChange=()=>{},requestFrame=globalThis.requestAnimationFrame||((fn)=>setTimeout(fn,0)),cancelFrame=globalThis.cancelAnimationFrame||clearTimeout}={}){
 let following=true,pending=null,destroyed=false,touch=null,returnIntent=false;
 const nearEnd=()=>region.scrollHeight-region.scrollTop-region.clientHeight<100;
 const atEnd=()=>region.scrollHeight-region.scrollTop-region.clientHeight<=6;
 const notify=()=>{try{onChange(following);}catch{}};
 function cancel(){if(pending!==null)cancelFrame(pending);pending=null;}
 function pause(){returnIntent=false;if(following){following=false;notify();}cancel();}
 function scroll(){if(pending!==null||!following||destroyed||touch)return;pending=requestFrame(()=>{pending=null;if(!destroyed&&following&&!touch)region.scrollTop=region.scrollHeight;});}
 function follow(){touch=null;returnIntent=false;if(!following){following=true;notify();}scroll();}
 function wheel(event){if(event.deltaY<0)pause();else if(event.deltaY>0)returnIntent=true;}
 function touchstart(event){const point=event.touches?.[0];touch=point?{y:point.clientY,id:point.identifier}:{};cancel();}
 function touchmove(event){const point=event.touches?.[0];if(!point||!touch||touch.y===undefined){pause();return;}const dy=point.clientY-touch.y;touch.y=point.clientY;if(dy>1)pause();else if(dy<-1&&!following)returnIntent=true;}
 function touchend(){touch=null;if(!following&&returnIntent&&atEnd())follow();else if(following)scroll();}
 function keydown(event){if(['ArrowUp','PageUp','Home'].includes(event.key))pause();else if(event.key==='End')follow();else if(['ArrowDown','PageDown'].includes(event.key))returnIntent=true;}
 function onScroll(){if(!following&&returnIntent&&!touch&&atEnd())follow();}
 const listeners=[['wheel',wheel],['touchstart',touchstart],['touchmove',touchmove],['touchend',touchend],['touchcancel',touchend],['keydown',keydown],['scroll',onScroll]];
 for(const [name,handler]of listeners)region.addEventListener(name,handler,{passive:name!=='keydown'});
 return {beforeRender({force=false}={}){if(force)follow();else if(following&&pending===null&&!touch&&!nearEnd())pause();return following;},afterRender(){scroll();},follow,pause,get following(){return following;},destroy(){destroyed=true;cancel();for(const [name,handler]of listeners)region.removeEventListener(name,handler);}};
}
