import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocationAccess} from '../../apps/web/core/location.js';
import {mountLocationSettings} from '../../apps/web/ui/location-settings.js';

const position={coords:{latitude:12.345,longitude:67.89,accuracy:40},timestamp:1700000000000};
const flush=async()=>{for(let n=0;n<12;n++)await Promise.resolve();};
function fixture({settings={},permissions}={}){
 let current={...settings},queries=0,reads=0;const callbacks=[];
 const navigator={geolocation:{getCurrentPosition(success,error,options){reads++;callbacks.push({success,error,options});}},...(permissions?{permissions:{query:async value=>{queries++;return permissions(value);}}}:{})};
 const access=createLocationAccess({getSettings:async()=>current,navigator});
 return {access,navigator,callbacks,set:value=>current=value,get:()=>current,reads:()=>reads,queries:()=>queries};
}

test('opening settings only checks permission; enabling requests a fix immediately and discards it',async()=>{
 const f=fixture({permissions:async()=>({state:'prompt'})}),fields=new Map(),field=key=>{if(!fields.has(key))fields.set(key,{});return fields.get(key);},root={innerHTML:'',querySelector:field};
 const store={getSettings:async()=>f.get(),saveSettings:async patch=>{f.set({...f.get(),...patch});return f.get();}};
 await mountLocationSettings(root,{store,access:f.access,t:key=>key});assert.equal(field('#location-enabled').checked,false);assert.equal(f.reads(),0);assert.equal(f.queries(),1);
 field('#location-enabled').checked=true;const enabling=field('#location-enabled').onchange();await flush();assert.equal(f.reads(),1);f.callbacks[0].success(position);await enabling;assert.deepEqual(f.get(),{locationEnabled:true});assert.equal(field('#location-permission').textContent,'location.granted');
 field('#location-enabled').checked=false;await field('#location-enabled').onchange();assert.equal(f.reads(),1);assert.equal(f.get().locationEnabled,false);
});

test('missing opt-in never reads position even with browser permission granted',async()=>{
 const f=fixture({permissions:async()=>({state:'granted'})});assert.equal(await f.access.permission(),'granted');assert.equal(await f.access.isEnabled(),false);await assert.rejects(f.access.read(),error=>error.code==='LOCATION_DISABLED');assert.equal(f.reads(),0);
});

test('Safari absent or throwing Permissions.query does not block an enabled explicit read',async()=>{
 for(const permissions of [undefined,async()=>{throw new TypeError('Unsupported permission name');}]){
  const f=fixture({settings:{locationEnabled:true},permissions});assert.equal(await f.access.permission(),'unknown');assert.equal(await f.access.isEnabled(),true);assert.equal(f.reads(),0);
  const result=f.access.read();await flush();assert.equal(f.reads(),1);assert.deepEqual(f.callbacks[0].options,{enableHighAccuracy:false,maximumAge:0,timeout:15000});f.callbacks[0].success(position);const value=await result;assert.equal(value.latitude,position.coords.latitude);assert.equal(value.coordinateSystem,'WGS84');
 }
});

test('cancel then re-enable rejects old position callbacks while a new read can succeed',async()=>{
 const f=fixture({settings:{locationEnabled:true}}),first=f.access.read(),rejected=assert.rejects(first,error=>error.code==='LOCATION_DISABLED');await flush();
 f.set({locationEnabled:false});f.access.cancel();await rejected;f.set({locationEnabled:true});const second=f.access.read();await flush();assert.equal(f.reads(),2);
 f.callbacks[0].success({...position,coords:{...position.coords,latitude:88}});f.callbacks[1].success(position);assert.equal((await second).latitude,position.coords.latitude);
});

test('closing opt-in during final settings recheck suppresses the successful browser result',async()=>{
 let settings={locationEnabled:true},resolveFinal,readSettings=0;const callbacks=[];
 const access=createLocationAccess({getSettings:()=>++readSettings===1?settings:new Promise(resolve=>{resolveFinal=resolve;}),navigator:{geolocation:{getCurrentPosition(success){callbacks.push(success);}}}});
 const pending=access.read(),rejected=assert.rejects(pending,error=>error.code==='LOCATION_DISABLED');await flush();callbacks[0](position);await flush();assert.equal(typeof resolveFinal,'function');
 settings={locationEnabled:false};access.cancel();resolveFinal(settings);await rejected;await flush();
});

test('caller abort drops late coordinates without changing them into a location tool result',async()=>{
 const f=fixture({settings:{locationEnabled:true}}),controller=new AbortController(),pending=f.access.read({signal:controller.signal}),rejected=assert.rejects(pending,error=>error.name==='AbortError');await flush();controller.abort();f.callbacks[0].success(position);await rejected;
});

test('a final opt-in read catches changes made outside this settings panel',async()=>{
 const f=fixture({settings:{locationEnabled:true}}),pending=f.access.read(),rejected=assert.rejects(pending,error=>error.code==='LOCATION_DISABLED');await flush();f.set({locationEnabled:false});f.callbacks[0].success(position);await rejected;
});
