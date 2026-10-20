import test from 'node:test';
import assert from 'node:assert/strict';
import {LOCATION_MESSAGES} from '../../apps/web/locales/location.js';
import {messages} from '../../apps/web/locales/messages.js';
import {messagePresentation} from '../../apps/web/ui/message-presentation.js';
const expectedKeys=['title','enable','help','off','on','prompt','granted','denied','unsupported','deniedHelp','located','disabledError','deniedError','unavailableError','timeoutError','unsupportedError'].map(key=>'location.'+key);
const result={status:'located',latitude:12.34567,longitude:-45.6789,accuracy:25,timestamp:1700000000000};
const record=()=>({role:'tool',toolName:'phone_get_location',text:JSON.stringify(result)});
test('location settings and permission copy is present in all eight registered locale tables',()=>{
 assert.deepEqual(Object.keys(LOCATION_MESSAGES).sort(),['en','zh-Hans','zh-Hant','ja','ru','de','fr','es'].sort());
 for(const [locale,table]of Object.entries(LOCATION_MESSAGES)){
  assert.deepEqual(Object.keys(table),expectedKeys);
  for(const key of expectedKeys){assert.equal(typeof table[key],'string');assert.ok(table[key].length);assert.equal(messages[locale][key],table[key]);}
 }
});
test('normal location results show one localized confirmation and keep coordinates out of presentation',()=>{
 for(const [locale,table]of Object.entries(LOCATION_MESSAGES)){
  const message=record(),before=structuredClone(message),view=messagePresentation(message,{t:key=>table[key]||key});
  assert.equal(view.text,table['location.located'],locale);assert.equal(view.detail,'');assert.deepEqual(view.frameRefs,[]);
  assert.equal(JSON.stringify(view).includes(String(result.latitude)),false);assert.equal(JSON.stringify(view).includes('longitude'),false);assert.deepEqual(message,before);
 }
});
test('developer mode retains the complete location result for inspection',()=>{
 const message=record(),view=messagePresentation(message,{developerMode:true,t:key=>LOCATION_MESSAGES.en[key]||key});
 assert.equal(view.text,LOCATION_MESSAGES.en['location.located']);assert.deepEqual(JSON.parse(view.detail),result);assert.equal(message.text,JSON.stringify(result));
});
test('location confirmation only applies to a successful location tool result',()=>{
 assert.equal(messagePresentation({...record(),text:JSON.stringify({status:'denied'})}),null);
 const other=messagePresentation({role:'tool',toolName:'find_object',text:JSON.stringify({status:'located',summary:'Found the requested object'})});assert.equal(other.text,'Found the requested object');
 const user=messagePresentation({role:'user',text:JSON.stringify(result)});assert.equal(user.text,JSON.stringify(result));
});
