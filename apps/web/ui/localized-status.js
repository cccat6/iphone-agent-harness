// Preserve the source of a composed status instead of reverse-translating its
// rendered sentence. Weak references keep closed dialogs and credentials free
// to be collected; only connected, explicitly marked system nodes are refreshed.
const renderers=new WeakMap();
export function setLocalizedText(node,render){
 if(!node)return;
 if(typeof render!=='function')throw new TypeError('Localized status needs a renderer');
 renderers.set(node,render);node.dataset.liveI18n='';node.dataset.noI18n='';
 const value=String(render());if(node.textContent!==value)node.textContent=value;
}
export function refreshLocalizedText(root){
 const nodes=[...(root?.matches?.('[data-live-i18n]')?[root]:[]),...(root?.querySelectorAll?.('[data-live-i18n]')||[])];
 for(const node of nodes){const render=renderers.get(node);if(!render)continue;const value=String(render());if(node.textContent!==value)node.textContent=value;}
}
