import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeMessage} from '../../apps/web/core/prompt.js';
import {createHarness} from '../../apps/web/core/harness.js';
import {openStore} from '../../apps/web/core/store.js';
const parse=message=>JSON.parse(message.text.split('\n').slice(1).join('\n'));
test('model context retains planning constraints while device radio secrets and volatile heap counters stay local',()=>{
 const capabilities={operations:['tap','swipe'],reportIntervalMs:40,limits:{maxEvents:128,maxHoldMs:3000},maxRequestBytes:8192,freeHeapBytes:10000,minFreeHeapBytes:4000,rtc:{icePassword:'private-radio-secret'},publicKeyFingerprint:'not-needed-for-planning'};
 const message=runtimeMessage({capabilities}),projected=parse(message).device.capabilities;
 assert.deepEqual(projected,{operations:['tap','swipe'],maxEvents:128,maxHoldMs:3000,maxRequestBytes:8192,reportIntervalMs:40});assert.ok(!message.text.includes('private-radio-secret'));assert.ok(!message.text.includes('Heap'));assert.equal(capabilities.rtc.icePassword,'private-radio-secret');
});
test('volatile radio diagnostics alone do not append a new runtime message every model turn',async()=>{
 const store=await openStore({memory:true});await store.saveSettings({providers:[{id:'p',protocol:'openai',model:'fixture',baseUrl:'https://fixture.invalid'}],activeProviderId:'p'});const session=await store.createSession({mode:'auto'});let heap=10000,turn=0;const requests=[];
 await createHarness({store,getContext:()=>({targetId:'phone',inputState:'released',capabilities:{operations:['tap'],reportIntervalMs:40,freeHeapBytes:heap++,rtc:{icePassword:'private-radio-secret'}}}),invoke:async request=>{requests.push(structuredClone(request.messages));return ++turn===1?{text:'',toolCalls:[{id:'catalog',name:'skills_list',arguments:{}}]}:{text:'done',toolCalls:[]};}}).run({sessionId:session.id,text:'Inspect the installed skill catalog.'});
 assert.equal(turn,2);for(const request of requests)assert.equal(request.filter(m=>m.runtimeContext).length,1);assert.ok(requests.every(request=>!JSON.stringify(request).includes('private-radio-secret')));store.close();
});
