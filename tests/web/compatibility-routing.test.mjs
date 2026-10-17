import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// Exercise the actual app route normalizer with browser primitives isolated.
// An unsupported phone must retain the Harness route so renderPlatform shows
// the non-dismissable compatibility gate, even when IndexedDB boot also fails.
const source=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');
const normalize=source.slice(source.indexOf('function canonicalizeLocation(){'),source.indexOf('\nfunction rememberRouteDraft'));
function route(compatibility,bootError){
  const environment={URL,URLSearchParams,location:{href:'https://example.test/',pathname:'/',hash:''},history:{replaceState(){}},state:{bootError},getBrowserCompatibility:()=>compatibility,routeForPath:()=> 'harness',routeHref:value=>value==='harness'?'/':'/'+value,legacyRoutes:{}};
  vm.createContext(environment);return vm.runInContext(normalize+'\ncanonicalizeLocation()',environment);
}
test('unsupported phone storage failures do not bypass compatibility gate',()=>{
  for(const reasonCode of ['REQUIRED_FEATURES_MISSING','IOS_VERSION_TOO_OLD','UNSUPPORTED_BROWSER'])assert.equal(route({platform:'ios',supportedForHarness:false,reasonCode},new Error('IndexedDB unavailable')),'harness');
  assert.equal(route({platform:'other',supportedForHarness:false},new Error('IndexedDB unavailable')),'harness');
});
test('desktop and supported phone runtime storage failure retain homepage fallback',()=>{
  assert.equal(route({platform:'desktop',supportedForHarness:false},null),'main');
  assert.equal(route({platform:'ios',supportedForHarness:true},new Error('IndexedDB could not open')),'main');
  assert.equal(route({platform:'ios',supportedForHarness:true},null),'harness');
});
