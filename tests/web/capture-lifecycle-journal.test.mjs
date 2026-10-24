import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('local capture lifecycle journal records reasons without frame data or credentials and never blocks UI',async()=>{
 const source=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8'),start=source.indexOf('function recordCaptureLifecycle('),end=source.indexOf('\nfunction onHarnessEvent',start),saved=[];
 const state={current:{id:'session'},store:{addEvent:async(id,event)=>saved.push({id,...event})}};
 const context=vm.createContext({state,capture:{diagnostics:()=>({trackState:'ended',recorderState:'inactive',visibility:'visible',lastStop:{reason:'track_ended'},rawFrame:'private screenshot',credential:'private key'})},performance:{timeOrigin:123},Date});vm.runInContext(source.slice(start,end),context);
 vm.runInContext("recordCaptureLifecycle({type:'stopped',reason:'track_ended'})",context);assert.equal(saved[0].id,'session');assert.equal(saved[0].type,'capture.lifecycle');assert.equal(saved[0].payload.reason,'track_ended');assert.equal(saved[0].payload.documentStartedAt,123);assert.equal(JSON.stringify(saved).includes('private'),false);
 state.store.addEvent=async()=>{throw Error('storage unavailable');};vm.runInContext("recordCaptureLifecycle({type:'recorder_recovering',attempt:1})",context);await Promise.resolve();state.current=null;const settings=[];state.store.saveSettings=async patch=>settings.push(patch);vm.runInContext("recordCaptureLifecycle({type:'started'})",context);assert.equal(saved.length,1);assert.equal(settings[0].captureLifecycle.event,'started');assert.equal(JSON.stringify(settings).includes('private'),false);
});
