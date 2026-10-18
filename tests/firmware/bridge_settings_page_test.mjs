import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {parseDeviceSetupLink} from '../../apps/web/core/device-setup.js';
const html=fs.readFileSync(process.argv[2],'utf8');
const script=html.match(/<script>([\s\S]*)<\/script>/)[1];
new vm.Script(script);
async function scenario(locale,storedToken='',rejectSave=false,systemLocale=locale,query=''){
 const fields=new Map(),calls=[];let saved;const metadata={hostname:'igent',boardId:'settings-board',harnessURL:'https://igent.cc/',rtc:{ip:'192.168.0.125',port:18948,fingerprint:'ab'.repeat(32)}};
 const element=id=>{if(!fields.has(id))fields.set(id,{value:'',textContent:'',hidden:true,disabled:false,checked:false});return fields.get(id);};
 const session=new Map([['iah-manager-token',storedToken]]),local=new Map();
 const storage=map=>({getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)});
 const context={navigator:{languages:[systemLocale]},location:{search:query},URLSearchParams,document:{documentElement:{},title:'',getElementById:element,querySelector:element},crypto:webcrypto,sessionStorage:storage(session),localStorage:storage(local),AbortController,setTimeout,clearTimeout,Uint8Array,URL,btoa,fetch:async(path,options)=>{
 calls.push({path,options});assert.equal(options.headers['X-Harness-Window'],'1');
 if(path==='/v1/pair'){const body=JSON.parse(options.body);assert.match(body.clientId,/^manager-[0-9a-f]{32}$/);assert.deepEqual(Object.keys(body),['clientId']);return Response.json({token:'a'.repeat(64)});}
 assert.equal(path,'/v1/settings');
 if(options.headers.Authorization==='Bearer stale')return Response.json({error:'invalid_client_credential'},{status:401});
 assert.equal(options.headers.Authorization,'Bearer '+'a'.repeat(64));
 if(options.method==='POST'){saved=JSON.parse(options.body);if(rejectSave)return Response.json({error:'board_busy'},{status:409});return Response.json({...metadata,...saved,newURL:'http://'+saved.hostname+'.local',restartRequired:saved.hostname!=='igent'});}
 return Response.json(metadata);
 }};
 vm.createContext(context);vm.runInContext(script,context);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(context.document.documentElement.lang,locale);
 assert.equal(vm.runInContext('Object.keys(messages).length',context),8);
 assert.equal(element('settings').hidden,false);assert.equal(element('hostname').value,'igent');assert.equal(element('connect').hidden,false);const incoming=parseDeviceSetupLink(element('connect').href);assert.equal(incoming.baseUrl,'http://igent.local');assert.equal(incoming.boardId,metadata.boardId);assert.equal(incoming.rtc.ip,metadata.rtc.ip);assert.equal(incoming.rtc.port,metadata.rtc.port);assert.equal(incoming.rtc.fingerprint,'AB:'.repeat(31)+'AB');assert.equal(incoming.owner,undefined);assert.equal(incoming.token,undefined);
 element('hostname').value='MY-BRIDGE';await element('settings').onsubmit({preventDefault(){}});
 assert.deepEqual(saved,{hostname:'my-bridge'});
 if(rejectSave){assert.equal(element('settings').hidden,false);assert.ok(element('status').textContent.startsWith(vm.runInContext('m[6]',context)));assert.match(element('status').textContent,/HTTP 409.*board_busy/);}
 else {assert.equal(element('settings').hidden,false);assert.equal(element('save').hidden,true);assert.equal(element('next').href,'http://my-bridge.local/settings?lang='+encodeURIComponent(locale));assert.equal(parseDeviceSetupLink(element('connect').href).baseUrl,'http://my-bridge.local');}
}
for(const locale of ['en','zh-Hans','zh-Hant','ja','ru','de','fr','es'])await scenario(locale);
await scenario('ja','','', 'de','?lang=ja');await scenario('en','','', 'unknown','?lang=xx');await scenario('zh-Hant','','', 'zh_HK');await scenario('en','stale');await scenario('en','a'.repeat(64),true);
assert.doesNotMatch(html,/connectionCode|pairingCodeRequired|setupPassword|type="password"|type="checkbox"/);
console.log('Bridge settings: eight locales, code-free enrollment, stale credential, hostname restart, public RTC import links and busy refusal pass');

async function importScenario(locale,{returnURL='',harnessURL='https://igent.cc/',failFirst=false,storageBlocked=false}={}){
 const fields=new Map(),calls=[];const element=id=>{if(!fields.has(id))fields.set(id,{value:'',textContent:'',hidden:true,disabled:false});return fields.get(id);};
 const metadata={hostname:'igent.local',boardId:'import-board',harnessURL,rtc:{ip:'192.168.0.125',port:18948,fingerprint:'ab'.repeat(32)}};
 const query=new URLSearchParams({import:'1',lang:locale,...(returnURL?{return:returnURL}:{})});let reads=0,storageAccesses=0;
 const context={navigator:{languages:['en']},location:{search:'?'+query},URLSearchParams,document:{documentElement:{},title:'',getElementById:element,querySelector:element},crypto:webcrypto,AbortController,setTimeout,clearTimeout,Uint8Array,URL,btoa,fetch:async(path,options)=>{
  calls.push(path);assert.equal(path,'/v1/identity','information mode never enrolls a manager or reads protected settings');assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,undefined);
  if(failFirst&&reads++===0)return Response.json({error:'origin_required'},{status:403});return Response.json(metadata);
 }};
 for(const name of ['sessionStorage','localStorage'])Object.defineProperty(context,name,{get(){storageAccesses++;if(storageBlocked)throw new Error('blocked');return {getItem(){throw new Error('information mode must not access credentials');}};}});
 vm.createContext(context);vm.runInContext(script,context);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(context.document.documentElement.lang,locale);assert.equal(element('h1').textContent,vm.runInContext('m[10]',context));assert.equal(storageAccesses,0);
 assert.equal(element('settings').hidden,true);assert.equal(element('next').hidden,true);
 if(failFirst){assert.equal(element('connect').hidden,true);assert.equal(element('retry').hidden,false);assert.ok(element('status').textContent.startsWith(vm.runInContext('m[14]',context)));assert.match(element('status').textContent,/HTTP 403/);await element('retry').onclick();}
 assert.equal(element('connect').hidden,false);assert.equal(element('retry').hidden,true);assert.equal(element('connect').textContent,vm.runInContext('m[13]',context));assert.equal(element('status').textContent,vm.runInContext('m[12]',context));
 const link=new URL(element('connect').href),incoming=parseDeviceSetupLink(link.href);assert.equal(incoming.baseUrl,'http://igent.local');assert.equal(incoming.boardId,'import-board');assert.equal(incoming.rtc.ip,'192.168.0.125');assert.equal(link.origin,new URL(harnessURL).origin);
 const requested=returnURL?new URL(returnURL):null;if(requested?.protocol==='https:'&&requested.origin===new URL(harnessURL).origin&&!requested.username&&!requested.password){assert.equal(link.pathname,requested.pathname);assert.equal(link.search,requested.search);}else{assert.equal(link.pathname,new URL(harnessURL).pathname);assert.equal(link.search,new URL(harnessURL).search);}
 assert.equal(calls.length,failFirst?2:1);
}
for(const locale of ['en','zh-Hans','zh-Hant','ja','ru','de','fr','es'])await importScenario(locale,{storageBlocked:true,returnURL:'https://igent.cc/?session=saved-session&panel=devices'});
await importScenario('zh-Hans',{failFirst:true});await importScenario('en',{returnURL:'https://attacker.invalid/path'});await importScenario('en',{returnURL:'http://igent.cc/'});await importScenario('en',{returnURL:'https://user@igent.cc/?panel=devices'});await importScenario('en',{harnessURL:'https://self-host.invalid/harness/',returnURL:'https://self-host.invalid/harness/?panel=devices'});
assert.match(html,/\[hidden\]\{display:none!important\}/,'explicit hidden semantics override the block link rule');
console.log('Bridge information: eight locales, public identity only, blocked storage, retry, safe return URL and hidden management controls pass');

async function informationFailureScenario(locale,kind,recover=false){
 const fields=new Map(),calls=[];const element=id=>{if(!fields.has(id))fields.set(id,{textContent:'',hidden:true,disabled:false});return fields.get(id);};
 const metadata={hostname:'igent.local',boardId:'import-board',harnessURL:'https://igent.cc/',rtc:{ip:'192.168.0.125',port:18948,fingerprint:'ab'.repeat(32)}};
 const context={navigator:{languages:[locale]},location:{search:'?import=1'},URLSearchParams,document:{documentElement:{},title:'',getElementById:element,querySelector:element},crypto:webcrypto,AbortController,Uint8Array,URL,btoa,setTimeout(handler,delay){if(delay===500){queueMicrotask(handler);return 0;}return setTimeout(handler,delay);},clearTimeout,fetch:async(path,options)=>{
  calls.push(path);assert.equal(path,'/v1/identity');assert.equal(options.method,'GET');if(recover&&calls.length>1)return Response.json(metadata);
  if(kind==='network')throw new TypeError('arbitrary sensitive transport message');
  if(kind==='timeout')throw Object.assign(new Error('arbitrary timeout message'),{name:'AbortError'});
  if(kind==='invalid-json')return new Response('<html>secret raw HTML</html>',{status:200});
  if(kind==='invalid-info')return Response.json({...metadata,rtc:null});
  if(kind==='invalid-home')return Response.json({...metadata,harnessURL:'invalid-url'});
  if(kind==='forbidden-null')return Response.json(null,{status:403});
  if(kind==='service-null')return Response.json(null,{status:503});
  if(kind==='forbidden')return Response.json({error:'origin_required'},{status:403});
  if(kind==='missing')return Response.json({error:'not_found'},{status:404});
  if(kind==='arbitrary-error')return Response.json({error:'secret bearer token raw arbitrary upstream body'},{status:400});
  return Response.json({error:'service_unavailable'},{status:503});
 }};
 vm.createContext(context);vm.runInContext(script,context);for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));
 const transient=['network','timeout','service','service-null'].includes(kind);assert.equal(calls.length,transient?2:1);
 if(recover){assert.equal(element('connect').hidden,false);assert.equal(element('retry').hidden,true);assert.equal(element('status').textContent,vm.runInContext('m[12]',context));return;}
 assert.equal(element('connect').hidden,true);assert.equal(element('settings').hidden,true);assert.equal(element('retry').hidden,false);
 const status=element('status').textContent;assert.ok(status.startsWith(vm.runInContext('m[14]',context)));assert.doesNotMatch(status,/secret|arbitrary|bearer token|raw HTML|timeout message/);
 const reasonIndex={network:17,timeout:16,'invalid-json':18,'invalid-info':18,'invalid-home':18,forbidden:21,'forbidden-null':21,'service-null':24,missing:22,'arbitrary-error':21,service:24}[kind];assert.ok(status.includes(vm.runInContext('m['+reasonIndex+']',context)),status);
 if(kind==='service'||kind==='service-null')assert.match(status,/HTTP 503/);if(kind==='forbidden-null')assert.match(status,/HTTP 403/);if(kind==='forbidden')assert.match(status,/HTTP 403.*origin_required/);if(kind==='missing')assert.match(status,/HTTP 404.*not_found/);if(kind==='invalid-json')assert.match(status,/HTTP 200/);
}
for(const locale of ['en','zh-Hans','zh-Hant','ja','ru','de','fr','es'])for(const kind of ['network','timeout','service','forbidden','missing','invalid-json','invalid-info','invalid-home','arbitrary-error','forbidden-null','service-null'])await informationFailureScenario(locale,kind);
await informationFailureScenario('en','service',true);await informationFailureScenario('zh-Hans','network',true);
console.log('Bridge information failures: eight locales show safe status/reason details; transient GET retries once, 4xx/invalid data do not; recovery never enrolls or navigates');

async function managementFailureScenario(locale){
 const fields=new Map(),element=id=>{if(!fields.has(id))fields.set(id,{value:'',textContent:'',hidden:true,disabled:false});return fields.get(id);};let calls=0;
 const context={navigator:{languages:[locale]},location:{search:''},URLSearchParams,document:{documentElement:{},title:'',getElementById:element,querySelector:element},crypto:webcrypto,sessionStorage:{getItem(){return 'a'.repeat(64);}},localStorage:{getItem(){return 'manager-'+('a'.repeat(32));}},AbortController,setTimeout,clearTimeout,Uint8Array,URL,btoa,fetch:async(path)=>{calls++;assert.equal(path,'/v1/settings');return Response.json({error:'origin_required',unsafe:'secret arbitrary body'},{status:403});}};
 vm.createContext(context);vm.runInContext(script,context);for(let i=0;i<3;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls,1);const status=element('status').textContent;assert.ok(status.startsWith(vm.runInContext('m[7]',context)));assert.match(status,/HTTP 403.*origin_required/);assert.doesNotMatch(status,/secret|arbitrary/);assert.equal(element('settings').hidden,true);
}
for(const locale of ['en','zh-Hans','zh-Hant','ja','ru','de','fr','es']){await managementFailureScenario(locale);await scenario(locale,'a'.repeat(64),true);}
console.log('Bridge management failures: eight locales retain safe HTTP/reason details for page load and save errors');
