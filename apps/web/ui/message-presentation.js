// Presentation is derived from stored records; original protocol data stays intact.
export function messagePresentation(message,{developerMode=false,t=key=>key}={}){
 const refs=message.frameRefs||[];
 if(message.internal&&!developerMode)return null;
 if(message.role!=='tool')return {text:message.taskPlan?'':message.text||'',frameRefs:refs,plan:message.taskPlan||null,kind:message.internal?'debug':'message',detail:developerMode&&message.toolCalls?.length?JSON.stringify(message.toolCalls,null,2):''};
 let value;try{value=JSON.parse(message.text);}catch{}
 const status=value?.status,name=message.toolName||'';
 let text='';
 if(name==='task_plan')text=value?.summary||'';
 else if(name==='task_report')text=value?.summary||'';
 else if(name==='user_request_input')text=value?.question||'';
 else if(['captured','observed'].includes(status)||refs.length)text=t('interaction.observed');
 else if(['completed','submitted','released','accepted'].includes(status))text=t('interaction.actionComplete');
 else if(['failed','rejected','not_executed'].includes(status))text=t('interaction.actionAdjust');
 else if(['unknown','unconfirmed'].includes(status))text=t('interaction.actionUnconfirmed');
 else if(['created','updated'].includes(status))text=t('interaction.skillSaved');
 else if(name.startsWith('skills_')||name==='session_search'||name==='mcp_list_tools')text='';
 else if(value?.summary&&typeof value.summary==='string')text=value.summary;
 else if(developerMode)text=t('interaction.toolResult');
 if(!text&&!refs.length&&!developerMode)return null;
 return {text,frameRefs:refs,kind:'activity',plan:null,detail:developerMode?JSON.stringify(value??message.text,null,2):''};
}

// Keep the reading position until the user returns to the latest message.
export function createConversationFollow({region,requestFrame=globalThis.requestAnimationFrame||((fn)=>setTimeout(fn,0)),cancelFrame=globalThis.cancelAnimationFrame||clearTimeout}={}){
 let following=true,pending=null,destroyed=false;
 const nearEnd=()=>region.scrollHeight-region.scrollTop-region.clientHeight<100;
 function scroll(){if(pending!==null||!following||destroyed)return;pending=requestFrame(()=>{pending=null;if(!destroyed&&following)region.scrollTop=region.scrollHeight;});}
 function intent(event){if(event.type==='wheel'&&event.deltaY<0)following=false;else if(event.type==='touchmove')following=false;else following=nearEnd();}
 region.addEventListener('wheel',intent,{passive:true});region.addEventListener('touchmove',intent,{passive:true});
 function onScroll(){if(!following&&nearEnd()){following=true;scroll();}}
 region.addEventListener('scroll',onScroll,{passive:true});
 return {beforeRender({force=false}={}){if(force)following=true;else if(pending===null&&!nearEnd())following=false;return following;},afterRender(){scroll();},follow(){following=true;scroll();},get following(){return following;},destroy(){destroyed=true;if(pending!==null)cancelFrame(pending);region.removeEventListener('wheel',intent);region.removeEventListener('touchmove',intent);region.removeEventListener('scroll',onScroll);}};
}
