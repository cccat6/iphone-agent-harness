// Focus before Safari's default touch focus scroll. Leave the pointer event
// intact so native caret placement, selection and editing still work.
export function mountComposerFocus(input,{document:doc=globalThis.document}={}){
  const focus=event=>{
    if(event.pointerType!=='touch'||event.isPrimary===false||doc.activeElement===input||input.disabled||input.readOnly)return;
    input.focus({preventScroll:true});
  };
  input.addEventListener('pointerdown',focus,{capture:true});
  return ()=>input.removeEventListener('pointerdown',focus,{capture:true});
}
