import test from 'node:test';
import assert from 'node:assert/strict';
import {trustedNonceDigit,defaultBridgeEndpoint} from '../../apps/web/ui/device-panel.js';
import {DEVICE_MESSAGES} from '../../apps/web/locales/device.js';

// DOM-origin isTrusted cannot be set by browser scripts; the shape here tests the
// parser's rejection paths without issuing input to a phone or a device.
test('device proof accepts physical Digit codes before localized key values',()=>{
  assert.equal(trustedNonceDigit({isTrusted:true,code:'Digit1',key:'&'}),'1');
  assert.equal(trustedNonceDigit({isTrusted:true,code:'Digit8',key:'٨'}),'8');
  assert.equal(trustedNonceDigit({isTrusted:true,code:'Numpad2',key:'2'}),'2');
  assert.equal(trustedNonceDigit({isTrusted:true,code:'Unidentified',key:'7'}),'7');
});
test('device proof rejects synthetic, repeated, modified and non-digit input',()=>{
  for(const event of [undefined,{code:'Digit1',key:'1'},{isTrusted:false,code:'Digit1',key:'1'},...['repeat','ctrlKey','metaKey','altKey'].map(flag=>({isTrusted:true,code:'Digit1',key:'1',[flag]:true})),{isTrusted:true,code:'KeyA',key:'a'},{isTrusted:true,code:'Unidentified',key:'١'},{isTrusted:true,key:'12'}])assert.equal(trustedNonceDigit(event),null);
});
test('device onboarding has all eight locales with matching placeholders',()=>{
  const locales=['en','zh-Hans','zh-Hant','ja','ru','de','fr','es'];
  assert.deepEqual(Object.keys(DEVICE_MESSAGES).sort(),locales.sort());
  for(const locale of locales){assert.deepEqual(Object.keys(DEVICE_MESSAGES[locale]).sort(),Object.keys(DEVICE_MESSAGES.en).sort());for(const [key,text] of Object.entries(DEVICE_MESSAGES[locale])){assert.ok(text.trim(),locale+':'+key);assert.deepEqual((text.match(/\{\w+\}/g)||[]).sort(),(DEVICE_MESSAGES.en[key].match(/\{\w+\}/g)||[]).sort(),locale+':'+key);}}
});

test('only the previous automatic bridge hostname migrates to the shared default',()=>{
 assert.equal(defaultBridgeEndpoint(''),'http://igent.local');
 assert.equal(defaultBridgeEndpoint('http://harness-b0e4b4e05380.local'),'http://igent.local');
 for(const address of ['http://my-bridge.local','http://harness-abcdef.local','https://harness-b0e4b4e05380.local','http://192.168.0.125','http://harness-b0e4b4e05380.local:8080'])assert.equal(defaultBridgeEndpoint(address),address);
});
