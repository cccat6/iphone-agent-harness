import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {messages} from '../../apps/web/locales/messages.js';
const source=await readFile(new URL('../../apps/web/bootstrap.js',import.meta.url),'utf8');
function run({path='/',ua='Mozilla/5.0 (iPhone; CPU iPhone OS 12_5 like Mac OS X) AppleWebKit/605.1.15 Version/12.0 Mobile/15E148 Safari/604.1',platform='iPhone',touch=1,languages=['en'],preference=null,missing='replaceAll',base='/'}={}){
  const elements=new Map(),listeners={},windowListeners={},timers=new Map();let clock=0,focused=null;
  function element(tag='div'){return {tagName:tag.toUpperCase(),style:{},hidden:true,className:'',attributes:{},children:[],innerHTML:'',setAttribute(name,value){this.attributes[name]=value;},removeAttribute(name){delete this.attributes[name];},focus(){focused=this.id;},contains(target){return target?.id==='legacy-home';},appendChild(child){this.children.push(child);if(child.id)elements.set(child.id,child);return child;}};}
  function byId(id){if(!elements.has(id)){const result=element();result.id=id;elements.set(id,result);}return elements.get(id);}
  const body=element('body'),location=new URL('https://example.test'+path);body.className='';
  const document={body,documentElement:{lang:'en'},currentScript:{src:'https://example.test'+base+'bootstrap.js'},getElementsByTagName:()=>[],getElementById:byId,createElement(tag){if(tag==='a')return new URL('https://example.test'+base+'bootstrap.js');const result=element(tag);if(tag==='script')result.noModule=false;return result;},addEventListener(name,fn){(listeners[name]||=[]).push(fn);}};
  const storage=new Map(preference?[['iah.locale',preference]]:[]);
  function Dialog(){}Dialog.prototype.showModal=function(){};
  const browserLocation={};for(const key of ['href','pathname','search','hash'])Object.defineProperty(browserLocation,key,{get:()=>location[key],set:value=>{if(key==='href')location.href=new URL(value,location).href;else location[key]=value;}});
  const window={navigator:{userAgent:ua,platform,maxTouchPoints:touch,languages},location:browserLocation,history:{replaceState(_state,_title,url){const changed=new URL(url,location);for(const key of ['pathname','search','hash'])location[key]=changed[key];}},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},addEventListener(name,fn){(windowListeners[name]||=[]).push(fn);},setTimeout:fn=>{timers.set(++clock,fn);return clock;},clearTimeout:id=>timers.delete(id),Promise,fetch(){},URL,Map,Set,WeakMap,TextEncoder,structuredClone,AbortController,AbortSignal,HTMLDialogElement:Dialog};
  const context=vm.createContext({window,document});
  if(missing==='replaceAll')vm.runInContext('String.prototype.replaceAll=undefined',context);
  if(missing==='hasOwn')vm.runInContext('Object.hasOwn=undefined',context);
  if(missing==='structuredClone')window.structuredClone=undefined;
  if(missing==='AbortSignal.any')window.AbortSignal=function(){};
  if(missing==='modules'){const create=document.createElement;document.createElement=tag=>{const result=create(tag);if(tag==='script')delete result.noModule;return result;};}
  vm.runInContext(source,context);
  return {window,document,elements,listeners,windowListeners,timers,storage,root:()=>elements.get('legacy-support'),module:()=>body.children.find(node=>node.type==='module'),focused:()=>focused};
}
test('classic guard avoids all modern modules for missing baseline APIs',()=>{
  for(const missing of ['replaceAll','hasOwn','structuredClone','AbortSignal.any','modules']){const env=run({missing});assert.equal(env.module(),undefined,missing);assert.equal(env.root().className,'legacy-gate');assert.equal(env.document.documentElement.lang,'en');assert.ok(env.root().innerHTML.includes(messages.en['compat.title']));}
});
test('legacy root gate has only homepage action and cannot dismiss with keyboard or focus escape',()=>{
  const env=run();assert.equal((env.root().innerHTML.match(/<button/g)||[]).length,1);assert.ok(!/<a\b|<dialog\b/.test(env.root().innerHTML));
  for(const key of ['Escape','Tab']){const event={key,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};env.listeners.keydown[0](event);assert.equal(event.prevented,true);assert.equal(event.stopped,true);assert.equal(env.focused(),'legacy-home');assert.equal(env.root().className,'legacy-gate');}
  env.listeners.focusin[0]({target:{id:'composer'}});assert.equal(env.focused(),'legacy-home');
  env.elements.get('legacy-home').onclick();assert.equal(env.window.location.href,'https://example.test/main');
});
test('all eight legacy locale resources show real localized gate and readable public routes',()=>{
  for(const locale of Object.keys(messages)){
    const gate=run({languages:[locale]});assert.equal(gate.document.documentElement.lang,locale);assert.ok(gate.root().innerHTML.includes(messages[locale]['compat.title']));
    for(const path of ['/main','/skills','/flash']){const page=run({path,languages:[locale]});assert.equal(page.root().className,'legacy-site');assert.ok(page.root().innerHTML.includes('href="/main"'));assert.ok(page.root().innerHTML.includes('href="/skills"'));assert.ok(page.root().innerHTML.includes('href="/flash"'));assert.ok(page.root().innerHTML.includes(messages[locale][path==='/skills'?'community.title':path==='/flash'?'flash.title':'home.heroTitle']));}
  }
});
test('legacy locale detection preserves language priority, script and manual selection',()=>{
  assert.equal(run({languages:['it-IT','zh-TW']}).document.documentElement.lang,'zh-Hant');
  assert.equal(run({languages:['zh-Hans-TW']}).document.documentElement.lang,'zh-Hans');
  assert.equal(run({languages:['zh-Hant-CN']}).document.documentElement.lang,'zh-Hant');
  assert.equal(run({languages:['en'],preference:'ja'}).document.documentElement.lang,'ja');
  const env=run({path:'/skills'}),select=env.elements.get('legacy-language');select.value='de';select.onchange();assert.equal(env.storage.get('iah.locale'),'de');assert.equal(env.document.documentElement.lang,'de');
});
test('desktop root redirects to main while desktop-UA iPad stays gated',()=>{
  const desktop=run({ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',platform:'MacIntel',touch:0});assert.equal(desktop.window.location.pathname,'/main');assert.equal(desktop.root().className,'legacy-site');
  const ipad=run({ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',platform:'MacIntel',touch:5});assert.equal(ipad.window.location.pathname,'/');assert.equal(ipad.root().className,'legacy-gate');
});
test('modern baseline loads the unchanged app; module failure falls back on the requested public route',()=>{
  const normal=run({missing:null});assert.equal(normal.root(),undefined);assert.equal(normal.module().src,'/app.js');normal.document.getElementById('site').hidden=false;normal.module().onload();assert.equal(normal.timers.size,0);
  const broken=run({path:'/skills',missing:null});broken.module().onerror();assert.equal(broken.root().className,'legacy-site');assert.ok(broken.root().innerHTML.includes(messages.en['community.title']));
});
test('old hash links and subfolder self-hosting normalize safely',()=>{
  const old=run({path:'/nested/#community',base:'/nested/'});assert.equal(old.window.location.pathname,'/nested/skills');assert.ok(old.root().innerHTML.includes('href="/nested/flash"'));
});

test('module load without a visible app keeps the blank-page timeout fallback',()=>{
  const env=run({path:'/main',missing:null});env.module().onload();assert.equal(env.timers.size,1);for(const callback of env.timers.values())callback();assert.equal(env.root().className,'legacy-site');
});
