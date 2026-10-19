import test from 'node:test';import assert from 'node:assert/strict';
import {messagePresentation,createConversationFollow} from '../../apps/web/ui/message-presentation.js';
import {openStore} from '../../apps/web/core/store.js';
import {createHistoryWindow} from '../../apps/web/core/history-window.js';
import {INTERACTION_MESSAGES} from '../../apps/web/locales/interaction-refinement.js';
const t=key=>INTERACTION_MESSAGES['zh-Hans'][key]||key;
test('ordinary users see useful tool summaries and thumbnails without protocol JSON; original record remains intact',()=>{
 const m={role:'tool',toolName:'phone_execute_plan',text:JSON.stringify({status:'not_executed',code:'stopped_after_prior_failure_or_cancellation',results:[{secret:'protocol detail'}]}),frameRefs:['local-asset:a']};const before=m.text;
 const view=messagePresentation(m,{t});assert.equal(view.text,t('interaction.observed'));assert.equal(view.detail,'');assert.deepEqual(view.frameRefs,['local-asset:a']);assert.equal(m.text,before);
 const debug=messagePresentation(m,{t,developerMode:true});assert.match(debug.detail,/stopped_after_prior_failure_or_cancellation/);
 assert.equal(messagePresentation({role:'user',text:'{"my":"json"}'},{t}).text,'{"my":"json"}');
 assert.equal(messagePresentation({role:'user',text:'Harness runtime context',internal:true},{t}),null);
});
test('only bounded developer history includes internal runtime records; proposals retain execute metadata after reload',async()=>{
 const store=await openStore({memory:true}),session=await store.createSession({mode:'auto'});await store.addMessage(session.id,{role:'user',text:'runtime',internal:true});await store.addMessage(session.id,{role:'assistant',text:'Plan',taskPlan:{id:'p',goal:'Alarm',steps:['Open Clock'],status:'proposed'}});
 const normal=await createHistoryWindow(store).load(session.id);assert.equal(normal.messages.length,1);assert.equal(normal.messages[0].taskPlan.goal,'Alarm');
 const dev=await createHistoryWindow(store,{includeInternal:true,pageSize:2,maxMessages:2}).load(session.id);assert.equal(dev.messages.length,2);assert.equal(dev.messages[0].internal,true);
});
test('stream, image decode and appended content follow newest output until explicit scroll back',()=>{
 const events=new Map(),queue=[];const region={scrollHeight:500,clientHeight:200,scrollTop:300,addEventListener:(k,v)=>events.set(k,v),removeEventListener(){}};
 const follow=createConversationFollow({region,requestFrame:fn=>(queue.push(fn),queue.length),cancelFrame(){}});follow.beforeRender();region.scrollHeight=800;follow.afterRender();queue.shift()();assert.equal(region.scrollTop,800);
 region.scrollTop=600;events.get('wheel')({type:'wheel',deltaY:-1});region.scrollTop=200;follow.beforeRender();region.scrollHeight=1000;follow.afterRender();assert.equal(queue.length,0);assert.equal(region.scrollTop,200);
 follow.follow();queue.shift()();assert.equal(region.scrollTop,1000);follow.destroy();
});
test('interaction text exists in eight languages with matching keys',()=>{const keys=Object.keys(INTERACTION_MESSAGES.en);for(const table of Object.values(INTERACTION_MESSAGES)){assert.deepEqual(Object.keys(table),keys);assert.ok(Object.values(table).every(value=>typeof value==='string'&&value.length));}});
test('session file roundtrip preserves bounded plan and tool presentation metadata, rejects malformed proposal',async()=>{
 const {exportSessionFile,importSessionFile}=await import('../../apps/web/core/session-files.js');const store=await openStore({memory:true}),session=await store.createSession({mode:'auto'});
 const taskPlan={id:'proposal',goal:'Set alarm',steps:['Open Clock','Verify time'],status:'proposed'};await store.addMessage(session.id,{role:'assistant',text:'Plan',taskPlan});await store.addMessage(session.id,{role:'tool',text:'{"status":"captured"}',toolName:'phone_observe'});
 const file=await exportSessionFile(store,session.id),copy=await importSessionFile(store,file),messages=await store.getMessages(copy.id,{includeImages:false});assert.deepEqual(messages[0].taskPlan,taskPlan);assert.equal(messages[1].toolName,'phone_observe');
 const malformed=new Blob([JSON.stringify({format:'iah-session',version:2,session:{title:'Bad'},messages:[{role:'assistant',text:'bad',taskPlan:{...taskPlan,steps:'not an array'}}]})]);await assert.rejects(importSessionFile(store,malformed));
});
