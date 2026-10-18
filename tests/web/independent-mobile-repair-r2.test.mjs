import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const app=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');
const start=app.indexOf('function renderDeviceStatus()');
const end=app.indexOf('\nasync function refreshSessions',start);
function render(summary){
 const nodes=new Map(); const $=selector=>{if(!nodes.has(selector))nodes.set(selector,{textContent:'',classList:{toggle(){}},setAttribute(){}});return nodes.get(selector);};
 const context=vm.createContext({state:{deviceStatus:summary},$,t:key=>key});vm.runInContext(app.slice(start,end),context);context.renderDeviceStatus();return $('#home-device-status').textContent;
}
test('screen sharing does not conceal a lost LAN connection on home',()=>{assert.equal(render({connected:false,inputVerified:false,sharing:true,status:'disconnected'}),'device.state.offline');});
test('screen sharing does not conceal loss of Bluetooth input proof',()=>{assert.equal(render({connected:true,inputVerified:false,sharing:true,status:'needs-input-test'}),'device.state.test');});
test('verified live bridge with capture reports screen sharing',()=>{assert.equal(render({connected:true,inputVerified:true,sharing:true,status:'sharing'}),'device.state.sharing');});
