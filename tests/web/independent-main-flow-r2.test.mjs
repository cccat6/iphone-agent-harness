import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from '../../apps/web/core/store.js';
import {prepareContext} from '../../apps/web/core/context.js';
import {createHarness} from '../../apps/web/core/harness.js';

test('image-only updates after a text checkpoint retain its memory, verbatim goal, every tail row and tool pairing',async()=>{
  const store=await openStore({memory:true}),session=await store.createSession({});
  const goal=await store.addMessage(session.id,{role:'user',text:'Original exact goal: preserve receipts.'});
  for(let i=0;i<18;i++)await store.addMessage(session.id,{role:i%2?'assistant':'user',text:`older-${i} `+'detail '.repeat(600)});
  const first=await prepareContext({store,sessionId:session.id,settings:{triggerTokens:6000},invoke:async()=>({text:'Validated old history summary.',toolCalls:[]})});
  assert.equal(first.checkpoint.kind,'model-summary');
  const before=structuredClone(first.checkpoint);
  for(let i=0;i<11;i++){
    await store.addMessage(session.id,{role:'assistant',text:`inspect-${i}`,toolCalls:[{id:`observe-${i}`,name:'phone_observe',arguments:{count:1}}]});
    await store.addMessage(session.id,{role:'tool',text:`receipt-${i}`,toolCallId:`observe-${i}`,frameRefs:[`local-asset:fake-${i}`]});
  }
  let summaries=0;
  const options={store,sessionId:session.id,settings:{triggerTokens:750000},invoke:async()=>{summaries++;throw new Error('Image selection must not request summary');}};
  const second=await prepareContext(options);
  assert.equal(second.metrics.compactionReason,'images');assert.equal(summaries,0);
  assert.equal(second.checkpoint.text,before.text);assert.equal(second.checkpoint.throughSeq,before.throughSeq);
  const tail=await store.getMessages(session.id,{afterSeq:before.throughSeq,includeImages:false});
  const sentTail=second.messages.filter(m=>m.seq>before.throughSeq);
  assert.deepEqual(sentTail.map(m=>[m.id,m.text]),tail.map(m=>[m.id,m.text]));
  for(let i=0;i<11;i++){const at=second.messages.findIndex(m=>m.toolCalls?.[0]?.id===`observe-${i}`);assert.equal(second.messages[at+1].toolCallId,`observe-${i}`);}
  assert.equal(second.messages.flatMap(m=>m.frameRefs||[]).length,8);
  const repeat=await prepareContext(options);assert.deepEqual(repeat.messages,second.messages);assert.equal(repeat.compacted,false);
  assert.equal((await store.getMessages(session.id,{includeImages:false}))[0].id,goal.id);
});

test('overflow after streamed output never retries, summarizes, or executes returned tools',async()=>{
  const store=await openStore({memory:true}),session=await store.createSession({mode:'chat'});
  await store.saveSettings({providers:[{id:'p',protocol:'openai',baseUrl:'https://model.example/v1',model:'m'}],activeProviderId:'p'});
  let calls=0,summaries=0;
  const harness=createHarness({store,invoke:async args=>{
    calls++;if(!args.tools.length)summaries++;
    args.onDelta('Partial response already visible');
    throw Object.assign(new Error('CONTEXT_WINDOW_EXCEEDED'),{code:'CONTEXT_WINDOW_EXCEEDED'});
  }});
  await assert.rejects(harness.run({sessionId:session.id,text:'Continue safely.'}),/CONTEXT_WINDOW_EXCEEDED/);
  assert.equal(calls,1);assert.equal(summaries,0);
  assert.equal((await store.getEvents(session.id)).filter(e=>e.type==='tool.started').length,0);
});
