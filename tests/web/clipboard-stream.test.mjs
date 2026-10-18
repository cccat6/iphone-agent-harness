import test from 'node:test';import assert from 'node:assert/strict';
import {createDeviceClipboard,clipboardUTF8Chunk} from '../../apps/web/core/device-clipboard.js';
const request={requestId:'request',sessionId:'session',targetId:'phone',text:'🙂中文\0\x01'.repeat(600)};
function setup({sleep=async()=>{},now=()=>100,ttlMs=120000}={}){
 let meta={requestId:request.requestId,sessionId:request.sessionId,targetId:request.targetId,clientId:'client',boardId:'board',bootId:'boot',totalBytes:0,nextOffset:0,chunkBytes:1024,chunkPending:false,status:'pending'},cancelled=0;
 const chunks=[],device={baseUrl:new URL('http://igent.local'),identityVerified:true,bindingVerified:true,targetId:'phone',clientId:'client',boardId:'board',bootId:'boot',async stageClipboard(body){meta={...meta,requestId:body.requestId,totalBytes:body.totalBytes,nextOffset:0,chunkPending:false,status:'pending'};return {...meta,jobToken:'a'.repeat(64),expiresAtDeviceMs:now()+ttlMs};},async getClipboardStatus(){return {...meta};},async addClipboardChunk(body){chunks.push(body);meta.chunkPending=true;return {...meta};},async cancelClipboard(){cancelled++;}};
 const adapter=createDeviceClipboard({getDevice:()=>device,sleep,now,ttlMs});return {adapter,device,chunks,meta:()=>meta,cancelled:()=>cancelled};
}
test('UTF-8 chunking never splits emoji, Chinese or controls and reconstructs full byte sequence',()=>{
 const bytes=new TextEncoder().encode(request.text);let offset=0;const parts=[];while(offset<bytes.length){const chunk=clipboardUTF8Chunk(bytes,offset),part=Buffer.from(chunk.textBase64,'base64');assert.ok(part.length<=1024);new TextDecoder('utf-8',{fatal:true}).decode(part);parts.push(part);offset=chunk.end;}assert.deepEqual(Buffer.concat(parts),Buffer.from(bytes));assert.throws(()=>clipboardUTF8Chunk(bytes,1));
});
test('an occupied chunk slot is polled without resending; consumption alone advances upload',async()=>{
 const f=setup();await f.adapter.prepare(request);let polls=0,pendingPolls=0;
 f.device.getClipboardStatus=async()=>{polls++;const m=f.meta();if(m.status==='pending')m.status='streaming';else if(m.chunkPending){pendingPolls++;if(pendingPolls%3===0){const last=f.chunks.at(-1);m.nextOffset=last.offset+Buffer.from(last.textBase64,'base64').length;m.chunkPending=false;if(m.nextOffset===m.totalBytes)m.status='delivered';}}else if(m.status==='delivered'){m.status='copied';m.copiedAtDeviceMs=200;}return {...m};};
 const receipt=await f.adapter.start().completion;assert.equal(receipt.status,'copied');assert.equal(new Set(f.chunks.map(x=>x.offset)).size,f.chunks.length);assert.ok(polls>f.chunks.length*3);assert.equal(f.adapter.getSnapshot().transferredBytes,f.meta().totalBytes);
});
for(const reason of ['cancel','boot','target'])test('in-flight chunk stops on '+reason+' without sending another chunk or accepting a late result',async()=>{
 const f=setup();await f.adapter.prepare(request);f.meta().status='streaming';let resolve,started;const began=new Promise(r=>started=r);f.device.addClipboardChunk=body=>{f.chunks.push(body);started();return new Promise(r=>resolve=r);};const completion=f.adapter.start().completion;await began;
 if(reason==='cancel')f.adapter.cancel();else if(reason==='boot')f.device.bootId='new-boot';else f.device.targetId='other-phone';resolve({...f.meta(),chunkPending:true});await assert.rejects(completion,{code:'CLIPBOARD_TARGET_CHANGED'});assert.equal(f.chunks.length,1);assert.ok(f.cancelled()>0);
});
test('future offset and server chunk conflict abort rather than retrying a possibly different chunk',async()=>{
 for(const kind of ['offset','conflict']){const f=setup();await f.adapter.prepare(request);f.meta().status='streaming';if(kind==='offset')f.meta().nextOffset=10;else f.device.addClipboardChunk=async body=>{f.chunks.push(body);throw Object.assign(Error('conflict'),{code:'DEVICE_CONFLICT'});};await assert.rejects(f.adapter.start().completion);assert.equal(f.chunks.length,kind==='offset'?0:1);assert.equal(f.adapter.getSnapshot().status,'failed');}
});
test('active progress refreshes idle lifetime, but status polling without progress expires',async()=>{
 let time=0;const f=setup({now:()=>time,ttlMs:1000});await f.adapter.prepare({...request,text:'x'.repeat(5000)});f.meta().status='streaming';f.device.addClipboardChunk=async body=>{time+=600;f.chunks.push(body);f.meta().nextOffset=body.offset+Buffer.from(body.textBase64,'base64').length;return {...f.meta()};};f.device.getClipboardStatus=async()=>{if(f.meta().nextOffset===f.meta().totalBytes){f.meta().status='copied';f.meta().copiedAtDeviceMs=time;}return {...f.meta()};};assert.equal((await f.adapter.start().completion).status,'copied');assert.ok(time>1000);
 time=0;const idle=setup({now:()=>time,ttlMs:1000,sleep:async()=>{time+=600;}});await idle.adapter.prepare(request);await assert.rejects(idle.adapter.start().completion,{code:'CLIPBOARD_JOB_EXPIRED'});assert.equal(idle.chunks.length,0);
});
