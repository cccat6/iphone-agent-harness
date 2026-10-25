import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {openStore} from '../../apps/web/core/store.js';
import {setLocale,getLocale,t,SUPPORTED_LOCALES} from '../../apps/web/i18n.js';
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

test('return settings default on and persist independently without replacing other settings',async()=>{
 const store=await openStore({memory:true});await store.saveSettings({locale:'ja',providers:[{id:'preserved-api'}]});const state={store,settings:await store.getSettings()},checkboxes={'#return-to-harness':{},'#return-on-attention':{}};let html='';
 const context=vm.createContext({state,settings:state.settings,panel(title,subtitle,body){html=body;},t:key=>key,systemTextHTML:key=>key,$:key=>checkboxes[key],guard:fn=>fn});
 const start=source.indexOf("    panel(t('taskSettings.title')"),end=source.indexOf("  }else if(section==='context')",start);
 vm.runInContext(source.slice(start,end),context);assert.equal((html.match(/type="checkbox" checked/g)||[]).length,2);
 await checkboxes['#return-to-harness'].onchange({target:{checked:false}});
 assert.equal((await store.getSettings()).returnToHarness,false);
 await checkboxes['#return-on-attention'].onchange({target:{checked:false}});
 assert.equal((await store.getSettings()).returnOnAttention,false);
 context.settings=await store.getSettings();vm.runInContext(source.slice(start,end),context);assert.doesNotMatch(html,/type="checkbox" checked/);
 await checkboxes['#return-on-attention'].onchange({target:{checked:true}});
 assert.equal((await store.getSettings()).returnToHarness,false);assert.equal((await store.getSettings()).returnOnAttention,true);
 assert.equal((await store.getSettings()).locale,'ja');assert.equal((await store.getSettings()).providers[0].id,'preserved-api');
 await checkboxes['#return-to-harness'].onchange({target:{checked:true}});assert.equal((await store.getSettings()).returnToHarness,true);store.close();
});

test('the homepage has a localized five-step guide in all eight languages',()=>{
 const start=source.indexOf('function homeGuideHTML('),end=source.indexOf('\n',start);assert.ok(start>=0&&end>start);
 const context=vm.createContext({t,getLocale,routeHref:route=>route==='harness'?'/':'/'+route,URL,SITE_CONFIG:{repository:'https://github.com/cccat6/iphone-agent-harness'}});
 vm.runInContext(source.slice(start,end).replaceAll('import.meta.url',JSON.stringify('https://igent.cc/app.js')),context);
 try{for(const {code}of SUPPORTED_LOCALES){setLocale(code);const mobile=context.homeGuideHTML(true),desktop=context.homeGuideHTML(false);assert.equal((mobile.match(/<li>/g)||[]).length,5);assert.ok(!mobile.includes('guide.'));assert.match(mobile,/href="\/"/);assert.match(desktop,/href="\/flash"/);assert.ok(!mobile.includes('demo-placeholder.svg'));assert.ok(mobile.includes('shortcuts/clipboard.html'));}}finally{setLocale('auto');}
});


test('homepage recording plays only on request and example galleries are localized and expandable',()=>{
 const start=source.indexOf('function homeHeroHTML('),end=source.indexOf('function homeGuideHTML(',start);assert.ok(start>=0&&end>start);
 const context=vm.createContext({t,URL,routeHref:name=>name==='harness'?'/':'/'+name});vm.runInContext(source.slice(start,end).replaceAll('import.meta.url',JSON.stringify('https://igent.cc/app.js')),context);
 try{for(const {code}of SUPPORTED_LOCALES){setLocale(code);const desktop=context.homeHeroHTML(false),mobile=context.homeHeroHTML(true),gallery=context.homeShowcaseHTML(),html=desktop+gallery;assert.equal((html.match(/<video /g)||[]).length,1);assert.match(desktop,/<div class="site-hero-copy">/);assert.match(desktop,/<div class="site-hero-media">/);assert.match(desktop,/<a class="primary" href="\/flash">/);assert.match(mobile,/<a class="primary" href="\/">/);assert.ok(!gallery.includes('<video'));assert.ok(!desktop.includes('eyebrow'));assert.ok(!html.includes('showcase.'));assert.match(html,/<video controls playsinline preload="none"/);assert.ok(!html.includes('autoplay'));assert.match(html,/poster="https:\/\/igent.cc\/media\/mixue-order-demo-poster.jpg"/);assert.match(html,/src="https:\/\/igent.cc\/media\/mixue-order-demo.mp4" type="video\/mp4"/);assert.ok(html.includes(t('showcase.galleryDescription')));assert.equal((html.match(/class="showcase-image-link"/g)||[]).length,3);for(const name of ['sessions','conversation','skills']){assert.ok(html.includes(`href="https://igent.cc/media/${name}-example.jpg"`));assert.ok(html.includes(`alt="${t('showcase.'+name+'Alt')}"`));}assert.ok(!html.includes('demo-placeholder'));}}finally{setLocale('auto');}
});
