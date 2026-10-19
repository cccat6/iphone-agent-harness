import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {openStore} from '../../apps/web/core/store.js';
import {setLocale,t,SUPPORTED_LOCALES} from '../../apps/web/i18n.js';
const source=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');
test('production return callback verifies the exact visible focused conversation and excludes website pages and open panels',()=>{
 const nodes={'#app':{classList:{contains:()=>true}},'#panel-dialog':{open:false},'#action-dialog':{open:false}};
 const state={store:{},current:{id:'own-session'},mcpAccess:{}},document={visibilityState:'visible',hasFocus:()=>true},location={origin:'https://igent.cc',pathname:'/'};
 let options;const context=vm.createContext({state,document,location,$:key=>nodes[key],URL,appBasePath:'/',legacyRoutes:{harness:'harness'},canonicalRoutes:{harness:'',main:'main'},onHarnessEvent(){},capture:{},deviceAdapter:{},deviceContext(){},deviceStatus(){},clipboard:{},createHarness(value){options=value;return {};}});
 const routeStart=source.indexOf('function routeHref('),routeEnd=source.indexOf('\nfunction canonicalizeLocation(',routeStart);vm.runInContext(source.slice(routeStart,routeEnd),context);
 const start=source.indexOf('  state.harness=createHarness('),end=source.indexOf('\n',start);assert.ok(start>=0&&end>start);vm.runInContext(source.slice(start,end),context);
 const read=()=>options.getHarnessState({sessionId:'own-session'});assert.equal(read().visible,true);assert.equal(new URL(read().url).origin,'https://igent.cc');assert.equal(new URL(read().url).searchParams.get('session'),'own-session');
 for(const pathname of ['/main','/skills','/flash']){location.pathname=pathname;assert.equal(read().visible,false);}location.pathname='/';
 state.current.id='other';assert.equal(read().visible,false);state.current.id='own-session';
 document.visibilityState='hidden';assert.equal(read().visible,false);document.visibilityState='visible';document.hasFocus=()=>false;assert.equal(read().visible,false);document.hasFocus=()=>true;
 nodes['#panel-dialog'].open=true;assert.equal(read().visible,false);nodes['#panel-dialog'].open=false;nodes['#action-dialog'].open=true;assert.equal(read().visible,false);nodes['#action-dialog'].open=false;
 nodes['#app'].classList.contains=()=>false;assert.equal(read().visible,false);
});

test('the actual completion setting is enabled by default and persists opt-out without replacing other settings',async()=>{
 const store=await openStore({memory:true});await store.saveSettings({locale:'ja',providers:[{id:'preserved-api'}]});const state={store,settings:await store.getSettings()},checkbox={};let html='';
 const context=vm.createContext({state,settings:state.settings,panel(title,subtitle,body){html=body;},t:key=>key,systemTextHTML:key=>key,$:()=>checkbox,guard:fn=>fn});
 const start=source.indexOf("    panel(t('taskSettings.title')"),end=source.indexOf("  }else if(section==='context')",start);assert.ok(start>=0&&end>start);
 vm.runInContext(source.slice(start,end),context);assert.match(html,/type="checkbox" checked/);await checkbox.onchange({target:{checked:false}});
 assert.equal((await store.getSettings()).returnToHarness,false);assert.equal((await store.getSettings()).locale,'ja');assert.equal((await store.getSettings()).providers[0].id,'preserved-api');
 context.settings=await store.getSettings();vm.runInContext(source.slice(start,end),context);assert.doesNotMatch(html,/type="checkbox" checked/);await checkbox.onchange({target:{checked:true}});assert.equal((await store.getSettings()).returnToHarness,true);store.close();
});

test('the homepage has a localized five-step guide and truthful demo placeholder in all eight languages',()=>{
 const start=source.indexOf('function homeGuideHTML('),end=source.indexOf('\n',start);assert.ok(start>=0&&end>start);
 const context=vm.createContext({t,routeHref:route=>route==='harness'?'/':'/'+route,URL,SITE_CONFIG:{repository:'https://github.com/cccat6/iphone-agent-harness'}});
 vm.runInContext(source.slice(start,end).replaceAll('import.meta.url',JSON.stringify('https://igent.cc/app.js')),context);
 try{for(const {code}of SUPPORTED_LOCALES){setLocale(code);const mobile=context.homeGuideHTML(true),desktop=context.homeGuideHTML(false);assert.equal((mobile.match(/<li>/g)||[]).length,5);assert.ok(!mobile.includes('guide.'));assert.ok(mobile.includes(t('guide.demoPending')));assert.match(mobile,/href="\/"/);assert.match(desktop,/href="\/flash"/);assert.ok(mobile.includes('demo-placeholder.svg'));assert.ok(!mobile.includes('<video'));assert.ok(mobile.includes('shortcuts/clipboard.html'));}}finally{setLocale('auto');}
});
