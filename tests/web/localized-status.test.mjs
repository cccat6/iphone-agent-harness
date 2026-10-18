import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {setLocalizedText,refreshLocalizedText} from '../../apps/web/ui/localized-status.js';
import {setLocale,t,localizeError,registerErrorCatalog,SUPPORTED_LOCALES} from '../../apps/web/i18n.js';
import {ERROR_CATALOG} from '../../apps/web/core/error-catalog.js';
registerErrorCatalog(ERROR_CATALOG);
const source=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');
function fixture(){const status={dataset:{},textContent:''};const user={value:'设置',dataset:{},textContent:'查看'};const root={querySelectorAll(){return status.dataset.liveI18n===undefined?[]:[status];}};return {status,user,root};}
test('actual provider status renderer recomputes HTTP error and fallback in all eight languages',()=>{
 const {status,user,root}=fixture(),error=Object.assign(new Error('PROVIDER_MODELS_HTTP (HTTP 404)'),{code:'PROVIDER_MODELS_HTTP',status:404});
 const statement=source.split('\n').find(line=>line.trim().startsWith('const modelsStatus='));assert.ok(statement);
 const context=vm.createContext({editorActive:()=>true,$:()=>status,setLocalizedText,t,localizeError,error});vm.runInContext(statement,context);
 setLocale('en');vm.runInContext('modelsStatus({error,fallback:true})',context);const english=status.textContent;
 for(const {code} of SUPPORTED_LOCALES){setLocale(code);refreshLocalizedText(root);assert.equal(status.textContent,t('common.failed',{detail:localizeError(error)})+' '+t('provider.modelsFallback'));assert.match(status.textContent,/404/);assert.equal(user.value,'设置');assert.equal(user.textContent,'查看');}
 setLocale('es');refreshLocalizedText(root);assert.notEqual(status.textContent,english);setLocale('auto');
});
test('actual provider status replaces old failure with loading and dynamic success across language changes',()=>{
 const {status,root}=fixture(),context=vm.createContext({editorActive:()=>true,$:()=>status,setLocalizedText,t,localizeError});
 vm.runInContext(source.split('\n').find(line=>line.trim().startsWith('const modelsStatus=')),context);
 setLocale('es');vm.runInContext("modelsStatus({key:'provider.modelsLoading'})",context);assert.equal(status.textContent,t('provider.modelsLoading'));
 vm.runInContext("modelsStatus({key:'provider.modelsFetched',variables:{count:2}})",context);
 for(const {code} of SUPPORTED_LOCALES){setLocale(code);refreshLocalizedText(root);assert.equal(status.textContent,t('provider.modelsFetched',{count:2}));}
 setLocale('auto');
});
test('refresh changes only explicitly bound system text and supports root nodes without replacing input state',()=>{
 const {status,user}=fixture();setLocale('en');setLocalizedText(status,()=>t('provider.modelsHint'));
 status.matches=selector=>selector==='[data-live-i18n]';status.querySelectorAll=()=>[];setLocale('ja');refreshLocalizedText(status);assert.equal(status.textContent,t('provider.modelsHint'));assert.equal(user.value,'设置');
 assert.equal(status.dataset.noI18n,'');assert.throws(()=>setLocalizedText(status,'rendered string'),TypeError);setLocale('auto');
});
