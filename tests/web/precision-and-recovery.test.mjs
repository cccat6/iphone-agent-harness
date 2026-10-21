import test from 'node:test';
import assert from 'node:assert/strict';
import {compileGesture,executePhonePlan,frameCoordinateReference,validatePlan} from '../../apps/web/core/plan.js';
const operations=['tap','drag','swipe','pointer_sequence','key','home','wait','capture','observe'];
const tap={id:'tap',op:'tap',point:{x:4000,y:6000},holdMs:80};
const makeContext=()=>({boardId:'board',bootId:'boot',targetId:'phone',clientId:'client',leaseId:'lease',orientationEpoch:1,mode:'auto',identityVerified:true,bindingVerified:true,leaseVerified:true,executionEnabled:true,inputState:'released',knownFrames:new Map([['frame',{targetId:'phone',orientationEpoch:1,coordinateSpace:'full-display',width:1170,height:2532}]]),capabilities:{operations,reportIntervalMs:40,pointerSettleMs:20}});
const makePlan=steps=>({version:1,planId:'plan',sessionId:'session',boardId:'board',targetId:'phone',basedOnFrameId:'frame',orientationEpoch:1,ttlMs:15000,maxExecutionMs:15000,steps});
function deviceFor(status,extra={}){const calls=[];return {calls,async submitSegment(s){calls.push(s);return {boardId:s.boardId,bootId:s.bootId,targetId:s.targetId,segmentId:s.segmentId,payloadHash:s.payloadHash,status,releaseSubmitted:true,...extra};},async getResult(){throw Error('not expected');},async release(q){return {...q,status:'released',leaseInvalidated:true,releaseSubmitted:true};}};}

test('first press leaves a released positioning interval before button-down',()=>{
 const context=makeContext();
 for(const step of [tap,{id:'drag',op:'drag',path:[{x:800,y:900,tMs:0},{x:8000,y:9000,tMs:300}],endHoldMs:120},{id:'sequence',op:'pointer_sequence',events:[{phase:'down',x:1,y:2,atMs:0},{phase:'move',x:4,y:5,atMs:80},{phase:'up',x:4,y:5,atMs:120}]}]){
  const reports=compileGesture(step,context).events;
 assert.equal(reports[0].buttons,0);assert.equal(reports[1].buttons,1);assert.equal(reports[1].atMs-reports[0].atMs,100);
  assert.equal(reports[0].x,reports[1].x);assert.equal(reports[0].y,reports[1].y);
 }
 assert.equal(compileGesture(tap,{capabilities:{pointerSettleMs:80,reportIntervalMs:40}}).events[1].atMs,80);
});

test('a moving release has no endpoint pause while a precise drag keeps its explicit hold',()=>{
 const motion={id:'swipe',op:'swipe',path:[{x:5000,y:8000,tMs:0},{x:5000,y:4500,tMs:160},{x:5000,y:2000,tMs:300}]};
 const swipe=compileGesture(motion,makeContext()).events,drag=compileGesture({...motion,op:'drag',endHoldMs:120},makeContext()).events;
 assert.equal(swipe.at(-1).atMs,swipe.at(-2).atMs);assert.equal(swipe.at(-1).buttons,0);assert.notEqual(swipe.at(-3).y,swipe.at(-2).y);
 assert.equal(drag.at(-1).atMs-drag.at(-2).atMs,120);
 assert.deepEqual(swipe.at(-1),{atMs:400,kind:'pointer',buttons:0,x:5000,y:2000});
});

test('full-display coordinate references are independent of viewport, thumbnail and aspect ratio',()=>{
 for(const [width,height] of [[1170,2532],[2532,1170],[2048,2732],[2732,2048]]){
  const reference=frameCoordinateReference({width,height,viewportWidth:390,viewportHeight:240,coordinateSpace:'full-display'});
  assert.equal(reference.width,width);assert.equal(reference.height,height);assert.deepEqual(reference.range,[0,10000]);
  // A point on the whole image stays at the same HID coordinate after uniform
  // thumbnail scaling. No DOM safe-area or browser-toolbar size participates.
  for(const scale of [1,.2,2]){
   const px=width*.37*scale,py=height*.61*scale;
   const compiled=compileGesture({...tap,point:{x:Math.round(px/(width*scale)*10000),y:Math.round(py/(height*scale)*10000)}},makeContext());
   assert.equal(compiled.events[0].x,3700);assert.equal(compiled.events[0].y,6100);
  }
 }
 assert.throws(()=>frameCoordinateReference({width:100,height:100,coordinateSpace:'cropped'}),/complete display/);
 const c=makeContext();c.knownFrames.get('frame').coordinateSpace='cropped';assert.equal(validatePlan(makePlan([tap]),c).valid,false);
});

test('known released device timing failure exposes exact receipts and permits observation, not replay',async()=>{
 const d=deviceFor('timing_miss',{submitted:2,maxLatenessMs:121});
 const result=await executePhonePlan(makePlan([tap,{...tap,id:'dependent'}]),{device:d,context:makeContext()});
 assert.equal(d.calls.length,1);assert.equal(result.status,'failed');assert.equal(result.steps[1].status,'skipped');
 assert.deepEqual(result.deviceFailure,{status:'timing_miss',releaseSubmitted:true,submitted:2,maxLatenessMs:121});
 assert.deepEqual(result.recovery,{action:'observe_then_replan',automatic:true,reasonCode:'DEVICE_TIMING_MISS'});
});

test('uncertain delivery remains reconciliation-required after a successful cleanup release',async()=>{
 const d=deviceFor('unknown');const result=await executePhonePlan(makePlan([tap]),{device:d,context:makeContext()});
 assert.equal(result.inputState,'released');assert.equal(result.status,'unknown');assert.equal(result.recovery.action,'reconcile_before_replan');assert.equal(result.recovery.automatic,false);assert.equal(d.calls.length,1);
});

test('explicit user cancellation never requests automatic recovery',async()=>{
 const controller=new AbortController();controller.abort();const d=deviceFor('hid_submitted');const result=await executePhonePlan(makePlan([tap]),{device:d,context:makeContext(),signal:controller.signal});
 assert.equal(d.calls.length,0);assert.equal(result.recovery.action,'none');assert.equal(result.recovery.automatic,false);
});
