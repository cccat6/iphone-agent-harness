import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createHistoryWindow} from '../../apps/web/core/history-window.js';
import {createClipboardController} from '../../apps/web/core/clipboard.js';
import {mountClipboardPanel} from '../../apps/web/ui/clipboard.js';
const app=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');

function continuationFixture(mode='chat'){
 const receipt={requestId:'copy-1',sessionId:'session-a',targetId:'phone-a',status:'copied'};
 const runs=[],nodes=new Map(),draft='Unsent user draft';let options;
 const $=selector=>{if(!nodes.has(selector))nodes.set(selector,{value:selector==='#message-input'?draft:selector==='#mode-select'?mode:'model-a',textContent:'',hidden:false});return nodes.get(selector);};
 const state={settings:{},current:{id:'session-a',mode},drafts:new Map([['session-a',draft]]),runGeneration:0,devicePanel:{ensureReady:async()=>true},store:{addEvent:async()=>{},updateSession:async()=>{},getMessages:async()=>[],getSession:async()=>({id:'session-a',title:'Session',mode})},harness:{run:async x=>runs.push(x)}};
 const sandbox={conversationFollow:()=>({follow(){}}),capture:{active:true},createHistoryWindow,state,$,clipboard:{getSnapshot:()=>receipt},deviceClipboard:null,deviceStatus:()=>({targetId:'phone-a',inputVerified:true}),mountClipboardPanel:(_root,opts)=>(options=opts,{destroy(){}}),getBrowserCompatibility:()=>({supportedForHarness:true}),selectedProvider:()=>({id:'model-a'}),setRunning:value=>{state.running=value;},AbortController,t:x=>x,resizeInput(){},updateModeDescription(){},refreshSessions:async()=>{},renderMessages(){},renderRunControls(){},renderReasoningOptions(){},report:error=>{throw error;}};
 vm.runInNewContext(app.slice(app.indexOf('function historyWindow()'),app.indexOf('async function openSession(')),sandbox);
 vm.runInNewContext(app.slice(app.indexOf('function selectionParts('),app.indexOf('function profileModels(')),sandbox);
 vm.runInNewContext(app.slice(app.indexOf('async function sendMessage('),app.indexOf('function resizeInput()')),sandbox);
 sandbox.renderClipboard();return {copy:()=>options.onCopied(receipt),runs,state,$,draft};
}

test('copy-and-continue uses the unified assistant and preserves the user draft',async()=>{
 for(const mode of ['chat','plan']){const f=continuationFixture(mode);await f.copy();assert.equal(f.runs.length,1);assert.equal(f.runs[0].mode,'auto');assert.equal(f.$('#message-input').value,f.draft);assert.equal(f.state.drafts.get('session-a'),f.draft);}
});

function viewRoot(){
 const doc={createElement:tag=>new Element(tag)};
 class Element{constructor(tag){this.tagName=tag;this.ownerDocument=doc;this.dataset={};this.style={};this.children=[];this.listeners={};this.classList={add(){}};}setAttribute(){}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=[...nodes];}addEventListener(type,handler){this.listeners[type]=handler;}}
 return new Element('section');
}
test('successful copy followed by failed continuation keeps an actionable retry without rewriting clipboard',async()=>{
 let writes=0,attempts=0;
 const controller=createClipboardController({navigator:{clipboard:{writeText:async()=>{writes++;}},userActivation:{isActive:true}},document:{visibilityState:'visible',hasFocus:()=>true},isSecureContext:()=>true});
 const root=viewRoot(),view=mountClipboardPanel(root,{controller,sessionId:'session-a',continueAfterCopy:true,onCopied:async()=>{if(++attempts===1)throw new Error('transient storage failure');}});
 controller.prepare({sessionId:'session-a',targetId:'phone-a',text:'Hello'});
 const actions=root.children[4];actions.children[0].listeners.click();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(controller.getSnapshot().status,'copied');assert.equal(writes,1);assert.equal(actions.hidden,false,'UI must expose a way to retry saving/continuing');
 const retry=actions.children.find(button=>!button.hidden);assert.ok(retry);retry.listeners.click();await new Promise(resolve=>setImmediate(resolve));assert.equal(attempts,2);assert.equal(writes,1,'Retry must not write the system clipboard again');view.destroy();
});

test('failed copied continuation remains retryable after reopening the same conversation',async()=>{
 let writes=0,attempts=0;
 const controller=createClipboardController({navigator:{clipboard:{writeText:async()=>{writes++;}},userActivation:{isActive:true}},document:{visibilityState:'visible',hasFocus:()=>true},isSecureContext:()=>true});
 const root=viewRoot(),options={controller,sessionId:'session-a',continueAfterCopy:true,onCopied:async()=>{if(++attempts===1)throw new Error('transient storage failure');}};
 let view=mountClipboardPanel(root,options);controller.prepare({sessionId:'session-a',targetId:'phone-a',text:'Hello'});root.children[4].children[0].listeners.click();await new Promise(resolve=>setImmediate(resolve));view.destroy();view=mountClipboardPanel(root,options);
 const actions=root.children[4];assert.equal(actions.hidden,false,'Reopening same session must preserve retry of the copied receipt');const retry=actions.children.find(button=>!button.hidden);assert.ok(retry);retry.listeners.click();await new Promise(resolve=>setImmediate(resolve));assert.equal(attempts,2);assert.equal(writes,1);view.destroy();
});

test('a copy callback that fails while its conversation view is remounted remains recoverable',async()=>{
 let writes=0,attempts=0,rejectSave;
 const controller=createClipboardController({navigator:{clipboard:{writeText:async()=>{writes++;}},userActivation:{isActive:true}},document:{visibilityState:'visible',hasFocus:()=>true},isSecureContext:()=>true});
 const root=viewRoot(),options={controller,sessionId:'session-a',continueAfterCopy:true,onCopied:()=>{if(++attempts===1)return new Promise((_,reject)=>{rejectSave=reject;});}};
 let view=mountClipboardPanel(root,options);controller.prepare({sessionId:'session-a',targetId:'phone-a',text:'Hello'});root.children[4].children[0].listeners.click();await new Promise(resolve=>setImmediate(resolve));view.destroy();view=mountClipboardPanel(root,options);rejectSave(new Error('transient save error'));await new Promise(resolve=>setImmediate(resolve));
 const actions=root.children[4];assert.equal(actions.hidden,false);const retry=actions.children.find(button=>!button.hidden);assert.ok(retry);retry.listeners.click();await new Promise(resolve=>setImmediate(resolve));assert.equal(attempts,2);assert.equal(writes,1);view.destroy();
});

test('a successful clipboard write can continue after its same-session panel was remounted',async()=>{
 let writes=0,attempts=0,finishWrite;
 const controller=createClipboardController({navigator:{clipboard:{writeText:()=>{writes++;return new Promise(resolve=>{finishWrite=resolve;});}},userActivation:{isActive:true}},document:{visibilityState:'visible',hasFocus:()=>true},isSecureContext:()=>true});
 const root=viewRoot(),options={controller,sessionId:'session-a',continueAfterCopy:true,onCopied:async()=>{attempts++;}};
 let view=mountClipboardPanel(root,options);controller.prepare({sessionId:'session-a',targetId:'phone-a',text:'Hello'});root.children[4].children[0].listeners.click();view.destroy();view=mountClipboardPanel(root,options);finishWrite();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(controller.getSnapshot().status,'copied');assert.equal(writes,1);assert.equal(attempts,1,'Successful copy must not silently lose its continuation on a same-session remount');view.destroy();
});
