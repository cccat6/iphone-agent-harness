import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const app=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');
const html=await readFile(new URL('../../apps/web/index.html',import.meta.url),'utf8');
const section=(start,end)=>{const a=app.indexOf(start),b=app.indexOf(end,a);assert.ok(a>=0&&b>a);return app.slice(a,b);};

test('conversation capture status is an actionable button and wired independently from resume',()=>{
  assert.match(html,/button id="mode-description"[^>]+type="button"/);
  assert.match(app,/\$\('#mode-description'\)\.onclick=guard\(startCaptureFromStatus\)/);
  assert.match(app,/const started=capture\.start\(\);/);
  assert.doesNotMatch(section('async function startCaptureFromStatus()', '\nfunction updateModeDescription'),/harness\.resume/);
});

test('capture status starts sharing in the trusted click path without resuming a paused run',async()=>{
  const calls=[];
  const state={running:false};
  const capture={active:false,needsRestart:false,start(){calls.push('start');this.active=true;return Promise.resolve();}};
  const context=vm.createContext({state,capture,updateModeDescription(){calls.push('update');},renderRunControls(){calls.push('controls');}});
  vm.runInContext(section('async function startCaptureFromStatus()', '\nfunction updateModeDescription'),context);
  assert.equal(await context.startCaptureFromStatus(),true);
  assert.deepEqual(calls,['start','update','controls']);
});

test('capture status does not restart an active stream or interrupt a running task',async()=>{
  const calls=[];
  const state={running:true};
  const capture={active:true,needsRestart:false,start(){calls.push('start');return Promise.resolve();}};
  const context=vm.createContext({state,capture,updateModeDescription(){calls.push('update');},renderRunControls(){calls.push('controls');}});
  vm.runInContext(section('async function startCaptureFromStatus()', '\nfunction updateModeDescription'),context);
  assert.equal(await context.startCaptureFromStatus(),false);
  assert.deepEqual(calls,[]);
  state.running=false;
  assert.equal(await context.startCaptureFromStatus(),false);
  assert.deepEqual(calls,[]);
});

test('resume and stop controls expose distinct labels',()=>{
  const controls=section('function renderRunControls()', '\nfunction setRunning(')+section('function setRunning(', '\nfunction onHarnessEvent');
  assert.match(controls,/button\.setAttribute\?\.\('aria-label',button\.textContent\)/);
  assert.match(controls,/stop\.textContent=t\('session\.stop'\)/);
});

test('bridge settings label identifies connection settings',async()=>{
  const device=await readFile(new URL('../../apps/web/locales/device.js',import.meta.url),'utf8');
  assert.match(device,/"manageBridge": "桥连接设置"/);
});
