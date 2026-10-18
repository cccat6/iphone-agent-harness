import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const app=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');
const start=app.indexOf("$('#refine-viewed-skill').onclick=guard("),end=app.indexOf('\n}',start);
assert.ok(start>=0&&end>start);

test('cancelled new-session device gate does not repurpose the existing conversation when refining a skill',async()=>{
 const nodes=new Map(),updates=[];
 const $=selector=>{if(!nodes.has(selector))nodes.set(selector,{value:selector==='#message-input'?'Existing unsent draft':'goal',close(){}});return nodes.get(selector);};
 const state={current:{id:'existing',mode:'goal'},store:{async updateSession(...args){updates.push(args);}}};
 const context=vm.createContext({$,state,skill:{id:'my-skill',name:'My Skill'},guard:fn=>fn,navigate(){},async newSession(){return null;},t:key=>key,resizeInput(){}});
 vm.runInContext(app.slice(start,end),context);
 await $('#refine-viewed-skill').onclick();
 assert.deepEqual(updates,[]);
 assert.equal($('#message-input').value,'Existing unsent draft');
 assert.equal($('#mode-select').value,'goal');
});
