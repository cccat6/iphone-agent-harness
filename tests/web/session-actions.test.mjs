import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionActions} from '../../apps/web/ui/session-actions.js';
function fixture(){
 const session={id:'one',title:'Alarm',pinned:false,archived:false};
 const state={running:false,submitting:false,pending:'Partial reply',lastError:'HTTP 401',capturePaused:true,current:session};
 const calls=[];let deleted=0;
 const actions=createSessionActions({
  store:{async updateSession(id,patch){calls.push(['update',id,patch]);return {...session,...patch,updatedAt:123};},async deleteSession(id){calls.push(['delete',id]);deleted++;}},
  isBusy:id=>id===state.current.id&&(state.running||state.submitting),
  confirmDelete:()=>true,copy:async id=>calls.push(['copy',id]),exportSession:async id=>calls.push(['export',id]),
  onMetadata:(id,patch)=>Object.assign(state.current,patch),onDeleted:async id=>calls.push(['removed',id]),
  refresh:async()=>calls.push(['refresh'])
 });return {state,calls,actions,session,get deleted(){return deleted;}};
}
for(const action of ['cancel','copy','export'])test(`${action} preserves streaming, failure and paused state`,async()=>{
 const f=fixture();f.state.running=true;f.state.submitting=true;const before=structuredClone(f.state);
 await f.actions.perform(action,f.session);assert.deepEqual(f.state,before);assert.deepEqual(f.calls,action==='cancel'?[]:[[action,'one']]);
});
test('pin and archive update metadata without touching pending reply or failure',async()=>{
 const f=fixture();await f.actions.perform('pin',f.session);await f.actions.perform('archive',f.session);
 assert.equal(f.state.current.pinned,true);assert.equal(f.state.current.archived,true);assert.equal(f.state.pending,'Partial reply');assert.equal(f.state.lastError,'HTTP 401');
 await f.actions.perform('restore',f.session);assert.equal(f.state.current.archived,false);
});
for(const phase of ['running','submitting'])test(`delete rejects while ${phase}`,async()=>{const f=fixture();f.state[phase]=true;await assert.rejects(f.actions.perform('delete',f.session),{code:'SESSION_BUSY'});assert.equal(f.deleted,0);assert.deepEqual(f.calls,[]);});
test('delete rechecks work started while confirmation was open',async()=>{
 let busy=false,deleted=false;const a=createSessionActions({isBusy:()=>busy,confirmDelete:async()=>{busy=true;return true;},store:{deleteSession:()=>{deleted=true;}}});
 await assert.rejects(a.perform('delete',{id:'one'}),{code:'SESSION_BUSY'});assert.equal(deleted,false);
});
test('duplicate delete is refused and lock releases after storage error',async()=>{
 let rejectWrite,active=false;const pending=new Promise((_,reject)=>{rejectWrite=reject;});
 const a=createSessionActions({isBusy:()=>false,confirmDelete:()=>true,store:{deleteSession:()=>pending},onDeleting:(id,busy)=>{active=busy;},onDeleted:()=>{},refresh:()=>{}});
 const first=a.perform('delete',{id:'one'});await new Promise(r=>setImmediate(r));assert.equal(active,true);
 await assert.rejects(a.perform('delete',{id:'one'}),{code:'SESSION_BUSY'});rejectWrite(new Error('quota'));await assert.rejects(first,/quota/);assert.equal(active,false);
});
test('independent deletes keep per-session locks until each write finishes',async()=>{
 const completions=new Map();const a=createSessionActions({isBusy:()=>false,confirmDelete:()=>true,store:{deleteSession:id=>new Promise(resolve=>completions.set(id,resolve))},onDeleted:()=>{},refresh:()=>{}});
 const one=a.perform('delete',{id:'one'}),two=a.perform('delete',{id:'two'});await new Promise(r=>setImmediate(r));assert.equal(a.isDeleting('one'),true);assert.equal(a.isDeleting('two'),true);
 completions.get('two')();await two;assert.equal(a.isDeleting('one'),true);assert.equal(a.isDeleting('two'),false);completions.get('one')();await one;assert.equal(a.isDeleting('one'),false);
});
