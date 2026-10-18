import test from 'node:test';
import assert from 'node:assert/strict';
import {createClipboardController} from '../../apps/web/core/clipboard.js';
import {CLIPBOARD_MESSAGES} from '../../apps/web/ui/clipboard.js';
function fixture(overrides={}){
 const writes=[],nav={clipboard:{writeText:text=>{writes.push(text);return Promise.resolve();}},userActivation:{isActive:true}},doc={visibilityState:'visible',hasFocus:()=>true};
 const controller=createClipboardController({navigator:nav,document:doc,isSecureContext:()=>true,id:()=> 'copy-1',now:()=>123,...overrides});
 return {controller,writes,nav,doc};
}
const payload={text:'长文本 🌏\nLine two',sessionId:'session-a',targetId:'phone-a'};
test('prepare queues Unicode without touching clipboard or exposing text in metadata',async()=>{
 const {controller,writes}=fixture();const state=controller.prepare(payload);
 assert.equal(state.status,'awaiting_user_action');assert.equal(state.requestId,'copy-1');assert.equal(state.targetId,'phone-a');assert.deepEqual(writes,[]);assert.equal('text'in state,false);assert.equal(JSON.stringify(state).includes(payload.text),false);
 controller.cancel();await Promise.resolve();
});
test('copy calls writeText synchronously inside gesture and returns only a copy receipt',async()=>{
 const {controller,writes}=fixture();controller.prepare(payload);const copying=controller.copyPending();assert.deepEqual(writes,[payload.text]);
 const receipt=await copying;assert.equal(receipt.status,'copied');assert.equal(receipt.requiresTargetRefocus,true);assert.equal(receipt.systemClipboardUnchanged,false);assert.equal(receipt.targetId,'phone-a');assert.equal('text'in receipt,false);assert.equal(controller.getPendingText(),'');
});
test('hidden or unfocused documents never call system clipboard',async()=>{
 for(const state of ['hidden','unfocused']){const {controller,writes,doc}=fixture();controller.prepare(payload);if(state==='hidden')doc.visibilityState='hidden';else doc.hasFocus=()=>false;
 await assert.rejects(controller.copyPending(),{code:'CLIPBOARD_FOREGROUND_REQUIRED'});assert.deepEqual(writes,[]);assert.equal(controller.getSnapshot().status,'awaiting_user_action');controller.cancel();}
});
test('missing gesture or API never attempts a fallback copy',async()=>{
 const {controller,writes,nav}=fixture();controller.prepare(payload);nav.userActivation.isActive=false;await assert.rejects(controller.copyPending(),{code:'CLIPBOARD_USER_GESTURE_REQUIRED'});nav.userActivation.isActive=true;nav.clipboard=null;await assert.rejects(controller.copyPending(),{code:'CLIPBOARD_UNAVAILABLE'});assert.deepEqual(writes,[]);controller.cancel();
});
test('browser rejection retains text for explicit retry without emitting copied',async()=>{
 const {controller,nav}=fixture();controller.prepare(payload);nav.clipboard.writeText=()=>Promise.reject(new DOMException('private content must not escape','NotAllowedError'));
 await assert.rejects(controller.copyPending(),{code:'CLIPBOARD_PERMISSION_DENIED',message:'CLIPBOARD_PERMISSION_DENIED'});assert.equal(controller.getSnapshot().status,'awaiting_user_action');assert.equal(controller.getPendingText(),payload.text);nav.clipboard.writeText=()=>Promise.resolve();assert.equal((await controller.copyPending()).status,'copied');
});
test('cancelling an in-flight write prevents late copied receipt and blocks overlapping writes',async()=>{
 let finish;const {controller}=fixture({navigator:{clipboard:{writeText:()=>new Promise(resolve=>finish=resolve)}}});controller.prepare(payload);const copying=controller.copyPending();controller.cancel();assert.throws(()=>controller.prepare(payload),{code:'CLIPBOARD_BUSY'});finish();await assert.rejects(copying,{code:'CLIPBOARD_CANCELLED'});assert.equal(controller.getSnapshot().status,'cancelled');assert.equal(controller.getPendingText(),'');controller.prepare(payload);controller.clear();assert.equal(controller.getSnapshot(),null);
});
test('session or target changes reject both before write and during completion',async()=>{
 let current=false;const first=fixture({isCurrent:()=>current});first.controller.prepare(payload);await assert.rejects(first.controller.copyPending(),{code:'CLIPBOARD_TARGET_CHANGED'});assert.deepEqual(first.writes,[]);
 current=true;let finish;const second=fixture({isCurrent:()=>current,navigator:{clipboard:{writeText:()=>new Promise(resolve=>finish=resolve)}}});second.controller.prepare(payload);const copying=second.controller.copyPending();current=false;finish();await assert.rejects(copying,{code:'CLIPBOARD_TARGET_CHANGED'});assert.equal(second.controller.getSnapshot().status,'cancelled');
});
test('queue validates nonempty text and required session and target identities',()=>{
 const {controller}=fixture();for(const text of ['',null])assert.throws(()=>controller.prepare({...payload,text}),{code:'CLIPBOARD_TEXT_INVALID'});assert.throws(()=>controller.prepare({...payload,sessionId:''}),{code:'CLIPBOARD_SESSION_REQUIRED'});assert.throws(()=>controller.prepare({...payload,targetId:''}),{code:'CLIPBOARD_TARGET_REQUIRED'});controller.prepare(payload);assert.throws(()=>controller.prepare(payload),{code:'CLIPBOARD_BUSY'});controller.cancel();
});
test('eight clipboard locales expose the same UI messages',()=>{
 assert.deepEqual(Object.keys(CLIPBOARD_MESSAGES).sort(),['en','zh-Hans','zh-Hant','ja','ru','de','fr','es'].sort());for(const messages of Object.values(CLIPBOARD_MESSAGES))assert.deepEqual(Object.keys(messages).sort(),Object.keys(CLIPBOARD_MESSAGES.en).sort());
});

function viewRoot(){
 const document={createElement:tag=>new Element(tag)};
 class Element{
  constructor(tag){this.tagName=tag;this.ownerDocument=document;this.dataset={};this.style={};this.children=[];this.listeners={};this.attributes={};this.classList={add:()=>{}};}
  setAttribute(key,value){this.attributes[key]=value;}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
  addEventListener(type,handler){this.listeners[type]=handler;}
 }
 return new Element('section');
}
test('clipboard UI uses copy-and-continue only when explicitly configured and preserves plain text',async()=>{
 const {mountClipboardPanel}=await import('../../apps/web/ui/clipboard.js');
 const {controller,writes}=fixture(),root=viewRoot();let continued=0;
 const view=mountClipboardPanel(root,{controller,sessionId:'session-a',continueAfterCopy:true,onCopied:()=>continued++});
 controller.prepare({...payload,text:'<img src=x onerror=alert(1)>'});
 const [,,preview,,actions]=root.children,copy=actions.children[0];assert.equal(root.dataset.noI18n,'');assert.equal(actions.className,'panel-actions');assert.equal(copy.className,'primary');assert.equal(copy.textContent,CLIPBOARD_MESSAGES.en.copyContinue);assert.equal(preview.value,'<img src=x onerror=alert(1)>');assert.equal(continued,0);
 copy.listeners.click();assert.equal(writes.length,1);await new Promise(resolve=>setImmediate(resolve));assert.equal(continued,1);assert.equal(controller.getSnapshot().status,'copied');view.destroy();
});
test('clipboard UI distinguishes successful copy from failed session callback',async()=>{
 const {mountClipboardPanel}=await import('../../apps/web/ui/clipboard.js');
 const {controller}=fixture(),root=viewRoot();const view=mountClipboardPanel(root,{controller,onCopied:()=>{throw new Error('storage unavailable');}});controller.prepare(payload);
 root.children[4].children[0].listeners.click();await new Promise(resolve=>setImmediate(resolve));assert.equal(controller.getSnapshot().status,'copied');assert.equal(root.children[3].textContent,CLIPBOARD_MESSAGES.en.recordFailed);view.destroy();
});
test('callback retry saves the same copied receipt without another clipboard write',async()=>{
 const {mountClipboardPanel}=await import('../../apps/web/ui/clipboard.js');
 for(const continuation of [false,true]){
  const {controller,writes}=fixture(),root=viewRoot();let calls=0,finish;
  const view=mountClipboardPanel(root,{controller,continueAfterCopy:continuation,onCopied:receipt=>{assert.equal(receipt.status,'copied');calls++;if(calls===1)throw new Error('storage');return new Promise(resolve=>finish=resolve);}});
  controller.prepare(payload);const [copy,,retry]=root.children[4].children;copy.listeners.click();await new Promise(resolve=>setImmediate(resolve));assert.equal(retry.hidden,false);assert.equal(copy.hidden,true);assert.equal(retry.textContent,continuation?CLIPBOARD_MESSAGES.en.retryContinue:CLIPBOARD_MESSAGES.en.retrySave);
  retry.listeners.click();assert.equal(retry.disabled,true);retry.listeners.click();assert.equal(calls,2);assert.equal(writes.length,1);finish();await new Promise(resolve=>setImmediate(resolve));assert.equal(retry.hidden,true);assert.equal(root.children[4].hidden,true);view.destroy();
 }
});
test('clear, replacement and owner changes invalidate failed continuation retries',async()=>{
 const {mountClipboardPanel}=await import('../../apps/web/ui/clipboard.js');
 for(const replacement of [null,{...payload},{...payload,sessionId:'other-session'},{...payload,targetId:'other-phone'}]){
  const {controller,writes}=fixture(),root=viewRoot();let calls=0;
  const view=mountClipboardPanel(root,{controller,sessionId:'session-a',onCopied:()=>{calls++;throw new Error('storage');}});controller.prepare(payload);const [copy,,retry]=root.children[4].children;copy.listeners.click();await new Promise(resolve=>setImmediate(resolve));assert.equal(retry.hidden,false);
  controller.clear();if(replacement)controller.prepare(replacement);assert.equal(retry.hidden,true);retry.listeners.click();assert.equal(calls,1);assert.equal(writes.length,1);controller.clear();view.destroy();
 }
});
test('late callback failure cannot revive a retry after the request was cleared',async()=>{
 const {mountClipboardPanel}=await import('../../apps/web/ui/clipboard.js');
 const {controller}=fixture(),root=viewRoot();let fail;
 const view=mountClipboardPanel(root,{controller,onCopied:()=>new Promise((_,reject)=>fail=reject)});controller.prepare(payload);root.children[4].children[0].listeners.click();await new Promise(resolve=>setImmediate(resolve));controller.clear();fail(new Error('storage'));await new Promise(resolve=>setImmediate(resolve));assert.equal(root.hidden,true);assert.equal(root.children[4].children[2].hidden,true);view.destroy();
});
test('an in-flight continuation failure reaches a remounted same-session panel',async()=>{
 const {mountClipboardPanel}=await import('../../apps/web/ui/clipboard.js');
 const {controller,writes}=fixture(),oldRoot=viewRoot(),newRoot=viewRoot();let fail,calls=0;
 const oldView=mountClipboardPanel(oldRoot,{controller,sessionId:'session-a',onCopied:()=>new Promise((_,reject)=>fail=reject)});controller.prepare(payload);oldRoot.children[4].children[0].listeners.click();await new Promise(resolve=>setImmediate(resolve));oldView.destroy();
 const newView=mountClipboardPanel(newRoot,{controller,sessionId:'session-a',onCopied:()=>calls++});fail(new Error('storage'));await new Promise(resolve=>setImmediate(resolve));const retry=newRoot.children[4].children[2];assert.equal(retry.hidden,false);retry.listeners.click();await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);assert.equal(writes.length,1);assert.equal(retry.hidden,true);newView.destroy();
});

test('foreground clipboard accepts more than 20000 characters without a special clipboard cap',async()=>{const {controller,writes}=fixture(),text='中文🙂\n'.repeat(25000);controller.prepare({...payload,text});await controller.copyPending();assert.equal(writes[0],text);});
