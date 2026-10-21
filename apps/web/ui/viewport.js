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
  let pending=null,disposed=false,previous=null,composerKeyboard=false,motionDuration=null;
  const update=()=>{
    pending=null;if(disposed)return;
    const active=doc.activeElement;
    const editing=!!active&&(active.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName));
    // Safari can shrink innerHeight to the keyboard-visible area while keeping
    // a taller layout viewport and panning it. Clamp against the layout height.
    const geometry=viewportGeometry({width:view?.width,height:view?.height,top:view?.offsetTop,scale:view?.scale,layoutWidth:root.clientWidth||win.innerWidth,layoutHeight:root.clientHeight||win.innerHeight,userAgent:win.navigator?.userAgent,editing});
    const composerEditing=active?.id==='message-input';
    if(composerEditing&&geometry.keyboard)composerKeyboard=true;
    const keyboardSettledClosed=geometry.height>=(root.clientHeight||win.innerHeight)-1;
    // On blur, Safari reports the old occluded height until its keyboard has
    // finished hiding. Begin the return now instead of adding a second animation.
    if(composerKeyboard&&!editing&&!doc.body.classList.contains('panel-route')){
      geometry.height=Math.round(root.clientHeight||win.innerHeight);
      geometry.top=0;geometry.keyboard=false;
    }
    let changed=false;
    if(previous?.height!==geometry.height||previous?.width!==geometry.width){
      const animate=composerKeyboard&&previous&&previous.width===geometry.width&&Math.abs(geometry.scale-1)<.01&&!doc.body.classList.contains('panel-route');
      const duration=animate?'240ms':'0ms';
      if(duration!==motionDuration){root.style.setProperty('--keyboard-layout-duration',duration);motionDuration=duration;}
    }
    if(!composerEditing&&keyboardSettledClosed)composerKeyboard=false;
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
  const app=doc.getElementById?.('app'),settled=event=>{if(!disposed&&event.target===app&&event.propertyName==='height')onLayout(previous);};
  app?.addEventListener('transitionend',settled);
  doc.addEventListener('gesturestart',preventAppPinch,{passive:false});
  doc.addEventListener('gesturechange',preventAppPinch,{passive:false});
  update();
  return ()=>{disposed=true;app?.removeEventListener('transitionend',settled);if(pending!==null)cancelFrame(pending);for(const [target,event]of listeners)target.removeEventListener(event,schedule);doc.removeEventListener('gesturestart',preventAppPinch);doc.removeEventListener('gesturechange',preventAppPinch);};
}
