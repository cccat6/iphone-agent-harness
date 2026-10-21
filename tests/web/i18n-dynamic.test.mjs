import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {messages} from '../../apps/web/locales/messages.js';
import {getLocale,setLocale,t,translationKey,translateText,skillMetadata,localizeError} from '../../apps/web/i18n.js';
import {ERROR_CATALOG} from '../../apps/web/core/error-catalog.js';
import {openStore} from '../../apps/web/core/store.js';
const locales=Object.keys(messages),source=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');
const localizeSource=source.slice(source.indexOf('function localizeView('),source.indexOf('\nlet localeScheduled='));

test('unambiguous values reverse from every locale into every target locale',()=>{
  let count=0;
  for(const from of locales)for(const to of locales){setLocale(to);for(const [key,value] of Object.entries(messages[from])){const resolved=translationKey(value);if(!resolved)continue;assert.equal(translateText(value),messages[to][resolved],`${from}→${to}:${key}`);count++;}}
  assert.ok(count>10000);setLocale('auto');
});
test('provider help reverses through all eight languages without a Chinese or English source dependency',()=>{
  for(const from of locales)for(const to of locales){setLocale(to);for(const key of ['provider.visionHelp','provider.vaultHelp','provider.unlockEachTime'])assert.equal(translateText(messages[from][key]),messages[to][key]);}
  // "对话" can denote Chat mode or a Conversation title; inference must not guess.
  assert.equal(translationKey('对话'),null);setLocale('auto');
});
function viewFixture(){
  const nodes=[];
  function element({text='',key,protectedContent=false,actionTitle=false,cardTitle=false,input=false,value}={}){
    const result={dataset:{},value,attributes:{},protectedContent,actionTitle,cardTitle,input,children:[],parentElement:null,querySelector(){return null;},hasAttribute(name){return Object.hasOwn(this.attributes,name);},getAttribute(name){return this.attributes[name];},setAttribute(name,value){this.attributes[name]=value;},closest(selector){if(selector==='.card-title')return this.cardTitle?this:null;if(selector==='.tag')return null;return this.protectedContent&&selector.includes('[data-no-i18n]')||this.input&&selector.includes('input')||this.actionTitle&&selector.includes('#action-content h3')?this:null;}};
    const textNode={nodeValue:text,parentElement:result};result.children=[textNode];Object.defineProperty(result,'textContent',{get(){return this.children.map(node=>node.nodeValue).join('');},set(value){this.children[0].nodeValue=value;}});if(key){result.dataset.i18n=key;result.protectedContent=true;}nodes.push(result);return result;
  }
  const protectedSkill=element({text:'设置',protectedContent:true}),protectedSession=element({text:'设置',actionTitle:true}),account=element({text:'设置',cardTitle:true}),foreignDescription=element({text:'查看',protectedContent:true}),secret=element({text:'',input:true,value:'mock-unsaved-secret'}),name=element({text:'',input:true,value:'设置'}),help=element({text:messages.es['provider.visionHelp'],key:'provider.visionHelp'}),vault=element({text:messages.es['provider.vaultHelp'],key:'provider.vaultHelp'}),unlock=element({text:messages.es['provider.unlockEachTime'],key:'provider.unlockEachTime'}),builtin=element({text:messages.es['skill.phone-navigation.name'],key:'skill.phone-navigation.name'});
  const root={querySelector(){return null;},querySelectorAll(selector){if(selector==='[data-i18n]')return nodes.filter(node=>node.dataset.i18n);if(selector==='#mode-select option')return [];return [];}},document={body:root,createTreeWalker(){let index=0;return {nextNode:()=>nodes[index++]?.children[0]||null};}},context=vm.createContext({document,NodeFilter:{SHOW_TEXT:4},localizing:false,viewObserver:{disconnect(){},observe(){}},viewObserverOptions:{},localizedNodes:new WeakMap(),localizedAttributes:new WeakMap(),t,translateText,$$:()=>[]});
  vm.runInContext(localizeSource,context);
  return {render:()=>vm.runInContext('localizeView()',context),protectedSkill,protectedSession,account,foreignDescription,secret,name,help,vault,unlock,builtin};
}
test('actual view localization updates bound help and builtin metadata without replacing unsaved forms or user text',()=>{
  const fixture=viewFixture(),secret=fixture.secret,name=fixture.name;
  for(const locale of [...locales].reverse()){
    setLocale(locale);fixture.render();assert.equal(fixture.help.textContent,messages[locale]['provider.visionHelp']);assert.equal(fixture.vault.textContent,messages[locale]['provider.vaultHelp']);assert.equal(fixture.unlock.textContent,messages[locale]['provider.unlockEachTime']);assert.equal(fixture.builtin.textContent,messages[locale]['skill.phone-navigation.name']);
    assert.equal(fixture.protectedSkill.textContent,'设置');assert.equal(fixture.protectedSession.textContent,'设置');assert.equal(fixture.account.textContent,'设置');assert.equal(fixture.foreignDescription.textContent,'查看');assert.equal(fixture.secret,secret);assert.equal(fixture.name,name);assert.equal(secret.value,'mock-unsaved-secret');assert.equal(name.value,'设置');
  }setLocale('auto');
});
test('same-id foreign catalog or authored metadata never inherits builtin translations',()=>{
  const foreign={id:'phone-navigation',name:'设置',description:'查看',source:'community'};
  for(const locale of locales){setLocale(locale);assert.equal(skillMetadata(foreign).name,'设置');assert.equal(skillMetadata(foreign).description,'查看');assert.equal(skillMetadata({...foreign,source:'builtin'},{catalog:true,trustedCatalog:false}).name,'设置');assert.equal(skillMetadata({...foreign,source:'builtin'}).name,messages[locale]['skill.phone-navigation.name']);assert.equal(skillMetadata(foreign,{catalog:true,trustedCatalog:true}).description,messages[locale]['skill.phone-navigation.description']);}
  setLocale('auto');
});
test('session import uses current-language system suffix and fallback while preserving user title and historical role downgrade',async()=>{
  const store=await openStore({memory:true});
  for(const locale of locales){setLocale(locale);const options={titleSuffix:t('session.importSuffix'),fallbackTitle:t('session.importFallback')};const imported=await store.importSession({format:'iah-session',version:2,session:{title:'设置'},messages:[{role:'system',text:'historical instructions'}]},options);assert.equal(imported.title,'设置'+messages[locale]['session.importSuffix']);const [message]=await store.getMessages(imported.id);assert.equal(message.role,'user');assert.equal(message.internal,true);assert.equal(message.sourceRole,'system');const untitled=await store.importSession({format:'iah-session',version:1,session:{},messages:[]},options);assert.equal(untitled.title,messages[locale]['session.importFallback']+messages[locale]['session.importSuffix']);}
  const fallback=await store.importSession({format:'iah-session',version:2,session:{},messages:[]});assert.equal(fallback.title,'Conversation (imported)');await assert.rejects(store.importSession({format:'invalid',version:2,session:{},messages:[]}));setLocale('auto');
});
test('unlock and capture-source error codes and legacy unlock alias are localized in all eight languages',()=>{
  for(const locale of locales){setLocale(locale);for(const code of ['CREDENTIAL_UNLOCK_FAILED','CAPTURE_SOURCE_CHANGED'])assert.equal(localizeError(Object.assign(new Error(code),{code})),ERROR_CATALOG[code][locale]);assert.equal(localizeError('无法解锁，请检查口令与账号类型。'),ERROR_CATALOG.CREDENTIAL_UNLOCK_FAILED[locale]);}setLocale('auto');
});

test('language selector wiring works independently of the localization root',()=>{
 const select={value:'',onchange:null};let selected;
 const context=vm.createContext({$$:()=>[select],getLocalePreference:()=> 'en',setLocale:value=>{selected=value;}});
 const begin=source.indexOf('function wireLanguageSelector()'),end=source.indexOf('function showLanguageSettings()',begin);
 vm.runInContext(source.slice(begin,end),context);context.wireLanguageSelector();assert.equal(select.value,'en');select.value='zh-Hans';select.onchange();assert.equal(selected,'zh-Hans');
});
