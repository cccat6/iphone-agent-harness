import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validatePlan,compileGesture,executePhonePlan,canonicalSegmentJson} from '../../apps/web/core/plan.js';
const operations=['tap','drag','swipe','pointer_sequence','key','home','wait','capture','observe'];
function context(overrides={}){return {boardId:'board',bootId:'boot',targetId:'phone-a',clientId:'client-a',leaseId:'lease-a',orientationEpoch:1,mode:'task',identityVerified:true,bindingVerified:true,leaseVerified:true,executionEnabled:true,inputState:'released',knownFrames:new Map([['frame-before',{targetId:'phone-a',orientationEpoch:1}]]),capabilities:{operations},pollIntervalMs:0,...overrides};}
function plan(steps,overrides={}){return {version:1,planId:'plan-test',sessionId:'session-test',boardId:'board',targetId:'phone-a',basedOnFrameId:'frame-before',orientationEpoch:1,ttlMs:15000,maxExecutionMs:15000,steps,...overrides};}
const tap=(id='tap')=>({id,op:'tap',point:{x:4000,y:6000},holdMs:80});
const swipe=(id='swipe')=>({id,op:'swipe',path:[{x:5000,y:8000,tMs:0},{x:5000,y:3000,tMs:120},{x:5000,y:1000,tMs:200}]});
const shot=(id='capture',extra={})=>({id,op:'capture',frames:{count:1,intervalMs:0,timeoutMs:1000},review:false,label:id,...extra});
const receipt=(s,extra={})=>({boardId:s.boardId,bootId:s.bootId,targetId:s.targetId,segmentId:s.segmentId,payloadHash:s.payloadHash,status:'hid_submitted',releaseSubmitted:true,...extra});
function adapters({submit,getResult,grab,save,release,log=[]}={}){
 const segments=[],queries=[],releases=[];let frameNumber=0;
 const device={
  async submitSegment(s,options){segments.push(s);log.push(`submit:${s.segmentIndex}`);return submit?submit(s,options):receipt(s);},
  async getResult(q,options){queries.push(q);return getResult?getResult(q,options):receipt(segments.at(-1));},
  async release(q,options){releases.push(q);log.push('release');return release?release(q,options):{boardId:q.boardId,bootId:q.bootId,targetId:q.targetId,status:'released',leaseInvalidated:true};},
 };
 const capture={
  async grab(q){log.push('grab');const at=performance.now();return grab?grab(q):{frameId:`frame-${++frameNumber}`,targetId:q.targetId,orientationEpoch:q.orientationEpoch,requestedAtMs:at,readyAtMs:at+1,mediaTimeMs:null,width:1170,height:2532,blob:new Blob(['frame'])};},
  async save(frame,meta){log.push('save');return save?save(frame,meta):{assetRef:`local-asset:${frame.frameId}`};},
 };
 return {device,capture,segments,queries,releases,log};
}
const tick=()=>new Promise(r=>setImmediate(r));
async function until(fn){for(let i=0;i<100&&!fn();i++)await new Promise(r=>setTimeout(r,1));assert.ok(fn(),'condition did not occur');}

test('preflight validates the whole batch before submitting its valid first action',async()=>{
 const a=adapters();const input=plan([tap('first'),{...tap('bad'),point:{x:10001,y:5}}]);
 assert.equal(validatePlan(input,context()).valid,false);
 await assert.rejects(executePhonePlan(input,{...a,context:context()}),/coordinate/);assert.equal(a.segments.length,0);assert.equal(a.releases.length,0);
});

test('model fields cannot verify identity, enable execution, or choose a different target',async()=>{
 for(const input of [plan([tap()],{targetId:'phone-b'}),plan([tap()],{verified:true}),plan([tap()],{orientationEpoch:2}),plan([tap()],{basedOnFrameId:'unknown'})])assert.equal(validatePlan(input,context()).valid,false);
 for(const key of ['identityVerified','bindingVerified','leaseVerified','executionEnabled'])assert.equal(validatePlan(plan([tap()]),context({[key]:false})).valid,false);
 assert.equal(validatePlan(plan([tap()]),context({mode:'plan'})).valid,false);
 assert.equal(validatePlan(plan([shot()]),context({mode:'plan',executionEnabled:false})).valid,true);
 assert.equal(validatePlan(plan([shot()]),context({mode:'chat'})).valid,false);
});

test('all schema fields, path times, capabilities and aggregate budgets are checked',()=>{
 const bad=[
  plan([tap()],{version:2}),plan([tap()],{ttlMs:999}),plan([tap()],{maxExecutionMs:99}),
  plan([tap('same'),tap('same')]),plan([{...tap(),point:{x:1.5,y:2}}]),
  plan([{...swipe(),path:[{x:1,y:1,tMs:0},{x:2,y:2,tMs:0}]}]),
  plan([{...swipe(),path:[{x:1,y:1,tMs:10},{x:2,y:2,tMs:30}]}]),
  plan([{...swipe(),path:[{x:1,y:1,tMs:0},{x:1,y:1,tMs:30}]}]),
  plan([shot('a'),tap()],{maxExecutionMs:100}),
  plan([shot('review',{review:true}),tap()]),
  plan([shot('many',{frames:{count:8,intervalMs:1,timeoutMs:100}}),shot('b',{frames:{count:8,intervalMs:1,timeoutMs:100}}),shot('c',{frames:{count:8,intervalMs:1,timeoutMs:100}}),shot('d')]),
  plan([shot('window',{frames:{count:8,intervalMs:100,timeoutMs:100}})]),
  plan([tap('first'),{...shot(),label:'x'.repeat(121)}]),
 ];
 for(const value of bad)assert.equal(validatePlan(value,context()).valid,false,JSON.stringify(value));
 assert.equal(validatePlan(plan([tap()]),context({capabilities:{operations:[]}})).valid,false);
 assert.equal(validatePlan(plan([tap()]),context({capabilities:{operations,maxEvents:0}})).valid,false);
});

test('swipe releases at its last moving timestamp; drag explicitly holds at end',()=>{
 const s=compileGesture(swipe());const up=s.events.at(-1),move=s.events.at(-2);
 assert.equal(up.buttons,0);assert.equal(move.buttons,1);assert.equal(up.atMs,move.atMs);assert.equal(up.x,move.x);assert.equal(up.y,move.y);
 const d=compileGesture({...swipe(),op:'drag',endHoldMs:200});assert.equal(d.events.at(-1).atMs-d.events.at(-2).atMs,200);
 assert.ok(s.events.length<=512&&s.durationMs<=5000);
 const long={...swipe(),op:'drag',path:[{x:1,y:1,tMs:0},{x:2,y:2,tMs:3000}],endHoldMs:1};assert.throws(()=>compileGesture(long),/held duration/);
});

test('pointer sequences require complete one-pointer state, and key/home compile released',()=>{
 const complete={id:'pointer',op:'pointer_sequence',events:[{phase:'down',x:1,y:2,atMs:0},{phase:'move',x:5,y:6,atMs:40},{phase:'up',x:5,y:6,atMs:40}]};
 assert.equal(compileGesture(complete).events.at(-1).buttons,0);
 for(const events of [complete.events.slice(0,2),[{...complete.events[0],phase:'move'},complete.events[2]],[complete.events[0],complete.events[0],complete.events[2]]])assert.throws(()=>compileGesture({...complete,events}));
 const k=compileGesture({id:'key',op:'key',usage:44,modifiers:1,holdMs:40});assert.deepEqual(k.events.at(-1).usages,[]);assert.equal(k.events.at(-1).modifiers,0);
 const h=compileGesture({id:'home',op:'home'});assert.equal(h.events[0].usage,64);assert.equal(h.events.at(-1).usage,0);
});

test('wire canonical SHA-256 is independent of key order and excludes payloadHash',async()=>{
 const a=adapters();const result=await executePhonePlan(plan([tap()]),{...a,context:context()});assert.equal(result.status,'completed');
 const wire=a.segments[0],canonical=canonicalSegmentJson(wire);assert.equal(wire.payloadHash,createHash('sha256').update(canonical).digest('hex'));
 assert.equal(canonical.includes('payloadHash'),false);
 assert.equal(canonicalSegmentJson({b:2,a:{y:4,x:3},payloadHash:'ignored'}),'{"a":{"x":3,"y":4},"b":2}');
 assert.throws(()=>canonicalSegmentJson({x:.5}),/integer/);
 assert.equal(wire.boardId,'board');assert.equal(wire.bootId,'boot');assert.equal(wire.targetId,'phone-a');assert.equal(wire.clientId,'client-a');assert.equal(wire.leaseId,'lease-a');
});

test('capture barriers run after submitted/released input and before the next gesture',async()=>{
 const a=adapters();const result=await executePhonePlan(plan([tap('a'),shot(),tap('b')]),{...a,context:context()});
 assert.deepEqual(a.log,['submit:0','grab','save','submit:2']);assert.equal(result.status,'completed');assert.equal(result.inputState,'released');assert.equal(result.frames.length,1);assert.equal(result.outcome,'not_evaluated');
 assert.equal(result.frames[0].mediaTimeMs,null);assert.ok(result.frames[0].readyAtMs>=result.frames[0].requestedAtMs);assert.match(result.frames[0].assetRef,/^local-asset:/);
});

test('review capture ends without another device or model operation',async()=>{
 const a=adapters();const result=await executePhonePlan(plan([tap(),shot('review',{review:true})]),{...a,context:context()});assert.equal(result.status,'completed');assert.equal(a.segments.length,1);assert.match(result.steps.at(-1).detail,/review/);
});

test('unknown receipt stops dependent actions and attempts only the expected target release',async()=>{
 const a=adapters({submit:s=>receipt(s,{status:'unknown'})});const result=await executePhonePlan(plan([tap('a'),shot(),tap('b')]),{...a,context:context()});
 assert.equal(result.status,'unknown');assert.equal(a.segments.length,1);assert.equal(result.frames.length,0);assert.deepEqual(result.steps.map(s=>s.status),['unknown','skipped','skipped']);assert.equal(a.releases[0].targetId,'phone-a');
});

test('wrong-target or unconfirmed-release receipts cannot authorize the next step',async()=>{
 for(const extra of [{targetId:'phone-b'},{bootId:'reboot'},{payloadHash:'0'.repeat(64)},{releaseSubmitted:false}]){
  const a=adapters({submit:s=>receipt(s,extra)});const result=await executePhonePlan(plan([tap('a'),tap('b')]),{...a,context:context()});assert.equal(result.status,'unknown');assert.equal(a.segments.length,1);assert.equal(a.releases.length,1);
 }
});

test('submission network failure queries the same segment ID and never blindly resends',async()=>{
 const a=adapters({submit:()=>{throw new Error('network timeout');}});const result=await executePhonePlan(plan([tap()]),{...a,context:context()});
 assert.equal(result.status,'completed');assert.equal(a.segments.length,1);assert.equal(a.queries.length,1);assert.equal(a.queries[0].segmentId,a.segments[0].segmentId);
 const b=adapters({submit:()=>{throw new Error('lost');},getResult:()=>{throw new Error('unreachable');}});const failed=await executePhonePlan(plan([tap('a'),tap('b')]),{...b,context:context()});assert.equal(failed.status,'unknown');assert.equal(b.segments.length,1);
});

test('cancel ignores a late successful receipt and does not start subsequent input',async()=>{
 const abort=new AbortController();let late;
 const a=adapters({submit:s=>new Promise(resolve=>{late=()=>resolve(receipt(s));})});
 const run=executePhonePlan(plan([tap('a'),tap('b')]),{...a,context:context(),signal:abort.signal});await until(()=>a.segments.length===1);abort.abort();
 const result=await run;assert.equal(result.status,'cancelled');assert.equal(a.releases.length,1);late();await tick();assert.equal(a.segments.length,1);assert.equal(result.steps.at(-1).status,'skipped');
});

test('orientation changes across an asynchronous receipt stop the plan',async()=>{
 const c=context();let late;const a=adapters({submit:s=>new Promise(resolve=>{late=()=>resolve(receipt(s));})});
 const run=executePhonePlan(plan([tap('a'),tap('b')]),{...a,context:c});await until(()=>a.segments.length===1);c.orientationEpoch=2;late();const result=await run;assert.equal(result.status,'unknown');assert.equal(a.segments.length,1);assert.equal(a.releases.length,1);
});

test('failed capture blocks later gestures; persisted partial observations are reported',async()=>{
 let number=0;const a=adapters({grab:q=>{number++;if(number===2)throw new Error('capture failed');return {frameId:'good',targetId:q.targetId,orientationEpoch:q.orientationEpoch,requestedAtMs:2,readyAtMs:3,mediaTimeMs:null,width:10,height:20};}});
 const result=await executePhonePlan(plan([tap('a'),shot('frames',{frames:{count:2,intervalMs:1,timeoutMs:1000}}),tap('b')]),{...a,context:context()});
 assert.equal(result.status,'failed');assert.equal(a.segments.length,1);assert.equal(result.frames.length,1);assert.equal(result.frames[0].frameId,'good');assert.equal(result.steps.at(-1).status,'skipped');assert.equal(a.releases.length,1);
});

test('captured frames need genuine metadata and local persistence, never fabricated refs',async()=>{
 const a=adapters({save:()=>undefined});const result=await executePhonePlan(plan([shot()]),{...a,context:context({mode:'plan',executionEnabled:false})});assert.equal(result.status,'failed');assert.equal(result.frames.length,0);assert.equal(a.segments.length,0);
 const b=adapters({grab:q=>({frameId:'wrong',targetId:'phone-b',orientationEpoch:q.orientationEpoch,requestedAtMs:1,readyAtMs:2,mediaTimeMs:null,width:10,height:10,assetRef:'local-asset:wrong'})});const mismatch=await executePhonePlan(plan([shot()]),{...b,context:context()});assert.equal(mismatch.status,'failed');assert.equal(mismatch.frames.length,0);
});

test('during-motion observation starts sampling without blocking gesture release',async()=>{
 let finishFrame;const a=adapters({grab:q=>new Promise(resolve=>{finishFrame=()=>resolve({frameId:'during',targetId:q.targetId,orientationEpoch:q.orientationEpoch,requestedAtMs:10,readyAtMs:300,mediaTimeMs:null,width:10,height:20});})});
 const motion={id:'watch',op:'observe',motion:swipe('motion'),frames:{count:1,intervalMs:0,timeoutMs:1000},label:'during'};
 const run=executePhonePlan(plan([motion]),{...a,context:context()});await until(()=>a.segments.length===1);
 assert.equal(a.log[0],'grab');const reports=a.segments[0].events;assert.equal(reports.at(-1).buttons,0);assert.equal(reports.at(-1).atMs,reports.at(-2).atMs);
 assert.equal(a.log.includes('save'),false);finishFrame();const result=await run;assert.equal(result.status,'completed');assert.equal(result.frames[0].requestedAtMs,10);assert.equal(result.frames[0].readyAtMs,300);
});

test('missing or failed release leaves input state unknown rather than claiming cleanup',async()=>{
 const a=adapters({submit:s=>receipt(s,{status:'transport_failed',releaseSubmitted:false}),release:()=>{throw new Error('offline');}});const result=await executePhonePlan(plan([tap()]),{...a,context:context()});assert.equal(result.status,'failed');assert.equal(result.inputState,'unknown');
});

test('expired plans and missing injected device adapters do no physical work',async()=>{
 const a=adapters();await assert.rejects(executePhonePlan(plan([tap()]),{...a,context:context({now:()=>20000,planReceivedAtMs:0})}),error=>error.code==='PLAN_DEADLINE_EXCEEDED');
 await assert.rejects(executePhonePlan(plan([tap()]),{capture:a.capture,context:context()}),/adapter/);assert.equal(a.segments.length,0);assert.equal(a.releases.length,0);
});


test('a release without a pending-input fence cannot resolve uncertain input',async()=>{
 const a=adapters({submit:s=>receipt(s,{status:'unknown'}),release:q=>({boardId:q.boardId,bootId:q.bootId,targetId:q.targetId,status:'released'})});
 const result=await executePhonePlan(plan([tap()]),{...a,context:context()});assert.equal(result.inputState,'unknown');assert.equal(a.releases[0].cancelPending,true);assert.equal(a.releases[0].invalidateLease,true);
});

test('a stalled result query is bounded and cannot unblock further actions later',async()=>{
 let resolveLate;const a=adapters({submit:s=>receipt(s,{status:'accepted',releaseSubmitted:false}),getResult:()=>new Promise(resolve=>{resolveLate=resolve;})});
 const result=await executePhonePlan(plan([tap('a'),tap('b')]),{...a,context:context({resultTimeoutMs:100})});assert.equal(result.status,'unknown');assert.equal(a.segments.length,1);resolveLate(receipt(a.segments[0]));await tick();assert.equal(a.segments.length,1);
});

test('trusted session identity, future receive times and revoked operation permissions fail closed',async()=>{
 assert.equal(validatePlan(plan([tap()]),context({sessionId:'different'})).valid,false);
 const a=adapters();await assert.rejects(executePhonePlan(plan([tap()]),{...a,context:context({now:()=>100,planReceivedAtMs:101})}),/clock/);
 const c=context();let count=0;const b=adapters({submit:s=>{count++;if(count===1)c.capabilities={operations:['capture']};return receipt(s);}});
 const result=await executePhonePlan(plan([tap('a'),tap('b')]),{...b,context:c});assert.equal(result.status,'failed');assert.equal(b.segments.length,1);
});


test('pointer sequence rejects extra contacts, coordinate-changing release and zero-time moves',()=>{
 const e=(phase,x,y,atMs)=>({phase,x,y,atMs});
 const inputs=[
  [e('down',1,2,0),e('up',1,2,10),e('down',1,2,20),e('up',1,2,30)],
  [e('down',1,2,0),e('move',3,4,10),e('up',8,9,20)],
  [e('down',1,2,0),e('move',3,4,0),e('up',3,4,10)],
  [e('down',1,2,0),e('up',1,2,0)],
 ];
 for(const events of inputs)assert.throws(()=>compileGesture({id:'pointer',op:'pointer_sequence',events}));
 assert.doesNotThrow(()=>compileGesture({id:'pointer',op:'pointer_sequence',events:[e('down',1,2,0),e('up',1,2,10)]}));
 assert.equal(validatePlan(plan([shot('zero',{frames:{count:2,intervalMs:0,timeoutMs:100}})]),context()).valid,false);
});

test('a stalled capture still respects an explicit small timeout and skips later input',async()=>{
 let late;const a=adapters({grab:q=>new Promise(resolve=>{late=()=>resolve({frameId:'late',targetId:q.targetId,orientationEpoch:q.orientationEpoch,requestedAtMs:1,readyAtMs:2,mediaTimeMs:null,width:10,height:10});})});const result=await executePhonePlan(plan([shot('timeout',{frames:{count:1,intervalMs:0,timeoutMs:100}}),tap('never')]),{...a,context:context()});assert.equal(result.status,'failed');assert.equal(result.frames.length,0);assert.equal(a.segments.length,0);assert.equal(result.steps.at(-1).status,'skipped');late();await tick();assert.equal(a.segments.length,0);
});
