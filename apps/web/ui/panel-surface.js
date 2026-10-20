// Full-screen mobile forms use normal document scrolling so Safari owns focus
// scrolling while its keyboard animates. Desktop panels remain native modals.
const mobileSurfaces=new WeakSet();
export function showPanelSurface(dialog,{window:win=globalThis.window,document:doc=globalThis.document}={}){
  if(dialog.open)return;
  if(mobileSurfaces.has(dialog)){dialog.show();win.scrollTo(0,0);return;}
  const mobile=/iPhone|iPod/i.test(win.navigator?.userAgent||'')||(doc.documentElement.clientWidth||win.innerWidth)<=760;
  if(!mobile){dialog.showModal();return;}
  const background=[...doc.querySelectorAll('#app,#site')].map(node=>[node,node.inert]);
  const previousFocus=doc.activeElement,scrollX=win.scrollX||0,scrollY=win.scrollY||0;
  for(const [node]of background)node.inert=true;
  doc.body.classList.add('panel-route');mobileSurfaces.add(dialog);
  const restore=()=>{
    if(dialog.open)return;mobileSurfaces.delete(dialog);
    dialog.removeEventListener('keydown',escape);dialog.removeEventListener('close',restore);
    if(dialog.contains(doc.activeElement))doc.activeElement?.blur?.();
    doc.body.classList.remove('panel-route');
    for(const [node,inert]of background)node.inert=inert;
    win.scrollTo(scrollX,scrollY);
    if(previousFocus?.isConnected&&!previousFocus.closest?.('[inert]'))previousFocus.focus?.({preventScroll:true});
  };
  const escape=event=>{if(event.key==='Escape'&&!event.defaultPrevented&&!event.isComposing){event.preventDefault();dialog.close();}};
  dialog.addEventListener('close',restore);dialog.addEventListener('keydown',escape);
  try{dialog.show();win.scrollTo(0,0);}catch(error){restore();throw error;}
}
