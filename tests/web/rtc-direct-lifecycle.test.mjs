import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const source=(await readFile(new URL('../../apps/web/diagnostics/rtc-direct.js',import.meta.url),'utf8')).replace(/^import .*\n/gm,'');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function page({capture,echoFailure=false,failFirstOpen=false,routeVerified=true,routeError=''}={}){
 const nodes=new Map(),peers=[],events=[];let recorder,captureActive=false,opens=0;
 const node=key=>{if(!nodes.has(key))nodes.set(key,{dataset:{},textContent:'',disabled:false});return nodes.get(key);};
 const tracks=[{stopped:0,addEventListener(){},stop(){this.stopped++;captureActive=false;}}],stream={getTracks:()=>tracks};
 class Recorder{constructor(){recorder=this;this.state='inactive';}start(){this.state='recording';captureActive=true;this.ondataavailable({data:{size:17}});}stop(){this.state='inactive';}}
 class Probe{constructor(config,{onState}){this.onState=onState;this.ready=false;peers.push(this);}async open(){events.push({captureAtOpen:captureActive});if(failFirstOpen&&opens++===0)throw Error('bare blocked');this.ready=true;}async echo(){if(echoFailure)throw Error('echo failed');return {nonceMatched:true,phoneInputSent:false};}async route(){if(routeError)throw Error(routeError);return {verified:routeVerified,remote:{address:'192.168.0.107',port:18948,protocol:'udp'}};}close(){this.ready=false;this.closed=true;this.onState({ice:'closed',dtls:'closed',channel:'closed',closed:true});}}
 const config={version:1,ip:'192.168.0.107',port:18948,fingerprint:'ab'.repeat(32)};
 runInNewContext(source,{document:{querySelector:node,visibilityState:'hidden'},location:{origin:'https://igent.cc',search:'',hash:'#config='+Buffer.from(JSON.stringify(config)).toString('base64url')},isSecureContext:true,navigator:{userAgent:'fixture',mediaDevices:{getDisplayMedia:()=>{events.push('capture');return capture||Promise.resolve(stream);}},clipboard:{writeText:async()=>{}}},RTCPeerConnection:class{},MediaRecorder:Recorder,DirectProbeConnection:Probe,validateDirectConfig:v=>v,abortableDelay:async(ms,signal)=>{if(signal.aborted)throw Error('stopped');},AbortController,URLSearchParams,atob,Date,setTimeout,clearTimeout,addEventListener(){}});
 await tick();return {node,peers,tracks,events,stream,recorder:()=>recorder};
}
test('capture-before-connect is available after bare failure and starts capture before open',async()=>{
 const f=await page({failFirstOpen:true});f.node('#connect').onclick();await tick();assert.equal(f.node('#capture-connect').disabled,false);f.node('#capture-connect').onclick();assert.equal(f.events.at(-1),'capture');await tick();assert.equal(f.events.filter(x=>typeof x==='object').at(-1).captureAtOpen,true);assert.equal(f.tracks[0].stopped,1);assert.equal(f.recorder().state,'inactive');assert.equal(f.peers.at(-1).closed,true);const report=JSON.parse(f.node('#result').textContent);assert.equal(report.runs.at(-1).background.length,5);assert.equal(report.runs.at(-1).captureAtConnect,true);assert.equal(report.runs.at(-1).recordingCallbacks[0].data,undefined);
});
test('failed echo stops capture and closes peer',async()=>{
 const f=await page({echoFailure:true});f.node('#capture-connect').onclick();await tick();assert.equal(f.tracks[0].stopped,1);assert.equal(f.recorder().state,'inactive');assert.equal(f.peers.at(-1).closed,true);assert.equal(JSON.parse(f.node('#result').textContent).runs.at(-1).backgroundPassed,false);
});
test('stop during screen picker cleans a late capture without starting connection',async()=>{
 let resolve;const capture=new Promise(r=>resolve=r),f=await page({capture});f.node('#capture-connect').onclick();f.node('#stop').onclick();resolve(f.stream);await tick();assert.equal(f.tracks[0].stopped,1);assert.equal(f.events.filter(x=>typeof x==='object').length,0);assert.equal(f.peers.at(-1).closed,true);
});
test('server closure after successful foreground test disables background and explains reconnect',async()=>{
 const f=await page();f.node('#connect').onclick();await tick();assert.equal(f.node('#background').disabled,false);f.peers.at(-1).close();assert.equal(f.node('#background').disabled,true);assert.match(f.node('#status').textContent,/重新连接/);
});

test('Safari missing route statistics does not negate successful echo or block background',async()=>{
 const f=await page({routeVerified:false});f.node('#connect').onclick();await tick();let run=JSON.parse(f.node('#result').textContent).runs.at(-1);assert.equal(run.foregroundPassed,true);assert.equal(run.routeVerified,false);assert.match(run.routeWarning,/统计/);assert.equal(f.node('#background').disabled,false);assert.match(f.node('#status').textContent,/回传成功.*统计/);
 f.node('#background').onclick();await tick();run=JSON.parse(f.node('#result').textContent).runs.at(-1);assert.equal(run.background.length,5);assert.equal(run.backgroundPassed,true);assert.equal(run.routeVerified,false);assert.equal(f.tracks[0].stopped,1);assert.equal(f.peers.at(-1).closed,true);
});
test('actual invalid route still fails after echoes and closes peer',async()=>{
 const f=await page({routeError:'发现中继候选，测试停止'});f.node('#connect').onclick();await tick();const run=JSON.parse(f.node('#result').textContent).runs.at(-1);assert.equal(run.foreground.length,3);assert.equal(run.foregroundPassed,false);assert.match(run.error,/中继/);assert.equal(f.peers.at(-1).closed,true);assert.equal(f.node('#background').disabled,true);
});
