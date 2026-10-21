import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const app=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');
const start=app.indexOf('function renderDeviceStatus()');
const end=app.indexOf('\nasync function refreshSessions',start);
function render(summary){
 const nodes=new Map(); const $=selector=>{if(!nodes.has(selector))nodes.set(selector,{textContent:'',classList:{toggle(){}},setAttribute(){}});return nodes.get(selector);};
 const context=vm.createContext({renderRunControls(){},state:{deviceStatus:summary},$,t:key=>key});vm.runInContext(app.slice(start,end),context);context.renderDeviceStatus();return $('#home-device-status').textContent;
}
test('screen sharing does not conceal a lost LAN connection on home',()=>{assert.equal(render({connected:false,inputVerified:false,sharing:true,status:'disconnected'}),'device.state.offline');});
test('screen sharing does not conceal a disconnected Bluetooth phone',()=>{assert.equal(render({connected:true,bluetoothConnected:false,ready:false,targetBound:false,inputVerified:false,sharing:true,status:'needs-target'}),'device.state.phone');});
test('an unassociated Bluetooth phone is not ready even while sharing',()=>{assert.equal(render({connected:true,bluetoothConnected:true,ready:false,targetBound:false,inputVerified:false,sharing:true,status:'needs-target'}),'device.state.target');});
test('a bound live bridge can share without the optional input test',()=>{assert.equal(render({connected:true,bluetoothConnected:true,ready:true,targetBound:true,inputVerified:false,sharing:true,status:'sharing'}),'device.state.sharing');});
test('losing only optional input proof keeps an associated phone ready',()=>{assert.equal(render({connected:true,bluetoothConnected:true,ready:true,targetBound:true,inputVerified:false,sharing:false,status:'ready'}),'device.state.ready');});
test('verified live bridge with capture reports screen sharing',()=>{assert.equal(render({connected:true,bluetoothConnected:true,ready:true,targetBound:true,inputVerified:true,sharing:true,status:'sharing'}),'device.state.sharing');});
