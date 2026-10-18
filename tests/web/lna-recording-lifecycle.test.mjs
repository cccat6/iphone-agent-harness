import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const source=(await readFile(new URL('../../apps/web/diagnostics/lna.js',import.meta.url),'utf8')).replace(/^import .*\n/,'');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function page({capture,backgroundResult,backgroundError,search=''}={}){
 const fields=new Map();const node=selector=>{if(!fields.has(selector))fields.set(selector,{value:selector==='#address'?'http://igent.local':'',dataset:{},children:[],listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},replaceChildren(){this.children=[];this.value='';},append(value){this.children.push(value);if(selector==='#background-target'&&!this.value)this.value=value.value;}});return fields.get(selector);};
 const tracks=[{stopped:0,addEventListener(){},stop(){this.stopped++;}}],stream={getTracks:()=>tracks};let recorder;const foregroundCalls=[];
 class Recorder{constructor(){recorder=this;this.state='inactive';}start(){this.state='recording';this.ondataavailable({data:{size:42}});}stop(){this.state='inactive';}}
 runInNewContext(source,{document:{querySelector:node,createElement:()=>({}),visibilityState:'hidden'},location:{origin:'https://igent.cc',search},isSecureContext:true,navigator:{userAgent:'fixture',mediaDevices:{getDisplayMedia:()=>capture||Promise.resolve(stream)},clipboard:{writeText:async()=>{}}},MediaRecorder:Recorder,AbortController,URLSearchParams,Date,setTimeout,clearTimeout,addEventListener(){},localProbeURL:v=>v,
 foregroundProbe:(base)=>{foregroundCalls.push(base);return Promise.resolve({baseUrl:base,tests:[{passed:true},{passed:true},{passed:true}],passed:true});},backgroundProbe:async(base,{onRow})=>{onRow({round:1,passed:!backgroundError});if(backgroundError)throw Error(backgroundError);return backgroundResult||{tests:[{round:1,passed:true}],passed:true,allRequestedInBackground:true};}});
 node('#run').onclick();const synchronousCalls=foregroundCalls.slice();await tick();assert.equal(node('#background').disabled,false);
 return {node,tracks,stream,synchronousCalls,recorder:()=>recorder};
}
test('diagnostic background completion stops all screen tracks and retains only chunk counts',async()=>{
 const f=await page();f.node('#background').onclick();await tick();assert.equal(f.tracks[0].stopped,1);assert.equal(f.recorder().state,'inactive');const report=JSON.parse(f.node('#result').textContent);assert.equal(report.background.passed,true);assert.equal(report.background.recordingCallbacks[0].bytes,42);assert.equal(report.background.recordingCallbacks[0].data,undefined);assert.equal(f.node('#stop').disabled,true);
});
test('background failure stops recording and restores controls',async()=>{
 const f=await page({backgroundError:'network lost'});f.node('#background').onclick();await tick();assert.equal(f.tracks[0].stopped,1);assert.equal(f.recorder().state,'inactive');assert.equal(JSON.parse(f.node('#result').textContent).background.passed,false);assert.equal(f.node('#run').disabled,false);
});
test('cancel while screen picker is pending stops a late granted capture before any recording',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r),f=await page({capture:pending});f.node('#background').onclick();f.node('#stop').onclick();resolve(f.stream);await tick();assert.equal(f.tracks[0].stopped,1);assert.equal(f.recorder(),undefined);assert.equal(JSON.parse(f.node('#result').textContent).background.passed,false);
});
test('editing bridge address invalidates earlier eligibility for background testing',async()=>{
 const f=await page();f.node('#address').listeners.input();assert.equal(f.node('#background').disabled,true);assert.equal(f.node('#background-target').disabled,true);
});

test('both ESP32 and Mac foreground probes start within the original button click',async()=>{
 const f=await page({search:'?fixture=http://192.168.0.107:18947'});assert.deepEqual(f.synchronousCalls,['http://igent.local','http://192.168.0.107:18947']);
});
