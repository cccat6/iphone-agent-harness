import test from 'node:test';import assert from 'node:assert/strict';
import {openStore} from '../../apps/web/core/store.js';import {createHarness} from '../../apps/web/core/harness.js';
import {contextSkills,synchronizeSkills} from '../../apps/web/core/skill-context.js';
const provider={id:'p',protocol:'openai',baseUrl:'https://fixture.invalid',model:'fixture'};
const call=(id,name,args)=>({text:'',toolCalls:[{id,name,arguments:args}]}),done={text:'ok',toolCalls:[]};
async function setup(){const store=await openStore({memory:true});await store.saveSettings({providers:[provider],activeProviderId:'p'});const session=await store.createSession({mode:'plan'});return {store,session};}
test('a second run reuses full same-version Skill instructions retained in its context',async()=>{
 const {store,session}=await setup();let n=0;
 await createHarness({store,invoke:async()=>++n===1?call('load-first','skills_load',{id:'phone-navigation'}):done}).run({sessionId:session.id,text:'first'});
 n=0;await createHarness({store,invoke:async()=>++n===1?call('load-again','skills_load',{id:'phone-navigation'}):done}).run({sessionId:session.id,text:'second'});
 const messages=await store.getMessages(session.id),last=messages.find(m=>m.toolCallId==='load-again');assert.equal(JSON.parse(last.text).status,'already_loaded');assert.equal(JSON.parse(last.text).instructions,undefined);
});
test('Skill catalog updates between runs preserve old prefix and append current procedures',async()=>{
 const {store,session}=await setup();const s={id:'custom',source:'authored',version:'1',description:'v1',content:'PROCEDURE ONE',enabled:true};await store.saveSkill(s);let n=0,first;
 await createHarness({store,invoke:async r=>{first??=structuredClone(r.messages.slice(0,2));return ++n===1?call('load-custom','skills_load',{id:'custom'}):done;}}).run({sessionId:session.id,text:'first'});
 await store.saveSkill({...s,version:'2',description:'v2',content:'PROCEDURE TWO'});
 let next;await createHarness({store,invoke:async r=>{next=r;return done;}}).run({sessionId:session.id,text:'second'});
 assert.deepEqual(next.messages.slice(0,2),first);assert.ok(next.messages.some(m=>m.skillContext&&m.text.includes('PROCEDURE TWO')));assert.ok(next.messages.some(m=>m.toolName==='skills_load'&&m.text.includes('PROCEDURE ONE')));
});
test('compacted-away skill metadata is insufficient to claim instructions remain loaded',()=>{
 const skills=[{id:'s',content:'actual',version:'2'}];assert.deepEqual(contextSkills([{role:'tool',toolName:'skills_load',text:'{"status":"already_loaded","id":"s","version":"2"}'}],skills),[]);
 const value=contextSkills([{role:'tool',toolName:'skills_load',text:'{"status":"loaded","id":"s","version":"1","instructions":"old"}'}],skills);assert.equal(value[0].instructions,'old');const synced=synchronizeSkills(value,skills);assert.equal(synced.loaded[0].instructions,'actual');assert.equal(synced.updates.length,1);
});
