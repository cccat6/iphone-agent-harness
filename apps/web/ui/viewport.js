// Keyboard occlusion changes the usable height. Pinch zoom changes the view of
// the document, not the document's layout width or its responsive breakpoint.
export function viewportGeometry({width,height,top=0,scale=1,layoutWidth,layoutHeight,userAgent='',editing=false}){
  const positive=(value,fallback)=>Number.isFinite(value)&&value>0?value:fallback;
  layoutWidth=positive(layoutWidth,390);layoutHeight=positive(layoutHeight,844);
  height=positive(height,layoutHeight);scale=positive(scale,1);
  const zoomed=Math.abs(scale-1)>.01;
  const visibleHeight=Math.min(height*scale,layoutHeight);
  return {width:Math.round(layoutWidth),height:Math.round(visibleHeight),
    top:zoomed?0:Math.round(Math.min(Math.max(0,Number.isFinite(top)?top:0),layoutHeight-visibleHeight)),left:0,scale,
    compact:/iPhone|iPod/i.test(userAgent)||layoutWidth<=760,
    short:layoutHeight<420,
    keyboard:editing&&layoutHeight-visibleHeight>120};
}
export function mountViewport({window:win=globalThis.window,document:doc=globalThis.document,onLayout=()=>{}}={}){
  const view=win.visualViewport,root=doc.documentElement;
  const requestFrame=win.requestAnimationFrame?.bind(win)||((fn)=>setTimeout(fn,16));
  const cancelFrame=win.cancelAnimationFrame?.bind(win)||clearTimeout;
  let pending=null,disposed=false,previous=null;
  const update=()=>{
    pending=null;if(disposed)return;
    const active=doc.activeElement;
    const editing=!!active&&(active.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName));
    const geometry=viewportGeometry({width:view?.width,height:view?.height,top:view?.offsetTop,scale:view?.scale,layoutWidth:root.clientWidth||win.innerWidth,layoutHeight:win.innerHeight,userAgent:win.navigator?.userAgent,editing});
    let changed=false;
    for(const key of ['width','height','top','left'])if(previous?.[key]!==geometry[key]){root.style.setProperty('--viewport-'+key,geometry[key]+'px');changed=true;}
    for(const [key,name]of [['compact','compact-viewport'],['short','short-viewport'],['keyboard','keyboard-visible']])if(previous?.[key]!==geometry[key]){doc.body.classList.toggle(name,geometry[key]);changed=true;}
    previous=geometry;if(changed)onLayout(geometry);
    return geometry;
  };
  const schedule=()=>{if(pending===null&&!disposed)pending=requestFrame(update);};
  const listeners=[[win,'resize'],[win,'orientationchange'],[doc,'focusin'],[doc,'focusout'],...(view?[[view,'resize'],[view,'scroll']]:[])];
  for(const [target,event]of listeners)target.addEventListener(event,schedule,{passive:true});
  // Keep application gestures on the app surface; image previews and public
  // pages retain browser zoom. CSS handles single-finger pan and double taps.
  const preventAppPinch=event=>{
    if(event.target?.closest?.('.image-preview'))return;
    if(doc.body.classList.contains('harness-surface')||event.target?.closest?.('.panel-dialog,.action-dialog'))event.preventDefault();
  };
  doc.addEventListener('gesturestart',preventAppPinch,{passive:false});
  doc.addEventListener('gesturechange',preventAppPinch,{passive:false});
  update();
  return ()=>{disposed=true;if(pending!==null)cancelFrame(pending);for(const [target,event]of listeners)target.removeEventListener(event,schedule);doc.removeEventListener('gesturestart',preventAppPinch);doc.removeEventListener('gesturechange',preventAppPinch);};
}
