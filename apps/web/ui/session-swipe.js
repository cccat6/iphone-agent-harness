// Row gestures never trigger a mutation by distance; users choose a revealed action.
export function mountSessionSwipe({root,onAction=()=>{},onError=()=>{},now=Date.now}={}){
 let opened=null,gesture=null,consumed=null;const listeners=[];
 const listen=(type,handler,options)=>{root.addEventListener(type,handler,options);listeners.push(()=>root.removeEventListener(type,handler,options));};
 const rowOf=target=>target?.closest?.('[data-session-row]');
 const width=row=>row.querySelector('[data-swipe-actions]')?.getBoundingClientRect?.().width||row.querySelectorAll('[data-session-action]').length*78;
 function set(row,distance,animate=true){row.classList.toggle('swipe-dragging',!animate);row.style.setProperty('--session-swipe-x',distance+'px');}
 function close(){if(!opened)return;set(opened,0);opened.classList.remove('swipe-open');const actions=opened.querySelector('[data-swipe-actions]');actions.inert=true;actions.setAttribute('aria-hidden','true');opened=null;}
 function open(row){if(opened!==row)close();opened=row;row.classList.add('swipe-open');set(row,-width(row));const actions=row.querySelector('[data-swipe-actions]');actions.inert=false;actions.setAttribute('aria-hidden','false');}
 function start(event,point,kind){const row=rowOf(event.target);if(!row||event.target.closest?.('[data-session-action]'))return;if(point.clientX<=24)return;gesture={row,id:point.identifier??event.pointerId,x:point.clientX,y:point.clientY,dx:0,kind,axis:null,base:opened===row?-width(row):0};}
 function move(event,point){if(!gesture||!point)return;const dx=point.clientX-gesture.x,dy=point.clientY-gesture.y;
  if(!gesture.axis){if(Math.max(Math.abs(dx),Math.abs(dy))<10)return;if(Math.abs(dy)>Math.abs(dx)*.85){gesture=null;return;}gesture.axis='horizontal';if(opened&&opened!==gesture.row)close();}
  if(gesture.axis!=='horizontal')return;event.preventDefault();gesture.dx=dx;set(gesture.row,Math.max(-width(gesture.row),Math.min(0,gesture.base+dx)),false);
 }
 function end(){const item=gesture;gesture=null;if(!item||item.axis!=='horizontal')return;const distance=Math.max(-width(item.row),Math.min(0,item.base+item.dx));if(distance< -Math.min(50,width(item.row)*.4))open(item.row);else{set(item.row,0);if(opened===item.row)close();}consumed={row:item.row,until:now()+650};}
 listen('touchstart',event=>{consumed=null;if(event.touches.length===1)start(event,event.touches[0],'touch');else gesture=null;},{passive:true});
 listen('touchmove',event=>{if(gesture?.kind==='touch')move(event,[...event.touches].find(point=>point.identifier===gesture.id));},{passive:false});
 listen('touchend',end,{passive:true});listen('touchcancel',()=>{if(gesture){set(gesture.row,gesture.base);gesture=null;}},{passive:true});
 listen('pointerdown',event=>{if(event.pointerType==='mouse'&&event.button===0){consumed=null;start(event,event,'mouse');}},{passive:true});
 listen('pointermove',event=>{if(gesture?.kind==='mouse')move(event,event);},{passive:false});listen('pointerup',end,{passive:true});listen('pointercancel',()=>{if(gesture){set(gesture.row,gesture.base);gesture=null;}},{passive:true});
 listen('click',event=>{const row=rowOf(event.target),action=event.target.closest?.('[data-session-action]');if(action)return;if(consumed&&row===consumed.row&&now()<consumed.until&&event.detail!==0){consumed=null;event.preventDefault();event.stopImmediatePropagation();return;}if(opened&&row===opened&&event.target.closest?.('[data-session]')){event.preventDefault();event.stopImmediatePropagation();close();}else if(opened&&row!==opened)close();},{capture:true});
 listen('click',event=>{const button=event.target.closest?.('[data-session-action]');if(!button)return;event.preventDefault();event.stopPropagation();const row=rowOf(button);close();Promise.resolve(onAction(button.dataset.sessionAction,row.dataset.sessionRow)).catch(onError);});
 listen('contextmenu',event=>{const row=rowOf(event.target);if(row){event.preventDefault();open(row);}});
 listen('keydown',event=>{const row=rowOf(event.target);if(event.key==='Escape'){close();return;}if(row&&event.key==='ArrowLeft'){event.preventDefault();open(row);}else if(row&&event.key==='ArrowRight'){event.preventDefault();close();}});
 for(const row of root.querySelectorAll('[data-session-row]')){const actions=row.querySelector('[data-swipe-actions]');actions.inert=true;actions.setAttribute('aria-hidden','true');}
 return {open,close,destroy(){close();gesture=null;for(const remove of listeners)remove();}};
}
