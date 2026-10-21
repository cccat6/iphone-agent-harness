import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {t,setLocale,SUPPORTED_LOCALES} from '../../apps/web/i18n.js';
const source=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');
test('latest control preserves its icon while toggling scroll state and updating eight-language accessible names',()=>{
 const icon={className:'ui-icon ui-icon-down'},attributes=new Map(),button={children:[icon],hidden:true,setAttribute:(name,value)=>attributes.set(name,value),set textContent(value){assert.fail('Updating a label must not remove the down icon: '+value);}},state={conversationFollow:{following:true},hasNewer:false};
 const context=vm.createContext({state,$:()=>button,t}),start=source.indexOf('function renderLatestControl()'),end=source.indexOf('\nasync function showLatestConversation',start);assert.ok(start>=0&&end>start);vm.runInContext(source.slice(start,end),context);
 try{for(const {code}of SUPPORTED_LOCALES){setLocale(code);state.conversationFollow.following=true;state.hasNewer=false;context.renderLatestControl();assert.equal(button.hidden,true);state.conversationFollow.following=false;context.renderLatestControl();assert.equal(button.hidden,false);assert.equal(attributes.get('aria-label'),t('interaction.latest'));assert.equal(attributes.get('title'),t('interaction.latest'));assert.deepEqual(button.children,[icon]);state.conversationFollow.following=true;state.hasNewer=true;context.renderLatestControl();assert.equal(button.hidden,false);}}finally{setLocale('auto');}
});
test('latest control belongs to the relative message surface and cannot become a separate composer flex row',async()=>{
 const html=await readFile(new URL('../../apps/web/index.html',import.meta.url),'utf8'),css=await readFile(new URL('../../apps/web/styles.css',import.meta.url),'utf8');
 assert.match(html,/<div class="conversation-surface">\s*<div id="conversation"[^>]*><\/div>\s*<button id="conversation-latest"[^>]*aria-controls="conversation"[^>]*hidden><span class="ui-icon ui-icon-down" aria-hidden="true"><\/span><\/button>\s*<\/div>\s*<section class="composer-wrap"/);
 assert.match(css,/\.conversation-surface\{[^}]*position:relative[^}]*flex:1[^}]*min-height:0/);const button=css.match(/\.conversation-latest\{([^}]+)\}/)?.[1];assert.ok(button);assert.match(button,/position:absolute/);assert.match(button,/width:44px/);assert.match(button,/height:44px/);assert.match(button,/border-radius:50%/);assert.match(css,/button\[hidden\],\[hidden\]\{display:none!important\}/);
});
