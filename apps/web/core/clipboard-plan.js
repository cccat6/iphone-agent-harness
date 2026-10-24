// A queued copy must never fall through to pasting whatever was previously in
// the system clipboard. This gate only applies while this Harness has a request.
import {keyboardInput} from './keyboard.js';
const pasteChord=(usage,modifiers)=>usage===25&&Boolean(modifiers&0x99)||usage===73&&Boolean(modifiers&0x22);
export function containsPasteInput(value={}) {
  return Array.isArray(value.steps)&&value.steps.some(step=>{if(step.op!=='key')return false;const key=keyboardInput(step);return pasteChord(key.usage,key.modifiers);})||
    Array.isArray(value.events)&&value.events.some(event=>event.kind==='keyboard'&&Array.isArray(event.usages)&&event.usages.some(usage=>pasteChord(usage,event.modifiers)));
}
export function assertClipboardPasteReady(snapshot,binding,input) {
  if(!snapshot||!containsPasteInput(input))return;
  if(snapshot.status==='copied'&&snapshot.sessionId===binding.sessionId&&snapshot.targetId===binding.targetId)return;
  throw Object.assign(new Error('CLIPBOARD_COPY_REQUIRED'),{code:'CLIPBOARD_COPY_REQUIRED',retryable:false,sent:false});
}
export function runtimeClipboard(snapshot,{sessionId,targetId}={}) {
  if(!snapshot||snapshot.sessionId!==sessionId||snapshot.targetId!==targetId)return undefined;
  const keys=['requestId','sessionId','targetId','status','characters','requestedAt','copiedAt','errorCode'];
  return {...Object.fromEntries(keys.filter(key=>snapshot[key]!==undefined).map(key=>[key,snapshot[key]])),requiresTargetRefocus:true,systemClipboardUnchanged:false};
}
