import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createHistoryWindow} from '../../apps/web/core/history-window.js';
const app=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');
function fixture(existing){
 const calls=[],nodes=new Map();
 const $=selector=>{if(!nodes.has(selector))nodes.set(selector,{value:selector==='#message-input'?'Can you explain this?':selector==='#mode-select'?'chat':'provider',textContent:'',hidden:false});return nodes.get(selector);};
 const state={settings:{},current:existing?{id:'s',mode:'chat'}:null,drafts:new Map(),runGeneration:0,devicePanel:{ensureReady:async()=>false},store:{updateSession:async()=>{},getMessages:async()=>[],getSession:async()=>({id:'s',title:'S'})},harness:{run:async x=>calls.push(x)}};
 const sandbox={capture:{active:true},createHistoryWindow,state,$,getBrowserCompatibility:()=>({supportedForHarness:true}),selectedProvider:()=>({id:'provider'}),showDevices:async()=>calls.push('devices'),toast:()=>{},t:x=>x,setRunning:value=>{state.running=value;},AbortController,resizeInput(){},refreshSessions:async()=>{},renderMessages(){},renderRunControls(){},renderReasoningOptions(){},report:error=>{throw error;}};
 vm.runInNewContext(app.slice(app.indexOf('function historyWindow()'),app.indexOf('async function openSession(')),sandbox);
 vm.runInNewContext(app.slice(app.indexOf('async function sendMessage('),app.indexOf('function renderClipboard()')),sandbox);
 return {state,calls,send:()=>sandbox.sendMessage({preventDefault(){}})};
}
test('existing conversations can reach the model while the ESP32 bridge is absent',async()=>{
 const f=fixture(true);await f.send();assert.equal(f.calls.length,1);assert.equal(f.calls[0].sessionId,'s');assert.equal(f.calls[0].mode,'auto');assert.equal(f.state.running,false);assert.equal(f.state.submitting,false);
});
test('starting a new conversation without a bridge routes to connection before a model call',async()=>{
 const f=fixture(false);await f.send();assert.deepEqual(f.calls,['devices']);assert.equal(f.state.submitting,false);
});
test('the real app adapter distinguishes a missing bridge from a missing Bluetooth phone',()=>{
 let value={connected:false};
 const sandbox={state:{devicePanel:{getState:()=>value,getDevice:()=>null}}};
 vm.runInNewContext(app.slice(app.indexOf('function activeInputBridge()'),app.indexOf('const deviceAdapter=')),sandbox);
 assert.throws(()=>sandbox.requireInputBridge(),e=>e.code==='DEVICE_BRIDGE_UNAVAILABLE');
 value={connected:true,bluetoothConnected:false};assert.throws(()=>sandbox.requireInputBridge(),e=>e.code==='DEVICE_BLUETOOTH_UNAVAILABLE');
 value={connected:true,bluetoothConnected:true};assert.throws(()=>sandbox.requireInputBridge(),e=>e.code==='DEVICE_BINDING_UNVERIFIED');
});
