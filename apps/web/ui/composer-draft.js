// A tab-local composer is not a conversation and contains no credentials.
const KEY='iah-composer-draft';
function clean(value){
 if(!value||typeof value!=='object'||typeof value.text!=='string'||value.text.length>100000)return null;
 const modelId=typeof value.modelId==='string'?value.modelId.slice(0,400):'';
 const reasoningEfforts=Object.fromEntries(Object.entries(value.reasoningEfforts||{}).filter(([key,effort])=>key.length<=400&&typeof effort==='string'&&effort.length<=32).slice(0,32));
 return {text:value.text,modelId,reasoningEfforts};
}
export function loadComposerDraft(){try{return clean(JSON.parse(globalThis.sessionStorage?.getItem(KEY)||'null'));}catch{return null;}}
export function saveComposerDraft(value){const draft=clean(value);if(!draft)return;try{globalThis.sessionStorage?.setItem(KEY,JSON.stringify(draft));}catch{}}
export function clearComposerDraft(){try{globalThis.sessionStorage?.removeItem(KEY);}catch{}}
