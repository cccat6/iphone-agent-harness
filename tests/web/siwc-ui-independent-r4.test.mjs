import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {startCodexLogin,validateCodexCallback} from '../../apps/web/core/codex.js';
import {mountCodexLogin,loadPendingCodexLogin} from '../../apps/web/ui/codex-login.js';
import {SIWC_MESSAGES} from '../../apps/web/locales/siwc.js';
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
function fixture(t,start=startCodexLogin){
 const old=new Map(['localStorage','sessionStorage','document'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));const local=new Map(),session=new Map(),controllers=[],mounted=[],nodes=new Map();let id='account-one',exchanges=0;
 const element=()=>({value:'',hidden:false,disabled:false,textContent:'',children:[],append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;}});
 for(const[k,v]of Object.entries({localStorage:{getItem:k=>local.get(k),setItem:(k,v)=>local.set(k,v)},sessionStorage:{getItem:k=>session.get(k),setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)},document:{createElement:element}}))Object.defineProperty(globalThis,k,{configurable:true,value:v});
 const field=name=>{if(!nodes.has(name))nodes.set(name,element());return nodes.get(name);};
 function mount(){nodes.clear();const ui=mountCodexLogin({root:{querySelector:s=>field(s.slice(1))},getProvider:()=>({id,name:'Synthetic test',protocol:'codex'}),prepareProvider:async()=>({provider:{id,name:'Synthetic test'},options:{}}),start,validate:validateCodexCallback,complete:async()=>{exchanges++;return {flow:'chatgpt-plan'};},onSuccess:async()=>{},onController:c=>controllers.push(c),t:key=>SIWC_MESSAGES.en[key]||key});mounted.push(ui);return ui;}
 t.after(()=>{for(const ui of mounted)ui.dispose();for(const[key,value]of old)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];});return {mount,field,setAccount:value=>id=value,get exchanges(){return exchanges;},controllers};
}
test('leaving and returning restores only the matching unfinished login, never the pasted callback',async t=>{
 const f=fixture(t),first=f.mount();await f.field('start-codex-login').onclick();const state=loadPendingCodexLogin().login.state;f.field('codex-callback').value='http://127.0.0.1:1455/auth/callback?code=not-submitted';first.dispose();assert.equal(f.controllers[0].signal.aborted,true);assert.equal(loadPendingCodexLogin().login.state,state);
 f.setAccount('account-two');const other=f.mount();assert.equal(other.pending(),false);assert.equal(f.field('codex-callback-field').hidden,true);other.dispose();assert.equal(loadPendingCodexLogin().provider.id,'account-one');
 f.setAccount('account-one');const restored=f.mount();assert.equal(restored.pending(),true);assert.equal(f.field('codex-callback').value,'');assert.equal(f.field('complete-codex-login').disabled,true);restored.cancel();assert.equal(loadPendingCodexLogin(),null);assert.equal(f.exchanges,0);
});
test('cancel during authorization generation cannot resurrect pending login when the response arrives',async t=>{
 const gate=deferred(),f=fixture(t,async options=>{const login=await startCodexLogin(options);await gate.promise;return login;}),ui=f.mount();const start=f.field('start-codex-login').onclick();await new Promise(resolve=>setImmediate(resolve));ui.cancel();gate.resolve();await start;assert.equal(ui.pending(),false);assert.equal(loadPendingCodexLogin(),null);assert.equal(f.field('codex-callback-field').hidden,true);assert.equal(f.field('start-codex-login').disabled,false);assert.equal(f.exchanges,0);
});
test('all guide translations name the actual subscription choice, callback field and completion button',async()=>{
 const files={en:'README.md','zh-Hans':'zh-Hans.md','zh-Hant':'zh-Hant.md',ja:'ja.md',ru:'ru.md',de:'de.md',fr:'fr.md',es:'es.md'};for(const[locale,file]of Object.entries(files)){const text=await readFile(new URL('../../docs/guide/'+file,import.meta.url),'utf8'),paragraph=text.split('\n').find(line=>line.includes('https://developers.openai.com/siwc/token-sharing-open-source/sign-in'));assert.ok(paragraph,locale);for(const key of ['accountType','start','callbackLabel','finish'])assert.ok(paragraph.includes(SIWC_MESSAGES[locale]['siwc.'+key]),locale+' '+key);assert.match(paragraph,/127\.0\.0\.1/);assert.match(paragraph,/Codex/);}
});
