import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;return {promise:new Promise((yes,no)=>{resolve=yes;reject=no;}),resolve:value=>resolve(value),reject:error=>reject(error)};};
function fixture(){
 const requests=[],renders=[],attributes={},dialog={open:true,close(){throw new Error('Library selection must not close an unrelated modal');}},state={archived:false,sessions:[{id:'initial-active'}],store:{listSessions(options){const waiting=deferred();requests.push({...waiting,options});return waiting.promise;}}};
 const nodes={'#session-search':{value:'query'},'#sessions':{setAttribute(key,value){attributes[key]=value;}},'#panel-dialog':dialog};
 const context=vm.createContext({state,$:selector=>nodes[selector],renderSessions(){renders.push({archived:state.archived,ids:state.sessions.map(row=>row.id)});}});
 const start=source.indexOf('async function refreshSessions('),end=source.indexOf('\nasync function pageSessions(',start);assert.ok(start>=0&&end>start);vm.runInContext(source.slice(start,end),context);
 const handler=source.indexOf("$('#list-label').onchange=guard(");assert.ok(handler>=0);const select={};context.guard=fn=>fn;const lookup=context.$;context.$=selector=>selector==='#list-label'?select:lookup(selector);
 vm.runInContext(source.slice(handler,source.indexOf(');',handler)+2),context);
 return {state,requests,renders,attributes,dialog,change:value=>select.onchange({target:{value}})};
}
test('list-title selector switches archives in place without opening settings or closing an unrelated modal',async()=>{
 const f=fixture(),changing=f.change('archived');assert.equal(f.requests[0].options.archived,true);assert.equal(f.requests[0].options.search,'query');assert.equal(f.attributes['aria-busy'],'true');
 f.requests[0].resolve([{id:'saved-archive'}]);await changing;assert.equal(f.state.archived,true);assert.deepEqual(f.state.sessions.map(row=>row.id),['saved-archive']);assert.equal(f.attributes['aria-busy'],'false');assert.equal(f.dialog.open,true);
});
test('rapid archive then active selection cannot display a late archive response over the active list',async()=>{
 const f=fixture(),archive=f.change('archived'),active=f.change('active');
 f.requests[1].resolve([{id:'latest-active'}]);await active;f.requests[0].resolve([{id:'stale-archive'}]);await archive;
 assert.equal(f.state.archived,false);assert.deepEqual(f.state.sessions.map(row=>row.id),['latest-active']);assert.equal(f.renders.length,1);assert.equal(f.dialog.open,true);
});
test('failed archive selection restores the displayed active library and clears busy state',async()=>{
 const f=fixture(),changing=f.change('archived'),error=new Error('fixture database read failed');f.requests[0].reject(error);await assert.rejects(changing,error);
 assert.equal(f.state.archived,false);assert.deepEqual(f.state.sessions.map(row=>row.id),['initial-active']);assert.equal(f.attributes['aria-busy'],'false');assert.equal(f.dialog.open,true);
});
test('failed latest selection after rapid toggles restores the last committed library rather than an uncommitted choice',async()=>{
 const f=fixture(),archive=f.change('archived'),active=f.change('active'),error=new Error('latest database query failed');
 f.requests[0].resolve([{id:'discarded-archive'}]);await archive;f.requests[1].reject(error);await assert.rejects(active,error);
 assert.equal(f.state.archived,false);assert.deepEqual(f.state.sessions.map(row=>row.id),['initial-active']);assert.equal(f.attributes['aria-busy'],'false');
});
