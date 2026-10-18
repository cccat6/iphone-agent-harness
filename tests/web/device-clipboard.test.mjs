import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeviceClipboard,shortcutLaunchURL} from '../../apps/web/core/device-clipboard.js';
import {createClipboardController} from '../../apps/web/core/clipboard.js';
import {SHORTCUT_COPY} from '../../apps/web/ui/clipboard-shortcut-copy.js';
import {mountClipboardPanel} from '../../apps/web/ui/clipboard.js';
const request={requestId:'request-a',sessionId:'session-a',targetId:'phone-a',text:'你好\nhello'};
function fixture({rows=['pending','streaming','delivered','copied'],isCurrent=()=>true,sleep=async()=>{}}={}){
 const calls=[],base={requestId:request.requestId,sessionId:request.sessionId,targetId:request.targetId,clientId:'client-a',boardId:'board-a',bootId:'boot-a',totalBytes:new TextEncoder().encode(request.text).length,nextOffset:0,chunkBytes:1024,chunkPending:false};
 const device={baseUrl:new URL('http://igent.local'),identityVerified:true,bindingVerified:true,targetId:'phone-a',clientId:'client-a',boardId:'board-a',bootId:'boot-a',async stageClipboard(body){calls.push({stage:body});base.totalBytes=body.totalBytes;return {...base,status:'pending',jobToken:'a'.repeat(64),expiresAtDeviceMs:120100};},async getClipboardStatus(){const row=rows.shift();calls.push({poll:row});return typeof row==='string'?{...base,status:row,copiedAtDeviceMs:200}:row;},async addClipboardChunk(body){calls.push({chunk:body});base.nextOffset=body.offset+Buffer.from(body.textBase64,'base64').length;return {...base,status:'streaming'};},async cancelClipboard(){calls.push({cancel:true});}};
 const adapter=createDeviceClipboard({getDevice:()=>device,isCurrent,sleep,now:()=>100});return {adapter,device,calls,base};
}
test('shortcut carries only short-lived job URLs, never text or global credentials',()=>{
 const url=shortcutLaunchURL({...request,baseUrl:'http://igent.local',jobToken:'a'.repeat(64)});const input=JSON.parse(new URL(url).searchParams.get('text'));
 assert.equal(input.requestId,request.requestId);assert.ok(input.jobURL.endsWith('?token='+'a'.repeat(64)));assert.ok(input.ackURL.includes('/ack?token='));assert.equal(input.text,undefined);assert.equal(url.includes(encodeURIComponent(request.text)),false);
 assert.throws(()=>shortcutLaunchURL({...request,baseUrl:'http://public.example',jobToken:'a'.repeat(64)}));
});
test('delivered is not copied: polls until exact matched ack, without touching browser clipboard',async()=>{
 const f=fixture();await f.adapter.prepare(request);assert.equal(f.adapter.getSnapshot().status,'ready');assert.equal(JSON.stringify(f.adapter.getSnapshot()).includes('aaaa'),false);
 const {url,completion}=f.adapter.start();assert.ok(url.startsWith('shortcuts://'));const receipt=await completion;
 assert.equal(receipt.status,'copied');assert.equal(receipt.source,'shortcut');assert.equal(receipt.requiresTargetRefocus,true);assert.deepEqual(f.calls.filter(x=>x.poll).map(x=>x.poll),['pending','streaming','delivered','copied']);f.adapter.cancel();
});
test('wrong target, stale job or expired ack never produces copied receipt',async()=>{
 for(const kind of ['target','request','expired']){
  const f=fixture();f.device.getClipboardStatus=async()=>({...f.base,status:kind==='expired'?'expired':'copied',copiedAtDeviceMs:1,...(kind==='target'?{targetId:'other'}:kind==='request'?{requestId:'other'}:{})});
  await f.adapter.prepare(request);await assert.rejects(f.adapter.start().completion);assert.equal(f.adapter.getSnapshot().status,'failed');f.adapter.cancel();
 }
});
test('large text has no old bridge cap and view remount does not overwrite a staged job',async()=>{
 const f=fixture();await assert.rejects(f.adapter.prepare({...request,text:''}),{code:'CLIPBOARD_TEXT_INVALID'});assert.equal(f.calls.length,0);
 const large={...request,text:'你'.repeat(40000)};await f.adapter.prepare(large);await f.adapter.prepare(large);assert.equal(f.calls.filter(x=>x.stage).length,1);assert.equal(f.calls.find(x=>x.stage).stage.totalBytes,120000);assert.equal(f.calls.find(x=>x.stage).stage.text,undefined);f.adapter.cancel();
});
test('retry gets a fresh board job ID so delayed old cancel cannot cancel its replacement',async()=>{
 const f=fixture(),ids=[],cancelled=[];f.device.stageClipboard=async body=>{ids.push(body.requestId);return {...f.base,requestId:body.requestId,status:'pending',jobToken:'a'.repeat(64),expiresAtDeviceMs:120100};};f.device.cancelClipboard=async body=>{cancelled.push(body.requestId);};
 await f.adapter.prepare(request);await f.adapter.prepare(request,{retry:true});assert.equal(ids[0],request.requestId);assert.notEqual(ids[1],ids[0]);assert.deepEqual(cancelled,[ids[0]]);assert.equal(f.adapter.getSnapshot().requestId,request.requestId);f.adapter.cancel();
});
test('a ready job that expires becomes retryable rather than keeping a stale launch URL',async()=>{
 let time=100;const f=fixture(),adapter=createDeviceClipboard({getDevice:()=>f.device,now:()=>time,ttlMs:1000});await adapter.prepare(request);time=1100;assert.throws(()=>adapter.start(),{code:'CLIPBOARD_JOB_EXPIRED'});assert.equal(adapter.getSnapshot().status,'failed');adapter.cancel();
});
test('session change during pending poll rejects its late acknowledgment',async()=>{
 let resolve,current=true;const f=fixture({isCurrent:()=>current});f.device.getClipboardStatus=()=>new Promise(r=>resolve=r);await f.adapter.prepare(request);const result=f.adapter.start().completion;current=false;resolve({...f.base,status:'copied',copiedAtDeviceMs:1});await assert.rejects(result,{code:'CLIPBOARD_TARGET_CHANGED'});f.adapter.cancel();
});
test('external receipt completes only the exact pending session and target',()=>{
 const c=createClipboardController({id:()=>request.requestId,isCurrent:()=>true});c.prepare(request);
 assert.throws(()=>c.completeExternal({...request,source:'shortcut',status:'copied',copiedAt:1,targetId:'other'}));
 const receipt=c.completeExternal({...request,source:'shortcut',status:'copied',copiedAt:1});assert.equal(receipt.source,'shortcut');assert.equal(c.getPendingText(),'');assert.equal(c.getSnapshot().status,'copied');
 assert.throws(()=>c.completeExternal(receipt));
});
test('shortcut affordance has matching keys in eight locales',()=>{assert.equal(Object.keys(SHORTCUT_COPY).length,8);for(const messages of Object.values(SHORTCUT_COPY))assert.deepEqual(Object.keys(messages).sort(),Object.keys(SHORTCUT_COPY.en).sort());});
test('visible shortcut action launches only prepared data, then reuses the copied continuation',async()=>{
 const document={createElement:tag=>new Element(tag)};class Element{constructor(tag){this.tagName=tag;this.ownerDocument=document;this.dataset={};this.style={};this.children=[];this.listeners={};this.attributes={};this.classList={add(){}};}setAttribute(k,v){this.attributes[k]=v;}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}addEventListener(k,v){this.listeners[k]=v;}}
 const f=fixture({sleep:()=>new Promise(r=>setImmediate(r))}),root=new Element('section'),controller=createClipboardController({id:()=>request.requestId,isCurrent:()=>true});let copied=0,navigated='',resolveCopied;const copiedDone=new Promise(r=>resolveCopied=r),poll=f.device.getClipboardStatus;f.device.getClipboardStatus=async()=>navigated?poll():({...f.base,status:'pending'});
 const view=mountClipboardPanel(root,{controller,deviceClipboard:f.adapter,sessionId:request.sessionId,continueAfterCopy:true,navigate:url=>navigated=url,onCopied:receipt=>{assert.equal(receipt.source,'shortcut');copied++;resolveCopied();}});
 controller.prepare(request);await new Promise(r=>setImmediate(r));const button=root.children.at(-1).children[0];assert.equal(button.disabled,false);assert.equal(copied,0);button.listeners.click();
 assert.ok(navigated.startsWith('shortcuts://run-shortcut?'));await copiedDone;assert.equal(controller.getSnapshot().status,'copied');assert.equal(copied,1);view.destroy();f.adapter.cancel();
});

test('armed producer serves an externally started Shortcut without clicking the launch button',async()=>{
 const f=fixture({rows:['streaming','delivered','copied']});await f.adapter.prepare(request);const receipt=await f.adapter.arm();assert.equal(receipt.status,'copied');assert.equal(f.calls.filter(x=>x.chunk).length,1);f.adapter.cancel();
});
test('arming and clicking launch reuse one producer and completion',async()=>{
 const f=fixture();await f.adapter.prepare(request);const armed=f.adapter.arm(),launched=f.adapter.start();assert.equal(armed,launched.completion);await armed;assert.equal(f.calls.filter(x=>x.chunk).length,1);f.adapter.cancel();
});
