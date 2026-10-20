import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {openStore} from '../../apps/web/core/store.js';
import {createHarness} from '../../apps/web/core/harness.js';

const provider={id:'p',protocol:'openai',baseUrl:'https://model.invalid/v1',model:'fixture'};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function fixture(t,memory){
 const name='first-message-race-'+crypto.randomUUID(),one=await openStore({memory,name}),two=memory?one:await openStore({name});
 t.after(()=>{one.close();if(two!==one)two.close();if(!memory)indexedDB.deleteDatabase(name);});
 await one.saveSettings({providers:[provider],activeProviderId:'p'});
 const saved=await one.createSessionWithMessage({mode:'chat'},'Set one morning alarm');
 return {one,two,...saved};
}

for(const memory of [true,false])for(const competingFirst of [false,true])test(`stale first-send validation cannot claim after another window finishes (${memory?'memory':'IndexedDB'}, ${competingFirst?'same first request':'new request'})`,async t=>{
 const {one,two,session,message}=await fixture(t,memory),entered=deferred(),gate=deferred(),getSettings=one.getSettings.bind(one);
 let held=false,aCalls=0,bCalls=0;
 one.getSettings=async()=>{if(!held){held=true;entered.resolve();await gate.promise;}return getSettings();};
 const a=createHarness({store:one,invoke:async()=>{aCalls++;return {text:'Stale response',toolCalls:[]};}});
 const b=createHarness({store:two,invoke:async()=>{bCalls++;return {text:'Other window response',toolCalls:[]};}});
 const pending=a.run({sessionId:session.id,text:message.text,firstMessageId:message.id}).then(value=>({value}),error=>({error}));
 await entered.promise;
 await b.run({sessionId:session.id,...(competingFirst?{text:message.text,firstMessageId:message.id}:{text:'Second request from another window'})});
 const before=await two.getMessages(session.id,{includeImages:false});
 gate.resolve();const outcome=await pending;
 assert.match(outcome.error?.message||'',/首条消息与新会话不匹配/);
 assert.equal(aCalls,0);assert.equal(bCalls,1);
 assert.deepEqual(await one.getMessages(session.id,{includeImages:false}),before);
 assert.equal(before.filter(row=>row.role==='user'&&!row.internal).length,competingFirst?1:2);
 assert.equal((await one.getSession(session.id)).activeRun,undefined);
});

for(const phase of ['preflight','claimed'])test(`cancelled first run retains exactly its committed user message (${phase})`,async t=>{
 const {one,session,message}=await fixture(t,false),controller=new AbortController();let calls=0;
 if(phase==='preflight'){
  const getSettings=one.getSettings.bind(one);one.getSettings=async()=>{controller.abort();return getSettings();};
 }else{
  const claim=one.claimRun.bind(one);one.claimRun=async(...args)=>{const result=await claim(...args);controller.abort();return result;};
 }
 const harness=createHarness({store:one,invoke:async()=>{calls++;return {text:'Unexpected response',toolCalls:[]};}});
 await assert.rejects(harness.run({sessionId:session.id,text:message.text,firstMessageId:message.id,signal:controller.signal}));
 assert.equal(calls,0);assert.deepEqual(await one.getMessages(session.id,{includeImages:false}),[message]);
 assert.equal((await one.listSessions()).length,1);assert.equal((await one.getSession(session.id)).activeRun,undefined);
});
