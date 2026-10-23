import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {callCodexModel,registerCodexAccount,clearCodexAccounts} from '../../apps/web/core/codex.js';
const nativeFetch=globalThis.fetch,nativeWS=globalThis.WebSocket,nativeDocument=globalThis.document;
afterEach(()=>{clearCodexAccounts();globalThis.fetch=nativeFetch;globalThis.WebSocket=nativeWS;if(nativeDocument===undefined)delete globalThis.document;else globalThis.document=nativeDocument;});
function fixture(){let next=0;const sent=[],sockets=[];globalThis.document={};globalThis.fetch=async()=>{throw new Error('HTTP must not be used');};
 globalThis.WebSocket=class extends EventTarget{constructor(){super();sockets.push(this);queueMicrotask(()=>this.dispatchEvent(new Event('open')));}emit(value){this.dispatchEvent(Object.assign(new Event('message'),{data:JSON.stringify(value)}));}close(){}send(raw){const value=JSON.parse(raw);if(value.type==='iah.authenticate'){this.emit({type:'iah.ready'});return;}sent.push(value);const id='resp_'+(++next);queueMicrotask(()=>{const item={id:'item_'+next,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'answer '+next}]};this.emit({type:'response.output_item.done',item,output_index:0});this.emit({type:'response.completed',response:{id,status:'completed',output:[]}});});}};
 registerCodexAccount('socket',{access_token:'synthetic',expires_in:3600,scope:'chatgpt.tokens.use.direct'},{flow:'chatgpt-plan',clientId:'fixture',identityVerified:true});
 return {sent,sockets,provider:{id:'socket',protocol:'codex',accountId:'socket',model:'fixture',promptCacheKey:'iah:socket',storeResponses:false}};
}
test('subscription continuation hydrates only new images and keeps a privacy-preserving live chain',async()=>{
 const f=fixture(),rows=[{role:'system',text:'stable'},{id:'u1',role:'user',text:'first',frameRefs:['local-asset:first']}],hydrated=[];
 const hydrate=async messages=>{for(const m of messages)if(m.frameRefs?.length){hydrated.push(...m.frameRefs);m.images=m.frameRefs.map(()=> 'data:image/jpeg;base64,AA==');}return messages;};
 const first=await callCodexModel({provider:f.provider,messages:rows,hydrate});rows.push({role:'assistant',text:first.text,providerState:first.providerState},{id:'u2',role:'user',text:'next',frameRefs:['local-asset:second']});
 const second=await callCodexModel({provider:f.provider,messages:rows,hydrate});
 assert.equal(first.text,'answer 1');assert.equal(second.text,'answer 2');assert.equal(f.sockets.length,1);assert.equal(f.sent[1].previous_response_id,'resp_1');assert.equal(f.sent[1].store,false);assert.equal(f.sent[1].input.length,1);assert.deepEqual(hydrated,['local-asset:first','local-asset:second']);assert.equal(second.timing.continued,true);assert.equal(second.timing.transport,'responses-websocket');
});
test('edits, instruction changes and compaction invalidate delta continuation instead of silently losing history',async()=>{
 const f=fixture(),rows=[{role:'system',text:'stable'},{id:'u1',role:'user',text:'first'}];const first=await callCodexModel({provider:f.provider,messages:rows});rows.push({role:'assistant',text:first.text,providerState:first.providerState},{role:'user',text:'next'});rows[0].text='updated';const second=await callCodexModel({provider:f.provider,messages:rows});assert.equal(f.sent[1].previous_response_id,undefined);assert.equal(f.sent[1].input.length,3);assert.equal(second.timing.continued,false);
});
test('compaction keeps tool reference mode stable and permits a caller-validated non-executed tool result',async()=>{
 const f=fixture(),definition={name:'lookup',description:'fixture',schema:{type:'object',properties:{}}};await callCodexModel({provider:f.provider,messages:[{role:'user',text:'summary'}],tools:[],toolDefinitions:[definition],purpose:'compaction'});assert.equal(f.sent[0].tool_choice,'auto');await callCodexModel({provider:f.provider,messages:[{role:'user',text:'retry summary'}],tools:[],toolDefinitions:[definition]});assert.equal(f.sent[1].tool_choice,'none');
});
