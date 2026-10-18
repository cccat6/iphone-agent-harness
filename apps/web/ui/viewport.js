// Visual viewport measurements are CSS pixels, including during pinch zoom.
// Keep controls inside that visible rectangle without suppressing browser zoom.
export function viewportGeometry({width,height,top=0,left=0,scale=1,layoutWidth,layoutHeight,userAgent='',editing=false}){
  const positive=(value,fallback)=>Number.isFinite(value)&&value>0?value:fallback;
  layoutWidth=positive(layoutWidth,390);layoutHeight=positive(layoutHeight,844);
  width=positive(width,layoutWidth);height=positive(height,layoutHeight);scale=positive(scale,1);
  return {width,height,top:Math.max(0,Number.isFinite(top)?top:0),left:Math.max(0,Number.isFinite(left)?left:0),scale,
    compact:/iPhone|iPod/i.test(userAgent)||Math.min(layoutWidth,width)<=760,
    short:height<360,
    // Zoom alone shrinks the CSS rectangle. Compare its unzoomed height and
    // require an editable focus before applying keyboard-only presentation.
    keyboard:editing&&layoutHeight-height*scale>120};
}
export function mountViewport({window:win=globalThis.window,document:doc=globalThis.document}={}){
  const view=win.visualViewport;
  const update=()=>{
    const active=doc.activeElement;
    const editing=!!active&&(active.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName));
    const geometry=viewportGeometry({width:view?.width,height:view?.height,top:view?.offsetTop,left:view?.offsetLeft,scale:view?.scale,layoutWidth:win.innerWidth,layoutHeight:win.innerHeight,userAgent:win.navigator?.userAgent,editing});
    for(const key of ['width','height','top','left'])doc.documentElement.style.setProperty('--viewport-'+key,geometry[key]+'px');
    doc.documentElement.style.setProperty('--viewport-scale',String(geometry.scale));
    doc.body.classList.toggle('compact-viewport',geometry.compact);
    doc.body.classList.toggle('short-viewport',geometry.short);
    doc.body.classList.toggle('keyboard-visible',geometry.keyboard);
    return geometry;
  };
  const listeners=[[win,'resize'],[win,'orientationchange'],[doc,'focusin'],[doc,'focusout'],...(view?[[view,'resize'],[view,'scroll']]:[])];
  for(const [target,event] of listeners)target.addEventListener(event,update);
  update();
  return ()=>{for(const [target,event] of listeners)target.removeEventListener(event,update);};
}
