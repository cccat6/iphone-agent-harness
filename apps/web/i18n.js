import { messages, sourceAliases } from './locales/messages.js';
import { ERROR_CATALOG } from './core/error-catalog.js';

export const SUPPORTED_LOCALES = Object.freeze([
  {code:'en',name:'English'},{code:'zh-Hans',name:'简体中文'},{code:'zh-Hant',name:'繁體中文'},
  {code:'ja',name:'日本語'},{code:'ru',name:'Русский'},{code:'de',name:'Deutsch'},
  {code:'fr',name:'Français'},{code:'es',name:'Español'},
]);
const KEY='iah.locale';
const listeners=new Set();
let preference='auto';
try { const value=globalThis.localStorage?.getItem(KEY);if(value==='auto'||SUPPORTED_LOCALES.some(item=>item.code===value))preference=value; } catch {}
const errorCatalog=new Map();
function matchLocale(value) {
  const language=String(value||'').replaceAll('_','-').toLowerCase();
  if(language==='zh'||language.startsWith('zh-')){
    if(/(?:^|-)hans(?:-|$)/.test(language))return 'zh-Hans';
    if(/(?:^|-)hant(?:-|$)/.test(language))return 'zh-Hant';
    return /(?:^|-)(?:tw|hk|mo)(?:-|$)/.test(language)?'zh-Hant':'zh-Hans';
  }
  return SUPPORTED_LOCALES.find(item=>language===item.code||language.startsWith(item.code+'-'))?.code||null;
}
export function resolveLocale(value){return matchLocale(value)||'en';}
export function getLocalePreference(){return preference;}
export function getLocale(){return preference==='auto'?(globalThis.navigator?.languages||[globalThis.navigator?.language||'en']).map(matchLocale).find(Boolean)||'en':preference;}
export function t(key,variables={}) {
  const current=messages[getLocale()]||messages.en;const text=Object.hasOwn(current,key)?current[key]:Object.hasOwn(messages.en,key)?messages.en[key]:String(key);
  return text.replace(/\{([\w]+)\}/g,(match,name)=>variables[name]===undefined?match:String(variables[name]));
}
function notify(){if(globalThis.document)document.documentElement.lang=getLocale();for(const listener of listeners)try{listener(getLocale());}catch(error){console.error(error);}}
export function setLocale(value) {
  if(value!=='auto'&&!SUPPORTED_LOCALES.some(item=>item.code===value))throw new Error('Unsupported language');
  preference=value;try{globalThis.localStorage?.setItem(KEY,value);}catch{}notify();return getLocale();
}
export function subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);}
export function registerErrorCatalog(catalog){for(const [message,entry]of Object.entries(catalog||{}))errorCatalog.set(message,entry);}
export function localizeError(error) {
  const message=typeof error==='string'?error:error?.message||String(error);
  const suffix=message.match(/\s*[（(]HTTP\s+\d{3}[)）]\s*$/)?.[0]||'';
  const entry=errorCatalog.get(error?.code)||errorCatalog.get(message)||errorCatalog.get(suffix?message.slice(0,-suffix.length):message);
  if(typeof entry==='string')return t(entry);
  if(entry)return (entry[getLocale()]||entry.en||message)+(errorCatalog.has(message)?'':suffix);
  for(const [alias,translation]of errorCatalog)if(alias.length>4&&!/^[a-z_]+$/.test(alias)&&message.startsWith(alias))return (translation[getLocale()]||translation.en||alias)+message.slice(alias.length);
  return translateText(message);
}

// Reverse only unambiguous system values across all eight locales. Equal text
// shared by semantically different translations is intentionally not inferred.
const reverseCandidates=new Map();
for(const dictionary of Object.values(messages))for(const [key,value] of Object.entries(dictionary)){
  if(/\{\w+\}/.test(value)||value!==value.trim())continue;
  const text=value.trim();if(!reverseCandidates.has(text))reverseCandidates.set(text,new Set());reverseCandidates.get(text).add(key);
}
const reverseKeys=new Map();
for(const [value,keys] of reverseCandidates){
  const candidates=[...keys],signature=key=>SUPPORTED_LOCALES.map(locale=>messages[locale.code][key]).join('\u0000');
  if(candidates.every(key=>signature(key)===signature(candidates[0])))reverseKeys.set(value,candidates[0]);
}
for(const [value,key] of Object.entries(sourceAliases))if(!reverseCandidates.has(value.trim()))reverseKeys.set(value.trim(),key);
export function translationKey(source){return reverseKeys.get(String(source??'').trim())||null;}
// Only system nodes use inference; the view adapter protects content provenance.
export function translateText(source) {
  const value=String(source??''),trimmed=value.trim(),key=translationKey(trimmed);
  return key?value.replace(trimmed,t(key)):value;
}
export function skillMetadata(skill,{trustedCatalog=false,catalog=false}={}){
  const builtin=trustedCatalog===true||(!catalog&&skill?.source==='builtin'),id=String(skill?.id||'');
  const name=String(skill?.name||skill?.title||skill?.slug||id),description=String(skill?.description||'');
  const nameKey=builtin&&Object.hasOwn(messages.en,'skill.'+id+'.name')?'skill.'+id+'.name':null;
  const descriptionKey=builtin&&Object.hasOwn(messages.en,'skill.'+id+'.description')?'skill.'+id+'.description':null;
  return {name:nameKey?t(nameKey):name,description:descriptionKey?t(descriptionKey):description,nameKey,descriptionKey};
}
export function skillLabel(id,fallback=id){const value=t('skill.'+id+'.name');return value.startsWith('skill.')?fallback:value;}
export function skillDescription(id,fallback=''){const value=t('skill.'+id+'.description');return value.startsWith('skill.')?fallback:value;}
if(globalThis.addEventListener){globalThis.addEventListener('languagechange',()=>{if(preference==='auto')notify();});globalThis.addEventListener('storage',event=>{if(event.key===KEY){preference=event.newValue==='auto'||SUPPORTED_LOCALES.some(item=>item.code===event.newValue)?event.newValue:'auto';notify();}});}
if(globalThis.document)document.documentElement.lang=getLocale();
registerErrorCatalog(ERROR_CATALOG);
