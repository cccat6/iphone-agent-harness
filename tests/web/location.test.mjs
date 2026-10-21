import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocationAccess} from '../../apps/web/core/location.js';
import {mountLocationSettings} from '../../apps/web/ui/location-settings.js';
const fix={coords:{latitude:12.5,longitude:-45.25,accuracy:30,altitude:100},timestamp:1700000000000};
function fixture({enabled=true,secure=true,timeout=1000}={}){
 let settings={locationEnabled:enabled},success,error,calls=0,options;
 const navigator={geolocation:{getCurrentPosition(ok,bad,opts){calls++;success=ok;error=bad;options=opts;}},permissions:{query:async()=>({state:'prompt'})}};
 const access=createLocationAccess({getSettings:async()=>settings,navigator,isSecure:()=>secure,deadlineMs:timeout});
 return {access,navigator,get calls(){return calls;},get options(){return options;},set enabled(value){settings={locationEnabled:value};},async start(signal){const promise=access.read({signal});promise.catch(()=>{});await new Promise(r=>setImmediate(r));return {promise};},success:v=>success(v),error:v=>error(v)};
}
test('permission inspection never reads coordinates; explicit foreground request works without saved opt-in',async()=>{
 const f=fixture({enabled:false});assert.equal(await f.access.isEnabled(),false);assert.equal(await f.access.permission(),'prompt');assert.equal(f.calls,0);
 const {promise}=await f.start();assert.equal(f.calls,1);f.success(fix);assert.equal((await promise).status,'located');
 f.enabled=true;assert.equal(await f.access.isEnabled(),false);assert.equal(f.calls,1);
});
test('one explicit call returns a fresh minimal WGS84 result',async()=>{
 const f=fixture();const {promise}=await f.start();assert.equal(f.calls,1);assert.deepEqual(f.options,{enableHighAccuracy:false,maximumAge:0,timeout:15000});f.success(fix);
 assert.deepEqual(await promise,{status:'located',source:'browser-device',coordinateSystem:'WGS84',latitude:12.5,longitude:-45.25,accuracyMeters:30,timestamp:'2023-11-14T22:13:20.000Z'});
});
test('permission query unavailable does not block an explicitly requested fix',async()=>{
 const f=fixture();f.navigator.permissions.query=async()=>{throw new TypeError('Unsupported permission')};assert.equal(await f.access.permission(),'unknown');const {promise}=await f.start();f.success(fix);assert.equal((await promise).status,'located');
});
for(const [code,expected] of [[1,'LOCATION_DENIED'],[2,'LOCATION_UNAVAILABLE'],[3,'LOCATION_TIMEOUT']])test('browser geolocation error '+code,async()=>{const f=fixture();const {promise}=await f.start();f.error({code,message:'do not expose OS details'});await assert.rejects(promise,{code:expected,message:expected});assert.equal(f.calls,1);});
test('disabled in another view during acquisition discards coordinates',async()=>{const f=fixture();f.navigator.permissions.query=async()=>({state:'granted'});const {promise}=await f.start();f.enabled=false;f.success(fix);await assert.rejects(promise,{code:'LOCATION_DISABLED'});});
test('switching off cancels immediately and ignores late callbacks even after enabling again',async()=>{const f=fixture();const {promise}=await f.start();f.access.cancel();f.enabled=true;f.success(fix);await assert.rejects(promise,{code:'LOCATION_DISABLED'});});
test('stop cancels request and late success cannot deliver data',async()=>{const f=fixture(),c=new AbortController();const {promise}=await f.start(c.signal);c.abort();f.success(fix);await assert.rejects(promise,{name:'AbortError'});});
test('wall-clock deadline also bounds an unanswered permission prompt',async()=>{const f=fixture({timeout:10});const {promise}=await f.start();await assert.rejects(promise,{code:'LOCATION_TIMEOUT'});f.success(fix);assert.equal(f.calls,1);});
test('invalid browser position is rejected without leaking arbitrary fields',async()=>{const f=fixture();const {promise}=await f.start();f.success({...fix,coords:{...fix.coords,latitude:91}});await assert.rejects(promise,{code:'LOCATION_UNAVAILABLE'});});
test('insecure or unsupported environment never starts acquisition',async()=>{const f=fixture({secure:false});assert.equal(await f.access.permission(),'unsupported');await assert.rejects(f.access.read(),{code:'LOCATION_UNSUPPORTED'});assert.equal(f.calls,0);});
test('disable while settings are pending prevents the browser API call',async()=>{
 let resolve,calls=0;const access=createLocationAccess({getSettings:()=>new Promise(r=>resolve=r),navigator:{geolocation:{getCurrentPosition(){calls++;}}}});
 const p=access.read();access.cancel();resolve({locationEnabled:true});await assert.rejects(p,{code:'LOCATION_DISABLED'});assert.equal(calls,0);
});
test('settings enable requests one position and disabling cancels without another request',async()=>{
 const nodes=new Map(),root={set innerHTML(v){for(const id of v.matchAll(/id="([^"]+)"/g))nodes.set('#'+id[1],{checked:false,disabled:false,hidden:false,textContent:''});},querySelector:key=>nodes.get(key)};
 let settings={},reads=0,cancels=0;const access={supported:()=>true,permission:async()=>reads?'granted':'prompt',cancel:()=>cancels++,authorize:async()=>{reads++;return {confirmed:true};}};
 await mountLocationSettings(root,{store:{getSettings:async()=>settings,saveSettings:async patch=>(settings={...settings,...patch})},access,t:k=>k});
 const checkbox=root.querySelector('#location-enabled');assert.equal(checkbox.checked,false);checkbox.checked=true;await checkbox.onchange();assert.equal(settings.locationEnabled,true);assert.equal(reads,1);assert.equal(root.querySelector('#location-permission').textContent,'location.granted');checkbox.checked=false;await checkbox.onchange();assert.equal(settings.locationEnabled,false);assert.equal(cancels,1);assert.equal(reads,1);
});
test('failed settings save restores the checkbox and reports storage failure after authorization',async()=>{
 const nodes=new Map(),root={set innerHTML(v){for(const id of v.matchAll(/id="([^"]+)"/g))nodes.set('#'+id[1],{checked:false,disabled:false,hidden:false,textContent:''});},querySelector:key=>nodes.get(key)};
 let storageReads=0,locationReads=0;const failure=new Error('database connection is closing'),errors=[];
 const store={getSettings:async()=>{if(++storageReads>1)throw failure;return {locationEnabled:false};},saveSettings:async()=>{throw failure;}};
 const access={supported:()=>true,permission:async()=>'prompt',cancel(){},authorize:async()=>{locationReads++;return {confirmed:true};}};
 await mountLocationSettings(root,{store,access,t:k=>k,onError:error=>errors.push(error)});
 const checkbox=root.querySelector('#location-enabled');checkbox.checked=true;await checkbox.onchange();
 assert.equal(checkbox.checked,false);assert.equal(checkbox.disabled,false);assert.equal(storageReads,2);assert.equal(locationReads,1);assert.ok(errors.every(error=>error===failure));assert.ok(errors.length>=1);
});

for(const code of ['LOCATION_DENIED','LOCATION_TIMEOUT','LOCATION_UNAVAILABLE'])test('settings permission request reports '+code+' and restores interaction',async()=>{
 const fields=new Map(),root={innerHTML:'',querySelector(key){if(!fields.has(key))fields.set(key,{});return fields.get(key);}};
 let settings={locationEnabled:false};const errors=[];
 const access={supported:()=>true,permission:async()=>code==='LOCATION_DENIED'?'denied':'unknown',cancel(){},authorize:async()=>{assert.equal(root.querySelector('#location-enabled').disabled,true);assert.equal(root.querySelector('#location-permission').textContent,'location.requesting');throw Object.assign(new Error(code),{code});}};
 await mountLocationSettings(root,{store:{getSettings:async()=>settings,saveSettings:async patch=>(settings={...settings,...patch})},access,t:k=>k,onError:e=>errors.push(e)});
 const input=root.querySelector('#location-enabled');input.checked=true;await input.onchange();
 assert.equal(input.disabled,false);assert.equal(input.checked,false);assert.equal(errors[0].code,code);
 assert.equal(root.querySelector('#location-denied-help').hidden,code!=='LOCATION_DENIED');
 assert.deepEqual(settings,{locationEnabled:false});
});
