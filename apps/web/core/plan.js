import {boundedCaptureStage,captureTimeout} from './capture.js';
import {assertBridgePresent} from './bridge-status.js';
// Host-side phone plans. Device and capture adapters must be supplied by trusted
// application code; model output can never enable execution or verify a target.
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const MUTATIONS = new Set(['tap','drag','swipe','pointer_sequence','key','home','observe']);
const MOTIONS = new Set(['drag','swipe','pointer_sequence']);
const OPS = new Set([...MUTATIONS,'wait','capture']);
const BASE_KEYS = ['boardId','bootId','targetId','clientId','leaseId','orientationEpoch'];
const PLAN_KEYS = ['version','planId','sessionId','boardId','targetId','basedOnFrameId','orientationEpoch','ttlMs','maxExecutionMs','steps'];
const FIELDS = {
  tap:['id','op','point','holdMs'],drag:['id','op','path','endHoldMs'],swipe:['id','op','path'],
  pointer_sequence:['id','op','events'],key:['id','op','usage','modifiers','holdMs'],home:['id','op'],
  wait:['id','op','durationMs'],capture:['id','op','frames','review','label'],observe:['id','op','motion','frames','label'],
};
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const integer = (v,min,max) => Number.isInteger(v) && v >= min && v <= max;
const finite = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const validId = v => typeof v === 'string' && ID.test(v);
function fail(message,code='invalid_plan') {const e=new Error(message);e.code=code;throw e;}
function shape(value,keys,label) {
  if(!plain(value))fail(`${label}: expected object`);
  for(const key of keys)if(!Object.hasOwn(value,key))fail(`${label}: missing ${key}`);
  for(const key of Object.keys(value))if(!keys.includes(key))fail(`${label}: unsupported ${key}`);
}
function point(value,label,timed=false) {
  shape(value,timed?['x','y','tMs']:['x','y'],label);
  if(!integer(value.x,0,10000)||!integer(value.y,0,10000)||(timed&&!integer(value.tMs,0,3000)))fail(`${label}: invalid coordinate/time`);
}
function frames(value,label) {
  shape(value,['count','intervalMs','timeoutMs'],label);
  if(!integer(value.count,1,8)||!integer(value.intervalMs,0,4000)||!integer(value.timeoutMs,100,10000))fail(`${label}: invalid observation limits`);
  if(value.count>1&&value.intervalMs===0)fail(`${label}: multiple frames need a positive interval`);
  if((value.count-1)*value.intervalMs>=value.timeoutMs)fail(`${label}: requested frame window exceeds timeout`);
}
function stepShape(step,ids=new Set()) {
  if(!plain(step)||!OPS.has(step.op))fail('Unknown phone operation');
  const optionalSettle=MUTATIONS.has(step.op)&&step.op!=='observe';
  const keys=FIELDS[step.op];shape(step,optionalSettle&&Object.hasOwn(step,'settleMs')?[...keys,'settleMs']:keys,step.op);
  if(Object.hasOwn(step,'settleMs')&&(!optionalSettle||!integer(step.settleMs,0,3000)))fail('Invalid post-action settleMs');
  if(!validId(step.id)||ids.has(step.id))fail(`${step.op}: missing or duplicate step ID`);
  ids.add(step.id);
  if(step.op==='tap'){point(step.point,'tap.point');if(!integer(step.holdMs,40,1200))fail('Invalid tap hold');}
  if(step.op==='drag'||step.op==='swipe'){
    if(!Array.isArray(step.path)||step.path.length<2||step.path.length>128)fail('Motion needs 2–128 path points');
    step.path.forEach((p,i)=>{point(p,'path point',true);if(i===0&&p.tMs!==0)fail('Path must start at tMs=0');if(i&&p.tMs<=step.path[i-1].tMs)fail('Path times must increase strictly');});
    if(step.op==='drag'&&!integer(step.endHoldMs,0,500))fail('Invalid endpoint hold');
    if(step.path.at(-1).tMs+(step.endHoldMs||0)>3000)fail('Gesture exceeds maximum held duration');
    if(step.op==='swipe'){const end=step.path.at(-1),before=step.path.at(-2);if(end.x===before.x&&end.y===before.y)fail('Swipe must release while moving');}
  }
  if(step.op==='pointer_sequence'){
    if(!Array.isArray(step.events)||step.events.length<2||step.events.length>130)fail('Invalid pointer sequence length');
    step.events.forEach((e,i)=>{
      shape(e,['phase','x','y','atMs'],'pointer event');
      if(!['down','move','up'].includes(e.phase)||!integer(e.x,0,10000)||!integer(e.y,0,10000)||!integer(e.atMs,0,3000))fail('Invalid pointer event');
      const previous=step.events[i-1],last=i===step.events.length-1;
      if(i===0){if(e.phase!=='down'||e.atMs!==0)fail('Pointer sequence must begin with down at 0');}
      else if(last){
        if(e.phase!=='up'||e.atMs<previous.atMs||e.atMs===0)fail('Pointer sequence needs one final up after positive duration');
        if(e.x!==previous.x||e.y!==previous.y)fail('Pointer up cannot change coordinates');
      }else if(e.phase!=='move'||e.atMs<=previous.atMs)fail('Pointer sequence permits only strictly timed moves between down and up');
    });
  }
  if(step.op==='key'&&(!integer(step.usage,4,231)||!integer(step.modifiers,0,255)||!integer(step.holdMs,40,1200)))fail('Invalid keyboard input');
  if(step.op==='wait'&&!integer(step.durationMs,0,2000))fail('Invalid wait');
  if(step.op==='capture'||step.op==='observe'){
    frames(step.frames,`${step.op}.frames`);
    if(typeof step.label!=='string'||step.label.length>120)fail('Invalid capture label');
    if(step.op==='capture'&&typeof step.review!=='boolean')fail('Invalid review flag');
    if(step.op==='observe'){if(!MOTIONS.has(step.motion?.op))fail('Observation requires a complete motion');stepShape(step.motion,ids);}
  }
}
function operationAllowed(op,context) {
  const ops=context.capabilities?.operations;
  if(!Array.isArray(ops)||!ops.includes(op))fail(`Operation not permitted by trusted capabilities: ${op}`);
}
function stateChecks(plan,context) {
  if(!plain(context))fail('Trusted execution context required');
  assertBridgePresent(context);
  for(const key of BASE_KEYS.slice(0,-1))if(!validId(context[key]))fail(`Trusted context missing ${key}`);
  if(!integer(context.orientationEpoch,0,2147483647))fail('Trusted orientation epoch required');
  if(context.sessionId!==undefined&&plan.sessionId!==context.sessionId)fail('Plan session differs from trusted context');
  if(plan.boardId!==context.boardId||plan.targetId!==context.targetId||plan.orientationEpoch!==context.orientationEpoch)fail('Plan target or orientation differs from trusted context');
  const known=context.knownFrames instanceof Map?context.knownFrames.get(plan.basedOnFrameId):context.knownFrames?.[plan.basedOnFrameId];
  if(!known||known.targetId!==plan.targetId||known.orientationEpoch!==plan.orientationEpoch)fail('Plan references an unknown or mismatched frame');
  if(known.coordinateSpace&&known.coordinateSpace!=='full-display')fail('Plan needs full-display coordinate mapping');
  if(context.inputState!=='released')fail('Input state must be known and released');
  if(!['plan','task','auto'].includes(context.mode))fail('Phone plans are unavailable in chat mode');
  const changing=plan.steps.some(s=>MUTATIONS.has(s.op));
  if(changing){
    if(!['task','auto'].includes(context.mode))fail('Plan mode cannot modify the phone');
    for(const key of ['identityVerified','bindingVerified','leaseVerified','executionEnabled'])if(context[key]!==true)fail(`Trusted ${key} is required`);
  }
}

const REQUEST_BYTES_DEFAULT=98304;
function requestByteLimit(caps={}){const value=caps.maxRequestBytes??REQUEST_BYTES_DEFAULT;if(!integer(value,1,REQUEST_BYTES_DEFAULT))fail('Invalid trusted device limit: maxRequestBytes');return value;}
function gestureEnvelope(plan,identity,index,{events,durationMs,gesture},segmentId='00000000-0000-4000-8000-000000000000'){
 return {protocolVersion:gesture?2:1,boardId:identity.boardId,bootId:identity.bootId,targetId:identity.targetId,clientId:identity.clientId,leaseId:identity.leaseId,segmentId,planId:plan.planId,segmentIndex:index,ttlMs:Math.min(15000,Math.max(100,durationMs+1000)),...(gesture?{gesture}:{events}),payloadHash:'0'.repeat(64)};
}
function checkRequestBytes(segment,caps){if(new TextEncoder().encode(JSON.stringify(segment)).length>requestByteLimit(caps))fail('Compiled segment exceeds device request byte limit; shorten or sparsify the motion.');}
function checkGestureLimits(events,durationMs,caps={}){
 const limit=(key,min,max,fallback)=>{if(caps[key]===undefined)return fallback;if(!integer(caps[key],min,max))fail(`Invalid trusted device limit: ${key}`);return caps[key];};
 const maxEvents=limit('maxEvents',1,512,512),maxDuration=limit('maxSegmentMs',1,5000,5000),maxHold=limit('maxHoldMs',1,3000,3000);
 if(events.length>maxEvents||durationMs>maxDuration)fail('Compiled segment exceeds device limits');
 let heldAt=null;for(const event of events){const held=event.kind==='pointer'?event.buttons:event.kind==='keyboard'?(event.modifiers||event.usages.length):event.usage;if(heldAt!==null&&event.atMs-heldAt>maxHold)fail('Compiled input exceeds held-state budget');if(held&&heldAt===null)heldAt=event.atMs;if(!held)heldAt=null;}
 if(heldAt!==null)fail('Compiled input must end released');
}

export function actionSettleMs(step){return step.settleMs??({tap:250,key:150,home:450,drag:350,swipe:700,pointer_sequence:350}[step.op]||0);}

/** Complete preflight. No adapter calls, timers, hashing or input is performed. */
export function validatePlan(plan,context) {
  const errors=[];let budgetMs=0,frameCount=0;
  try {
    shape(plan,PLAN_KEYS,'plan');
    if(plan.version!==1)fail('Unsupported phone plan version');
    for(const key of ['planId','sessionId','boardId','targetId','basedOnFrameId'])if(!validId(plan[key]))fail(`Invalid ${key}`);
    if(!integer(plan.orientationEpoch,0,2147483647)||!integer(plan.ttlMs,1000,30000)||!integer(plan.maxExecutionMs,100,15000))fail('Invalid plan timing/orientation');
    if(!Array.isArray(plan.steps)||plan.steps.length<1||plan.steps.length>30)fail('Plan needs 1–30 steps');
    stateChecks(plan,context);
    const ids=new Set();
    for(const [index,step] of plan.steps.entries()){
      stepShape(step,ids);operationAllowed(step.op,context);
      if(step.op==='capture'||step.op==='observe'){
        frameCount+=step.frames.count;
        if(step.op==='capture'&&step.review&&index!==plan.steps.length-1)fail('Review capture must end the plan');
      }
      if(step.op==='observe')operationAllowed(step.motion.op,context);
      if(MUTATIONS.has(step.op)){
        const compiled=compileGesture(step.op==='observe'?step.motion:step,context);
        checkRequestBytes(gestureEnvelope(plan,context,index,compiled),context.capabilities);
        budgetMs+=step.op==='observe'?Math.max(compiled.durationMs,step.frames.timeoutMs)+actionSettleMs(step.motion):compiled.durationMs+actionSettleMs(step);
      }else budgetMs+=step.op==='wait'?step.durationMs:step.frames.timeoutMs;
    }
    if(frameCount>24)fail('Plan exceeds 24 frames');
    if(budgetMs>plan.maxExecutionMs||budgetMs>plan.ttlMs)fail('Plan exceeds execution/TTL budget');
  }catch(e){errors.push(String(e.message));}
  return {valid:errors.length===0,errors,budgetMs,frameCount};
}

/** Compile a complete gesture to fixed HID reports; no device access. */
export function compileGesture(step,context={}) {
  stepShape(step);
  if(!MUTATIONS.has(step.op)||step.op==='observe')fail('Expected an input gesture');
  const caps=context.capabilities||{};
  const limit=(key,min,max,fallback)=>{if(caps[key]===undefined)return fallback;if(!integer(caps[key],min,max))fail(`Invalid trusted device limit: ${key}`);return caps[key];};
  const interval=limit('reportIntervalMs',8,100,20);
  // Position with the button released before pressing. A shorter advertised
  // settle than the report cadence can put position and down in one delivery
  // interval; respect both constraints without inventing a screen offset.
  const pointerSettle=limit('pointerSettleMs',0,100,20);
  // iOS AssistiveTouch can render the first absolute position after the
  // neutral report. Older bridges advertise only the report cadence (20ms),
  // which is too short for that first position to settle before button-down.
  // Use a conservative 100ms position dwell for that legacy capability; a
  // bridge may advertise a measured pointerPositionSettleMs explicitly.
  const positionSettle=caps.pointerPositionSettleMs===undefined
    ? (pointerSettle<=20?100:pointerSettle)
    : limit('pointerPositionSettleMs',0,500,100);
  const settle=Math.max(interval,pointerSettle,positionSettle);
  const pointer=(atMs,buttons,p)=>({atMs,kind:'pointer',buttons,x:p.x,y:p.y});
  let events=[];
  if(step.op==='tap')events=[pointer(0,0,step.point),pointer(settle,1,step.point),pointer(settle+step.holdMs,0,step.point)];
  if(step.op==='key')events=[{atMs:0,kind:'keyboard',modifiers:step.modifiers,usages:[step.usage]},{atMs:step.holdMs,kind:'keyboard',modifiers:0,usages:[]}];
  if(step.op==='home')events=[{atMs:0,kind:'consumer',usage:64},{atMs:100,kind:'consumer',usage:0}];
  if(step.op==='pointer_sequence')events=[pointer(0,0,step.events[0]),...step.events.map(e=>pointer(settle+e.atMs,e.phase==='up'?0:1,e))];
  if(step.op==='drag'||step.op==='swipe'){
    const path=step.path,end=path.at(-1).tMs,releaseGap=step.op==='swipe'?Math.min(interval,20):0;
    const holdLimit=limit('maxHoldMs',1,3000,3000),motionEnd=step.op==='swipe'?Math.min(end,holdLimit-releaseGap):end;
    if(motionEnd<1)fail('No room for a complete swipe and release');
    const times=new Set(path.map(p=>p.tMs));for(let t=interval;t<end;t+=interval)times.add(t);
    events=[pointer(0,0,path[0]),pointer(settle,1,path[0])];let at=0;
    for(const t of [...times].sort((a,b)=>a-b)){
      if(t===0)continue;
      while(at+1<path.length&&path[at+1].tMs<t)at++;
      const a=path[at],b=path[Math.min(at+1,path.length-1)],fraction=(t-a.tMs)/(b.tMs-a.tMs);
      const p={x:Math.round(a.x+(b.x-a.x)*fraction),y:Math.round(a.y+(b.y-a.y)*fraction)};
      events.push(pointer(settle+Math.round(t*motionEnd/end),1,p));
    }
    // iOS can ignore changed absolute coordinates in a button-up report.
    // Deliver the endpoint first, then lift shortly after it. A fling keeps
    // its final movement close to release; a drag has its explicit hold.
    events.push(pointer(settle+motionEnd+(step.endHoldMs||releaseGap),0,path.at(-1)));
  }
  const durationMs=events.at(-1).atMs;
  checkGestureLimits(events,durationMs,caps);
  let gesture;
  if(caps.segmentEncoding==='gesture-v2'){
    if(step.op==='home')gesture=['home'];
    else if(step.op==='tap')gesture=['tap',step.point.x,step.point.y,settle,step.holdMs];
    else if(step.op==='key')gesture=['key',step.modifiers,step.usage,step.holdMs];
    else if((step.op==='drag'||step.op==='swipe')&&step.path.length<=64){const hold=step.endHoldMs||(step.op==='swipe'?Math.min(interval,20):0);gesture=['path',settle,interval,durationMs-settle-hold,hold,step.path.map(p=>[p.x,p.y,p.tMs])];}
    else gesture=compactReports(events);
  }
  return {events,durationMs,...(gesture?{gesture}:{})};
}

function compactReports(events){return ['reports',events.map(e=>e.kind==='pointer'?[e.atMs,0,e.buttons,e.x,e.y]:e.kind==='keyboard'?[e.atMs,1,e.modifiers,e.usages]:[e.atMs,2,e.usage])];}

// Printable keys and explicitly continuous taps can share a device-scheduled
// segment. Observation barriers and taps requesting a host wait stay separate.
function compileInputRun(plan,index,context,identity){
 const continuousTaps=context.capabilities?.segmentEncoding==='gesture-v2'&&plan.steps[index]?.op==='tap';
 const eligible=step=>continuousTaps?step?.op==='tap'&&step.settleMs===0:step?.op==='key'&&[0,2,32,34].includes(step.modifiers)&&((step.usage>=4&&step.usage<=39)||step.usage===42||step.usage>=44&&step.usage<=56)&&actionSettleMs(step)>=(context.capabilities?.reportIntervalMs||20);
 if(!eligible(plan.steps[index]))return null;
 let events=[],offset=0,end=index,durationMs=0;
 for(let i=index;i<plan.steps.length&&eligible(plan.steps[i]);i++){
  const compiled=compileGesture(plan.steps[i],context),candidate=[...events,...compiled.events.map(event=>({...event,atMs:offset+event.atMs}))],duration=offset+compiled.durationMs;
  try{checkGestureLimits(candidate,duration,context.capabilities);checkRequestBytes(gestureEnvelope(plan,identity,index,{events:candidate,durationMs:duration,...(context.capabilities?.segmentEncoding==='gesture-v2'?{gesture:compactReports(candidate)}:{})}),context.capabilities);}catch(error){if(!events.length)throw error;break;}
  events=candidate;durationMs=duration;end=i;offset=duration+Math.max(actionSettleMs(plan.steps[i]),continuousTaps?(context.capabilities?.reportIntervalMs||20):0);
 }
 return end>index?{events,durationMs,end,...(context.capabilities?.segmentEncoding==='gesture-v2'?{gesture:compactReports(events)}:{})}:null;
}

/** Deterministic canonical wire JSON: recursive key sorting, integer numbers only. */
export function canonicalSegmentJson(value) {
  const encode=v=>{
    if(Array.isArray(v))return `[${v.map(encode).join(',')}]`;
    if(plain(v))return `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${encode(v[k])}`).join(',')}}`;
    if(typeof v==='number'&&!Number.isSafeInteger(v))fail('Canonical wire values must be safe integers');
    if(v===null||!['string','number','boolean'].includes(typeof v))fail('Unsupported canonical wire value');
    return JSON.stringify(v);
  };
  const {payloadHash,...body}=value;return encode(body);
}
async function hashSegment(segment) {
  if(!globalThis.crypto?.subtle)fail('SHA-256 unavailable');
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalSegmentJson(segment)));
  return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
const defaultNow=()=>performance.now();
function abortError(){const e=new Error('Phone plan cancelled by the caller');e.code='USER_CANCELLED';e.cancelReason='user_cancelled';return e;}
const abortReason=signal=>signal.reason instanceof Error?signal.reason:abortError();
function deadlineError(){return Object.assign(new Error('Phone plan execution deadline exceeded'),{code:'PLAN_DEADLINE_EXCEEDED'});}
function abortable(promise,signal) {
  if(signal.aborted){Promise.resolve(promise).catch(()=>{});return Promise.reject(abortReason(signal));}
  return new Promise((resolve,reject)=>{
    const abort=()=>{cleanup();reject(abortReason(signal));};
    const cleanup=()=>signal.removeEventListener('abort',abort);
    signal.addEventListener('abort',abort,{once:true});
    Promise.resolve(promise).then(v=>{cleanup();if(signal.aborted)reject(abortReason(signal));else resolve(v);},e=>{cleanup();reject(e);});
  });
}
function sleep(ms,signal) {
  if(signal.aborted)return Promise.reject(abortReason(signal));
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);};
    const abort=()=>{cleanup();reject(abortReason(signal));};
    const timer=setTimeout(()=>{cleanup();resolve();},Math.max(0,ms));signal.addEventListener('abort',abort,{once:true});
  });
}
function emit(fn,event){try{Promise.resolve(fn?.(event)).catch(()=>{});}catch{}}
function terminalReceipt(receipt,segment) {
  if(!plain(receipt))fail('Device receipt is missing','unknown');
  for(const key of ['boardId','bootId','targetId','segmentId','payloadHash'])if(receipt[key]!==segment[key])fail(`Device receipt has wrong ${key}`,'unknown');
  if(['accepted','running','queued'].includes(receipt.status))return false;
  if(['hid_submitted','completed'].includes(receipt.status)){
    if(receipt.releaseSubmitted!==true)fail('Device has not confirmed released input','unknown');return true;
  }
  const status=String(receipt.status).slice(0,60),error=new Error(`Device returned ${status}`);
  error.code=receipt.status==='unknown'?'unknown':`DEVICE_${status.toUpperCase().replace(/[^A-Z0-9_]/g,'_')}`;
  error.deviceFailure={status,releaseSubmitted:receipt.releaseSubmitted===true};
  for(const key of ['submitted','maxLatenessMs'])if(Number.isSafeInteger(receipt[key])&&receipt[key]>=0)error.deviceFailure[key]=receipt[key];
  throw error;
}
/** Pixel coordinates refer to the complete captured image, never a DOM viewport. */
export function frameCoordinateReference(frame) {
  if(!integer(frame?.width,1,10000)||!integer(frame?.height,1,10000))fail('Invalid full-display frame dimensions');
  if(frame.coordinateSpace&&frame.coordinateSpace!=='full-display')fail('Frame is not a complete display');
  return {coordinateSpace:'full-display',width:frame.width,height:frame.height,range:[0,10000],origin:'top-left',x:'round(pixelX / width * 10000)',y:'round(pixelY / height * 10000)'};
}
function frameMetadata(frame,step,context) {
  if(!frame||!validId(frame.frameId)||frame.targetId!==context.targetId||frame.orientationEpoch!==context.orientationEpoch)fail('Captured frame target/identity is invalid');
  if(!finite(frame.requestedAtMs)||!finite(frame.readyAtMs)||frame.readyAtMs<frame.requestedAtMs||!(frame.mediaTimeMs===null||finite(frame.mediaTimeMs)))fail('Captured frame needs actual request/ready times and nullable media time');
  if(!integer(frame.width,1,10000)||!integer(frame.height,1,10000))fail('Invalid captured frame dimensions');
  return {frameId:frame.frameId,groupId:step.id,label:step.label,targetId:frame.targetId,orientationEpoch:frame.orientationEpoch,requestedAtMs:frame.requestedAtMs,readyAtMs:frame.readyAtMs,mediaTimeMs:frame.mediaTimeMs,width:frame.width,height:frame.height};
}

/**
 * Trusted injection only. device: submitSegment(segment,{signal}),
 * getResult(query,{signal}), release(binding,{signal}). capture: grab(request),
 * save(frame,metadata) => local-asset string or {assetRef}. No default device.
 * Stop uses release({...,cancelPending:true,invalidateLease:true}); a release
 * confirmation must include leaseInvalidated:true to resolve unknown input.
 */
export async function executePhonePlan(input,{device,capture,context,signal,onEvent}={}) {
  const plan=structuredClone(input),validation=validatePlan(plan,context);
  if(!validation.valid)fail(validation.errors.join('; '));
  const changes=plan.steps.some(s=>MUTATIONS.has(s.op));
  if(changes&&(!device||!['submitSegment','getResult','release'].every(k=>typeof device[k]==='function')))fail('Authenticated device adapter is not connected');
  if(validation.frameCount&&typeof capture?.grab!=='function')fail('Capture adapter is not connected');
  const baseline=Object.fromEntries(BASE_KEYS.map(k=>[k,context[k]])),initialMode=context.mode;
  const controller=new AbortController(),now=context.now||defaultNow;
  const start=now(),acceptedAt=context.planReceivedAtMs??start;
  if(!finite(start)||!finite(acceptedAt)||acceptedAt>start)fail('Invalid trusted monotonic clock');
  const deadline=Math.min(start+plan.maxExecutionMs,acceptedAt+plan.ttlMs);
  if(deadline<=start)throw deadlineError();
  let failureCode=null,dispatched=false,inputState='released',stepIndex=0,deadlineExceeded=false,mandatoryStages=0,activeInputRun=null;
  const result={version:1,planId:plan.planId,targetId:plan.targetId,status:'completed',outcome:'not_evaluated',inputState:'released',steps:[],frames:[]};
  const timing={contextMs:0,submitMs:0,resultQueryMs:0,receiptWaitMs:0,settleMs:0,capturePipelineMs:0,saveMs:0,scheduledInputMs:0,deviceExecutionMs:0,deviceTimedSegments:0,maxInputLatenessMs:0,submitCount:0,resultQueryCount:0,submittedBodyBytes:0,maxSubmittedBodyBytes:0};
  const measured=async(key,operation)=>{const at=now();try{return await operation();}finally{timing[key]+=Math.max(0,now()-at);}};
  const expire=()=>{if(deadlineExceeded)return;deadlineExceeded=true;failureCode='PLAN_DEADLINE_EXCEEDED';if(!mandatoryStages&&!controller.signal.aborted)controller.abort(deadlineError());};
  const cancel=()=>{if(controller.signal.aborted)return;failureCode='USER_CANCELLED';controller.abort(abortError());};
  if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
  const deadlineTimer=setTimeout(expire,Math.max(0,deadline-now()));
  async function check(checkSignal=controller.signal){
    if(controller.signal.aborted)throw abortReason(controller.signal);
    if(deadlineExceeded&&!mandatoryStages)throw deadlineError();
    if(now()>=deadline){expire();if(!mandatoryStages)throw deadlineError();}
    if(checkSignal.aborted)throw abortReason(checkSignal);
    const current=typeof context.getState==='function'?await measured('contextMs',()=>abortable(Promise.resolve(context.getState({signal:checkSignal})),checkSignal)):context;
    if(controller.signal.aborted)throw abortReason(controller.signal);
    if(deadlineExceeded&&!mandatoryStages)throw deadlineError();
    if(now()>=deadline){expire();if(!mandatoryStages)throw deadlineError();}
    if(checkSignal.aborted)throw abortReason(checkSignal);
    if(changes)assertBridgePresent(current);
    for(const key of BASE_KEYS)if(current[key]!==baseline[key])fail(`Execution context changed: ${key}`,'unknown');
    if(context.mode!==initialMode||(current.mode!==undefined&&current.mode!==initialMode))fail('Execution mode changed');
    if(changes)for(const key of ['identityVerified','bindingVerified','leaseVerified','executionEnabled'])if(current[key]!==true)fail(`Execution permission lost: ${key}`,'unknown');
    return current;
  }
  const wait=async(ms,{allowDeadline=false,timingKey='settleMs'}={})=>{if(!allowDeadline)await check();await measured(timingKey,()=>sleep(ms,controller.signal));if(!allowDeadline)await check();};
  async function within(promise,endAt){
    let timer;const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{const e=new Error('Device result timed out');e.code='DEVICE_RESULT_TIMEOUT';e.cancelReason='device_result_timeout';reject(e);},Math.max(0,endAt-now()));});
    try{return await abortable(Promise.race([promise,timeout]),controller.signal);}finally{clearTimeout(timer);}
  }
  async function runGesture(step,index,prepared){
    const current=await check(),caps=current.capabilities||context.capabilities;operationAllowed(step.op,{capabilities:caps});const compiled=prepared||compileGesture(step,{...context,capabilities:caps});
    const segment=gestureEnvelope(plan,baseline,index,compiled,crypto.randomUUID());checkRequestBytes(segment,caps);
    segment.payloadHash=await hashSegment(segment);const latest=await check(),latestCaps=latest.capabilities||context.capabilities;operationAllowed(step.op,{capabilities:latestCaps});checkGestureLimits(compiled.events,compiled.durationMs,latestCaps);checkRequestBytes(segment,latestCaps);
    if(!dispatched){const batch=validatePlan(plan,{...context,capabilities:latestCaps});if(!batch.valid)fail(batch.errors.join('; '));}
    context.validateSegment?.(segment);
    let receipt;timing.scheduledInputMs+=compiled.durationMs;dispatched=true;if(activeInputRun&&activeInputRun.start===index)activeInputRun.sent=true;inputState='unknown';mandatoryStages++;
    emit(onEvent,{type:'segment',phase:'submitting',segment});
    try{
      const requestTimeout=integer(context.resultTimeoutMs,100,30000)?context.resultTimeoutMs:8000;
      let timedReceipt=false;const receiptTiming=receipt=>{if(timedReceipt)return;const start=receipt?.startedAtDeviceMs,end=receipt?.endedAtDeviceMs;if(Number.isSafeInteger(start)&&start>=0&&Number.isSafeInteger(end)&&end>=start&&end-start<=30000){timing.deviceExecutionMs+=end-start;timing.deviceTimedSegments++;timedReceipt=true;}if(Number.isInteger(receipt?.maxLatenessMs)&&receipt.maxLatenessMs>=0&&receipt.maxLatenessMs<=30000)timing.maxInputLatenessMs=Math.max(timing.maxInputLatenessMs,receipt.maxLatenessMs);};
      const receiptDone=receipt=>{try{const done=terminalReceipt(receipt,segment);if(done){inputState='released';receiptTiming(receipt);}return done;}catch(e){if(e.deviceFailure){receiptTiming(e.deviceFailure);if(e.deviceFailure.releaseSubmitted===true)inputState='released';}throw e;}};
      try{const bodyBytes=new TextEncoder().encode(JSON.stringify(segment)).length;timing.submittedBodyBytes+=bodyBytes;timing.maxSubmittedBodyBytes=Math.max(timing.maxSubmittedBodyBytes,bodyBytes);timing.submitCount++;receipt=await measured('submitMs',()=>within(device.submitSegment(segment,{signal:controller.signal}),now()+requestTimeout));await check();}
      catch(e){if(e.code==='CLIPBOARD_COPY_REQUIRED'&&e.sent===false||e.code==='DEVICE_RESOURCE_BUSY'&&e.unknown===false){inputState='released';throw e;}const code=/^DEVICE_[A-Z0-9_]{1,64}$/.test(e.code||'')?e.code:'DEVICE_SUBMISSION_UNCERTAIN';result.transportError={phase:'submit',code,durationMs:Math.round(timing.submitMs),unknown:e.sent!==false&&e.unknown!==false};emit(onEvent,{type:'segment',phase:'submission_uncertain',segmentId:segment.segmentId,code,message:String(e.message)});await check();}
      const receiptDeadline=now()+requestTimeout;
      const query={boardId:segment.boardId,bootId:segment.bootId,targetId:segment.targetId,clientId:segment.clientId,segmentId:segment.segmentId};
      while(true){
        await check();
        if(receipt&&receiptDone(receipt)){inputState='released';emit(onEvent,{type:'segment',phase:'completed',receipt});return receipt;}
        if(now()>=receiptDeadline)fail('Device result unavailable; execution state unknown','DEVICE_RESULT_TIMEOUT');
        try{timing.resultQueryCount++;receipt=await measured('resultQueryMs',()=>within(device.getResult(query,{signal:controller.signal}),receiptDeadline));await check();}
        catch(e){await check();if(e.code==='DEVICE_RESULT_TIMEOUT'||e.code==='unknown'||e.code==='failed')throw e;fail('Device result query failed; no input was resent','DEVICE_RESULT_UNKNOWN');}
        if(receipt&&receiptDone(receipt)){inputState='released';emit(onEvent,{type:'segment',phase:'completed',receipt});return receipt;}
        await wait(integer(context.pollIntervalMs,0,1000)?context.pollIntervalMs:100,{timingKey:'receiptWaitMs'});
      }
    }finally{mandatoryStages=Math.max(0,mandatoryStages-1);}
  }
  async function collectFrames(step){
    mandatoryStages++;const output=[],groupStart=now(),groupDeadline=groupStart+step.frames.timeoutMs;
    const sampler=new AbortController();const abortSampler=()=>sampler.abort(controller.signal.reason);controller.signal.addEventListener('abort',abortSampler,{once:true});
    let phase='context_before';const timer=setTimeout(()=>{if(now()>=deadline)expire();else sampler.abort(captureTimeout(phase));},Math.max(0,groupDeadline-now()));
    const sampled=async(stage,operation)=>{phase=stage;return boundedCaptureStage(operation,{signal:sampler.signal,deadlineAtMs:performance.now()+Math.max(0,groupDeadline-now()),stage,onDiagnostic:value=>capture.diagnose?.({...value,groupId:step.id})});};
    try{
      for(let i=0;i<step.frames.count;i++){
        await sampled('context_before',()=>check(sampler.signal));const delay=groupStart+i*step.frames.intervalMs-now();if(delay>0)await abortable(sleep(delay,sampler.signal),controller.signal);
        if(now()>=deadline)expire();if(now()>=groupDeadline)throw captureTimeout(phase);
        const options={targetId:baseline.targetId,orientationEpoch:baseline.orientationEpoch,groupId:step.id,index:i,signal:sampler.signal,deadlineAtMs:performance.now()+Math.max(0,groupDeadline-now())};
        const frame=await sampled('capture',()=>measured('capturePipelineMs',()=>capture.grab(options)));await sampled('context_after',()=>check(sampler.signal));
        const metadata=frameMetadata(frame,step,baseline);let assetRef=frame.assetRef;
        if(!assetRef){
          if(typeof capture.save!=='function')fail('Capture persistence adapter is not connected');
          const saved=await sampled('save',()=>measured('saveMs',()=>capture.save(frame,metadata,{signal:sampler.signal})));await sampled('context_after_save',()=>check(sampler.signal));assetRef=typeof saved==='string'?saved:saved?.assetRef;
        }
        if(typeof assetRef!=='string'||!/^local-asset:[A-Za-z0-9._:-]+$/.test(assetRef))fail('Frame was not saved to local attachment storage');
        const value={...metadata,assetRef};output.push(value);result.frames.push(value);emit(onEvent,{type:'frame',frame:value});
      }
      return output;
    }catch(e){if(controller.signal.aborted)throw abortReason(controller.signal);if(now()>=groupDeadline)throw captureTimeout(e.stage||phase);if(sampler.signal.aborted)throw captureTimeout(e.stage||phase);throw e;}
    finally{clearTimeout(timer);controller.signal.removeEventListener('abort',abortSampler);mandatoryStages=Math.max(0,mandatoryStages-1);}
  }
  async function cleanupRelease(){
    if(!dispatched)return;
    // Cleanup owns a fresh transport-sized budget after the plan/capture signal
    // has expired. A normal bridge round trip must not lose its release receipt.
    const releaseController=new AbortController();const timer=setTimeout(()=>releaseController.abort(),8000);
    try{
      const reply=await abortable(device.release({...baseline,planId:plan.planId,cancelPending:true,invalidateLease:true},{signal:releaseController.signal}),releaseController.signal);
      if(reply?.boardId===baseline.boardId&&reply.bootId===baseline.bootId&&reply.targetId===baseline.targetId&&(reply.status==='released'||reply.releaseSubmitted===true)&&reply.leaseInvalidated===true)inputState='released';
    }catch{}finally{clearTimeout(timer);}
  }
  let executionElapsedMs;
  try{
    for(stepIndex=0;stepIndex<plan.steps.length;stepIndex++){
      await check();const step=plan.steps[stepIndex];emit(onEvent,{type:'step',phase:'started',stepId:step.id});
      if(step.op==='wait'){await wait(step.durationMs);result.steps.push({id:step.id,status:'waited',detail:'Bounded host wait completed.'});}
      else if(step.op==='capture'){
        if(inputState!=='released')fail('Capture barrier requires confirmed released input','unknown');
        await collectFrames(step);if(!(deadlineExceeded&&stepIndex===plan.steps.length-1&&inputState==='released'))await check();else result.deadlineExceededAfterCompletion=true;result.steps.push({id:step.id,status:'captured',detail:step.review?'Capture saved; return to model for review.':'Capture saved at a released-input barrier.'});
      }else if(step.op==='observe'){
        // Start the sampler without awaiting its first frame. Motion down/move/up
        // is submitted as one segment and never waits for screenshot encoding.
        const sampled=collectFrames(step),motion=runGesture(step.motion,stepIndex);
        await Promise.all([sampled,motion]);const finalStep=stepIndex===plan.steps.length-1&&deadlineExceeded&&inputState==='released';await wait(actionSettleMs(step.motion),{allowDeadline:finalStep});if(finalStep)result.deadlineExceededAfterCompletion=true;else await check();result.steps.push({id:step.id,status:'hid_submitted',detail:'Motion submitted; observation frames carry actual times, not promised alignment.'});
      }else{
        const keys=['key','tap'].includes(step.op)?compileInputRun(plan,stepIndex,{...context,capabilities:(await check()).capabilities||context.capabilities},baseline):null;
        if(keys){
          activeInputRun={start:stepIndex,end:keys.end,sent:false};
          emit(onEvent,{type:'input-batch',stepIds:plan.steps.slice(stepIndex,keys.end+1).map(s=>s.id),scheduledDurationMs:keys.durationMs});
          await runGesture(step,stepIndex,keys);
          for(let i=stepIndex;i<=keys.end;i++){result.steps.push({id:plan.steps[i].id,status:'hid_submitted',detail:'Device confirmed the scheduled input batch and release; visible outcome not evaluated.'});emit(onEvent,{type:'step',phase:'completed',stepId:plan.steps[i].id});}
          stepIndex=keys.end;activeInputRun=null;const final=stepIndex===plan.steps.length-1&&deadlineExceeded&&inputState==='released';
          await wait(actionSettleMs(plan.steps[stepIndex]),{allowDeadline:final});if(final)result.deadlineExceededAfterCompletion=true;continue;
        }
        await runGesture(step,stepIndex);const settleMs=actionSettleMs(step),finalStep=stepIndex===plan.steps.length-1&&deadlineExceeded&&inputState==='released';if(settleMs){emit(onEvent,{type:'step',phase:'settling',stepId:step.id,settleMs});await wait(settleMs,{allowDeadline:finalStep});}if(finalStep)result.deadlineExceededAfterCompletion=true;else await check();result.steps.push({id:step.id,status:'hid_submitted',detail:'Device confirmed HID submission and release; visible outcome not evaluated.'});}
      emit(onEvent,{type:'step',phase:'completed',stepId:step.id});
    }
  }catch(e){
    executionElapsedMs=Math.max(0,now()-start);
    const code=String(failureCode||e.code||'failed').slice(0,100);failureCode=code;controller.abort(e);
    result.code=code;if(e.cancelReason)result.cancelReason=e.cancelReason;else if(code==='PLAN_DEADLINE_EXCEEDED')result.cancelReason='plan_deadline';else if(code==='DEVICE_RESULT_TIMEOUT')result.cancelReason='device_result_timeout';if(code==='CAPTURE_TIMEOUT')result.captureStage=e.stage;if(e.deviceFailure)result.deviceFailure=e.deviceFailure;result.status=code==='USER_CANCELLED'?'cancelled':code==='unknown'||(dispatched&&inputState==='unknown')||(code==='DEVICE_BRIDGE_UNAVAILABLE'&&dispatched&&inputState==='unknown')?'unknown':'failed';result.outcome='insufficient_evidence';
    if(activeInputRun?.sent){for(let i=activeInputRun.start;i<=activeInputRun.end;i++)result.steps.push({id:plan.steps[i].id,status:'unknown',detail:'The submitted input batch did not finish with a verified receipt; inspect the current screen before further input.'});stepIndex=activeInputRun.end;}
    else if(stepIndex<plan.steps.length&&!result.steps.some(step=>step.id===plan.steps[stepIndex].id))result.steps.push({id:plan.steps[stepIndex].id,status:result.status==='cancelled'?'cancelled':result.status==='unknown'?'unknown':'failed',detail:String(e.message).slice(0,500)});
    for(let i=stepIndex+1;i<plan.steps.length;i++)result.steps.push({id:plan.steps[i].id,status:'skipped',detail:'Stopped after prior failure or cancellation.'});
    await cleanupRelease();
  }finally{clearTimeout(deadlineTimer);signal?.removeEventListener('abort',cancel);}
  const elapsedMs=executionElapsedMs??Math.max(0,now()-start),effectiveBudgetMs=Math.max(0,deadline-start);
  result.timing={...Object.fromEntries(Object.entries(timing).map(([key,value])=>[key,Math.round(value)])),elapsedMs:Math.round(elapsedMs),maxExecutionMs:plan.maxExecutionMs,ttlMs:plan.ttlMs,effectiveBudgetMs:Math.round(effectiveBudgetMs),...(result.deadlineExceededAfterCompletion?{deadlineExceededAfterCompletion:true}:{})};
  result.inputState=inputState;
  if(result.status!=='completed'){
    const code=result.code||'failed',restartRequired=code==='CAPTURE_RESTART_REQUIRED'||capture?.needsRestart===true;if(restartRequired)result.captureNeedsRestart=true;
    const action=code==='USER_CANCELLED'?'none':restartRequired?'resume_sharing':code==='DEVICE_BRIDGE_UNAVAILABLE'?'reconnect':['CAPTURE_UNAVAILABLE','CAPTURE_REQUIRED','SCREEN_SHARING_REQUIRED','CAPTURE_STOPPED'].includes(code)?'resume_sharing':result.status==='unknown'||inputState!=='released'?'reconcile_before_replan':'observe_then_replan';
    result.recovery={action,automatic:action==='observe_then_replan',reasonCode:code};
  }
  return result;
}
