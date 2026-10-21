import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from '../../apps/web/core/store.js';
import {createHarness} from '../../apps/web/core/harness.js';
import {createLocationAccess} from '../../apps/web/core/location.js';
const provider={id:'test',protocol:'openai',baseUrl:'https://model.invalid/v1',model:'fixture',stream:false};
async function fixture(enabled){const store=await openStore({memory:true});await store.saveSettings({providers:[provider],activeProviderId:provider.id,locationEnabled:enabled});const session=await store.createSession({mode:'chat'});let calls=0;const access=createLocationAccess({getSettings:()=>store.getSettings(),navigator:{geolocation:{getCurrentPosition(ok){calls++;ok({coords:{latitude:12.5,longitude:-45.25,accuracy:20},timestamp:1700000000000});}}}});return {store,session,access,get calls(){return calls;}};}
test('Harness reads location only on explicit tool call; provider sees data only afterwards',async()=>{
 const f=await fixture(true);let turns=0;
 const h=createHarness({store:f.store,locationAccess:f.access,invoke:async({messages,tools})=>{
  turns++;assert.ok(tools.some(t=>t.name==='phone_get_location'));
  if(turns===1){assert.equal(f.calls,0);assert.equal(messages.some(m=>m.text?.includes('12.5')),false);return {text:'',toolCalls:[{id:'geo-1',name:'phone_get_location',arguments:{}}]};}
  assert.equal(f.calls,1);const value=messages.find(m=>m.role==='tool'&&m.toolName==='phone_get_location');assert.equal(JSON.parse(value.text).latitude,12.5);return {text:'Here are options near you.',toolCalls:[]};
 }});await h.run({sessionId:f.session.id,text:'Find something nearby',mode:'chat'});assert.equal(turns,2);assert.equal(f.calls,1);
});
test('opted-in ordinary chat never reads location automatically',async()=>{const f=await fixture(true);await createHarness({store:f.store,locationAccess:f.access,invoke:async()=>({text:'Hello',toolCalls:[]})}).run({sessionId:f.session.id,text:'Hello',mode:'chat'});assert.equal(f.calls,0);});
test('location tool remains available without a saved opt-in and only reads on explicit call',async()=>{const f=await fixture(false);let n=0;await createHarness({store:f.store,locationAccess:f.access,invoke:async({tools})=>{assert.equal(tools.some(t=>t.name==='phone_get_location'),true);return ++n===1?{text:'',toolCalls:[{id:'requested',name:'phone_get_location',arguments:{}}]}:{text:'Location received.',toolCalls:[]};}}).run({sessionId:f.session.id,text:'Nearby',mode:'chat'});assert.equal(f.calls,1);});
test('background location without confirmed permission pauses and exposes a session authorization request',async()=>{
 const f=await fixture(false);let reads=0;const access=createLocationAccess({getSettings:()=>f.store.getSettings(),document:{visibilityState:'hidden'},navigator:{geolocation:{getCurrentPosition(){reads++;}},permissions:{query:async()=>({state:'prompt'})}}});
 let status;await createHarness({store:f.store,locationAccess:access,onEvent:event=>{if(event.type==='status')status=event.status;},invoke:async()=>({text:'',toolCalls:[{id:'request',name:'phone_get_location',arguments:{}}]})}).run({sessionId:f.session.id,text:'Nearby',mode:'chat'});
 assert.equal(reads,0);assert.equal(access.getSnapshot().sessionId,f.session.id);assert.equal(access.getSnapshot().code,'LOCATION_PERMISSION_REQUIRED');assert.equal(status,'needs_user');
});
