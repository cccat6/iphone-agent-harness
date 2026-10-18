import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');
for(const method of ['start','complete'])for(const transition of ['replacement editor','new controller in the same editor'])test(`cancelled ${method} Codex login cannot change a ${transition}`,async()=>{
 let rejectPending,active=true;const pending=new Promise((_,reject)=>{rejectPending=reject;});
 let currentStatus={textContent:'original'};const nodes=new Map();
 const $=selector=>selector==='#codex-login-status'?currentStatus:nodes.get(selector)||(()=>{const node={disabled:false,hidden:false,elements:{name:{value:'Original account'}}};nodes.set(selector,node);return node;})();
 const state={codexAbort:new AbortController()};
 const context=vm.createContext({state,$,provider:{id:'old',name:'Original account'},login:{verification_url:'https://auth.openai.com'},guard:fn=>fn,AbortController,URL,editorActive:()=>active,providers:()=>[],removeCodexAccount(){},startCodexLogin:()=>pending,completeCodexLogin:()=>pending,setLocalizedText:(node,render)=>{if(node)node.textContent=render();},localizeError:value=>String(value)});
 const helperStart=source.indexOf('  const loginStatus='),helperEnd=source.indexOf('\n',helperStart);
 vm.runInContext(source.slice(helperStart,helperEnd),context);
 const marker=`$('#${method}-codex-login').onclick=guard(`,start=source.indexOf(marker),end=source.indexOf('\n',start);
 assert.ok(helperStart>=0&&start>=0);vm.runInContext(source.slice(start,end),context);
 const running=$(`#${method}-codex-login`).onclick();state.codexAbort.abort();active=transition!=='replacement editor';if(active)state.codexAbort=new AbortController();currentStatus={textContent:'NEW EDITOR INITIAL STATUS'};
 rejectPending(new Error('Synthetic aborted login'));await running;
 assert.equal(currentStatus.textContent,'NEW EDITOR INITIAL STATUS');
});
