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
  shape(step,FIELDS[step.op],step.op);
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
  if(!['plan','task'].includes(context.mode))fail('Phone plans are unavailable in chat mode');
  const changing=plan.steps.some(s=>MUTATIONS.has(s.op));
  if(changing){
    if(context.mode!=='task')fail('Plan mode cannot modify the phone');
    for(const key of ['identityVerified','bindingVerified','leaseVerified','executionEnabled'])if(context[key]!==true)fail(`Trusted ${key} is required`);
  }
}

const REQUEST_BYTES_DEFAULT=98304;
function requestByteLimit(caps={}){const value=caps.maxRequestBytes??REQUEST_BYTES_DEFAULT;if(!integer(value,1,REQUEST_BYTES_DEFAULT))fail('Invalid trusted device limit: maxRequestBytes');return value;}
function gestureEnvelope(plan,identity,index,{events,durationMs},segmentId='00000000-0000-4000-8000-000000000000'){
 return {protocolVersion:1,boardId:identity.boardId,bootId:identity.bootId,targetId:identity.targetId,clientId:identity.clientId,leaseId:identity.leaseId,segmentId,planId:plan.planId,segmentIndex:index,ttlMs:Math.min(15000,Math.max(100,durationMs+1000)),events,payloadHash:'0'.repeat(64)};
}
function checkRequestBytes(segment,caps){if(new TextEncoder().encode(JSON.stringify(segment)).length>requestByteLimit(caps))fail('Compiled segment exceeds device request byte limit; shorten or sparsify the motion.');}
function checkGestureLimits(events,durationMs,caps={}){
 const limit=(key,min,max,fallback)=>{if(caps[key]===undefined)return fallback;if(!integer(caps[key],min,max))fail(`Invalid trusted device limit: ${key}`);return caps[key];};
 const maxEvents=limit('maxEvents',1,512,512),maxDuration=limit('maxSegmentMs',1,5000,5000),maxHold=limit('maxHoldMs',1,3000,3000);
 if(events.length>maxEvents||durationMs>maxDuration)fail('Compiled segment exceeds device limits');
 let heldAt=null;for(const event of events){const held=event.kind==='pointer'?event.buttons:event.kind==='keyboard'?(event.modifiers||event.usages.length):event.usage;if(heldAt!==null&&event.atMs-heldAt>maxHold)fail('Compiled input exceeds held-state budget');if(held&&heldAt===null)heldAt=event.atMs;if(!held)heldAt=null;}
 if(heldAt!==null)fail('Compiled input must end released');
}

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
        budgetMs+=step.op==='observe'?Math.max(compiled.durationMs,step.frames.timeoutMs):compiled.durationMs;
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
  const settle=limit('pointerSettleMs',0,100,20);
  const interval=limit('reportIntervalMs',8,100,20);
  const pointer=(atMs,buttons,p)=>({atMs,kind:'pointer',buttons,x:p.x,y:p.y});
  let events=[];
  if(step.op==='tap')events=[pointer(0,0,step.point),pointer(settle,1,step.point),pointer(settle+step.holdMs,0,step.point)];
  if(step.op==='key')events=[{atMs:0,kind:'keyboard',modifiers:step.modifiers,usages:[step.usage]},{atMs:step.holdMs,kind:'keyboard',modifiers:0,usages:[]}];
  if(step.op==='home')events=[{atMs:0,kind:'consumer',usage:64},{atMs:100,kind:'consumer',usage:0}];
  if(step.op==='pointer_sequence')events=[pointer(0,0,step.events[0]),...step.events.map(e=>pointer(settle+e.atMs,e.phase==='up'?0:1,e))];
  if(step.op==='drag'||step.op==='swipe'){
    const path=step.path,end=path.at(-1).tMs;
    const times=new Set(path.map(p=>p.tMs));for(let t=interval;t<end;t+=interval)times.add(t);
    events=[pointer(0,0,path[0]),pointer(settle,1,path[0])];let at=0;
    for(const t of [...times].sort((a,b)=>a-b)){
      if(t===0)continue;
      while(at+1<path.length&&path[at+1].tMs<t)at++;
      const a=path[at],b=path[Math.min(at+1,path.length-1)],fraction=(t-a.tMs)/(b.tMs-a.tMs);
      const p={x:Math.round(a.x+(b.x-a.x)*fraction),y:Math.round(a.y+(b.y-a.y)*fraction)};
      events.push(pointer(settle+t,1,p));
    }
    events.push(pointer(settle+end+(step.endHoldMs||0),0,path.at(-1)));
  }
  const durationMs=events.at(-1).atMs;
  checkGestureLimits(events,durationMs,caps);
  return {events,durationMs};
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
function abortError(){const e=new Error('Phone plan cancelled');e.code='cancelled';return e;}
function abortable(promise,signal) {
  if(signal.aborted){Promise.resolve(promise).catch(()=>{});return Promise.reject(abortError());}
  return new Promise((resolve,reject)=>{
    const abort=()=>{cleanup();reject(abortError());};
    const cleanup=()=>signal.removeEventListener('abort',abort);
    signal.addEventListener('abort',abort,{once:true});
    Promise.resolve(promise).then(v=>{cleanup();if(signal.aborted)reject(abortError());else resolve(v);},e=>{cleanup();reject(e);});
  });
}
function sleep(ms,signal) {
  if(signal.aborted)return Promise.reject(abortError());
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);};
    const abort=()=>{cleanup();reject(abortError());};
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
  fail(`Device returned ${String(receipt.status).slice(0,60)}`,receipt.status==='unknown'?'unknown':'failed');
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
  if(deadline<=start)fail('Plan already expired');
  let failureCode=null,dispatched=false,inputState='released',stepIndex=0;
  const result={version:1,planId:plan.planId,targetId:plan.targetId,status:'completed',outcome:'not_evaluated',inputState:'released',steps:[],frames:[]};
  const cancel=()=>{failureCode='cancelled';controller.abort();};
  if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
  const deadlineTimer=setTimeout(()=>{failureCode='failed';controller.abort();},Math.max(0,deadline-now()));
  async function check(){
    if(controller.signal.aborted)fail(failureCode==='cancelled'?'Phone plan cancelled':'Plan execution deadline exceeded',failureCode||'cancelled');
    if(now()>=deadline)fail('Plan execution deadline exceeded');
    const current=typeof context.getState==='function'?await abortable(Promise.resolve(context.getState()),controller.signal):context;
    if(controller.signal.aborted)fail(failureCode==='cancelled'?'Phone plan cancelled':'Plan execution deadline exceeded',failureCode||'cancelled');
    if(changes)assertBridgePresent(current);
    for(const key of BASE_KEYS)if(current[key]!==baseline[key])fail(`Execution context changed: ${key}`,'unknown');
    if(context.mode!==initialMode||(current.mode!==undefined&&current.mode!==initialMode))fail('Execution mode changed');
    if(changes)for(const key of ['identityVerified','bindingVerified','leaseVerified','executionEnabled'])if(current[key]!==true)fail(`Execution permission lost: ${key}`,'unknown');
    return current;
  }
  const wait=async ms=>{await check();await sleep(ms,controller.signal);await check();};
  async function within(promise,endAt){
    let timer;const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{const e=new Error('Device result timed out');e.code='unknown';reject(e);},Math.max(0,endAt-now()));});
    try{return await abortable(Promise.race([promise,timeout]),controller.signal);}finally{clearTimeout(timer);}
  }
  async function runGesture(step,index){
    const current=await check(),caps=current.capabilities||context.capabilities;operationAllowed(step.op,{capabilities:caps});const compiled=compileGesture(step,{...context,capabilities:caps});
    const segment=gestureEnvelope(plan,baseline,index,compiled,crypto.randomUUID());checkRequestBytes(segment,caps);
    segment.payloadHash=await hashSegment(segment);const latest=await check(),latestCaps=latest.capabilities||context.capabilities;operationAllowed(step.op,{capabilities:latestCaps});checkGestureLimits(segment.events,compiled.durationMs,latestCaps);checkRequestBytes(segment,latestCaps);
    if(!dispatched){const batch=validatePlan(plan,{...context,capabilities:latestCaps});if(!batch.valid)fail(batch.errors.join('; '));}
    context.validateSegment?.(segment);
    let receipt;dispatched=true;inputState='unknown';
    emit(onEvent,{type:'segment',phase:'submitting',segment});
    try{receipt=await within(device.submitSegment(segment,{signal:controller.signal}),Math.min(deadline,now()+8000));await check();}
    catch(e){if(e.code==='CLIPBOARD_COPY_REQUIRED'&&e.sent===false){inputState='released';throw e;}await check();emit(onEvent,{type:'segment',phase:'submission_uncertain',segmentId:segment.segmentId,message:String(e.message)});}
    const receiptDeadline=Math.min(deadline,now()+(integer(context.resultTimeoutMs,100,15000)?context.resultTimeoutMs:8000));
    const query={boardId:segment.boardId,bootId:segment.bootId,targetId:segment.targetId,clientId:segment.clientId,segmentId:segment.segmentId};
    while(true){
      await check();
      if(receipt&&terminalReceipt(receipt,segment)){inputState='released';emit(onEvent,{type:'segment',phase:'completed',receipt});return receipt;}
      if(now()>=receiptDeadline)fail('Device result unavailable; execution state unknown','unknown');
      try{receipt=await within(device.getResult(query,{signal:controller.signal}),receiptDeadline);await check();}
      catch(e){await check();if(e.code==='unknown'||e.code==='failed')throw e;fail('Device result query failed; no input was resent','unknown');}
      if(receipt&&terminalReceipt(receipt,segment)){inputState='released';emit(onEvent,{type:'segment',phase:'completed',receipt});return receipt;}
      await wait(integer(context.pollIntervalMs,0,1000)?context.pollIntervalMs:100);
    }
  }
  async function collectFrames(step){
    const output=[],groupStart=now(),groupDeadline=Math.min(deadline,groupStart+step.frames.timeoutMs);
    const sampler=new AbortController();const abortSampler=()=>sampler.abort();controller.signal.addEventListener('abort',abortSampler,{once:true});
    const timer=setTimeout(()=>sampler.abort(),Math.max(0,groupDeadline-now()));
    try{
      for(let i=0;i<step.frames.count;i++){
        await check();const delay=groupStart+i*step.frames.intervalMs-now();if(delay>0)await abortable(sleep(delay,sampler.signal),controller.signal);
        if(now()>=groupDeadline)fail('Frame sampling timed out');
        const frame=await abortable(capture.grab({targetId:baseline.targetId,orientationEpoch:baseline.orientationEpoch,groupId:step.id,index:i,signal:sampler.signal}),sampler.signal);await check();
        const metadata=frameMetadata(frame,step,baseline);let assetRef=frame.assetRef;
        if(!assetRef){
          if(typeof capture.save!=='function')fail('Capture persistence adapter is not connected');
          const saved=await abortable(capture.save(frame,metadata),sampler.signal);await check();assetRef=typeof saved==='string'?saved:saved?.assetRef;
        }
        if(typeof assetRef!=='string'||!/^local-asset:[A-Za-z0-9._:-]+$/.test(assetRef))fail('Frame was not saved to local attachment storage');
        const value={...metadata,assetRef};output.push(value);result.frames.push(value);emit(onEvent,{type:'frame',frame:value});
      }
      return output;
    }catch(e){if(!controller.signal.aborted&&sampler.signal.aborted)fail('Frame sampling timed out');throw e;}
    finally{clearTimeout(timer);controller.signal.removeEventListener('abort',abortSampler);}
  }
  async function cleanupRelease(){
    if(!dispatched)return;
    const releaseController=new AbortController();const timer=setTimeout(()=>releaseController.abort(),1000);
    try{
      const reply=await abortable(device.release({...baseline,planId:plan.planId,cancelPending:true,invalidateLease:true},{signal:releaseController.signal}),releaseController.signal);
      if(reply?.boardId===baseline.boardId&&reply.bootId===baseline.bootId&&reply.targetId===baseline.targetId&&(reply.status==='released'||reply.releaseSubmitted===true)&&reply.leaseInvalidated===true)inputState='released';
    }catch{}finally{clearTimeout(timer);}
  }
  try{
    for(stepIndex=0;stepIndex<plan.steps.length;stepIndex++){
      await check();const step=plan.steps[stepIndex];emit(onEvent,{type:'step',phase:'started',stepId:step.id});
      if(step.op==='wait'){await wait(step.durationMs);result.steps.push({id:step.id,status:'waited',detail:'Bounded host wait completed.'});}
      else if(step.op==='capture'){
        if(inputState!=='released')fail('Capture barrier requires confirmed released input','unknown');
        await collectFrames(step);await check();result.steps.push({id:step.id,status:'captured',detail:step.review?'Capture saved; return to model for review.':'Capture saved at a released-input barrier.'});
      }else if(step.op==='observe'){
        // Start the sampler without awaiting its first frame. Motion down/move/up
        // is submitted as one segment and never waits for screenshot encoding.
        const sampled=collectFrames(step),motion=runGesture(step.motion,stepIndex);
        await Promise.all([sampled,motion]);await check();result.steps.push({id:step.id,status:'hid_submitted',detail:'Motion submitted; observation frames carry actual times, not promised alignment.'});
      }else{await runGesture(step,stepIndex);await check();result.steps.push({id:step.id,status:'hid_submitted',detail:'Device confirmed HID submission and release; visible outcome not evaluated.'});}
      emit(onEvent,{type:'step',phase:'completed',stepId:step.id});
    }
  }catch(e){
    const code=failureCode||e.code||'failed';failureCode=code;controller.abort();
    result.code=code;result.status=code==='cancelled'?'cancelled':code==='unknown'||(code==='DEVICE_BRIDGE_UNAVAILABLE'&&dispatched&&inputState==='unknown')?'unknown':'failed';result.outcome='insufficient_evidence';
    if(stepIndex<plan.steps.length)result.steps.push({id:plan.steps[stepIndex].id,status:result.status==='cancelled'?'cancelled':result.status==='unknown'?'unknown':'failed',detail:String(e.message).slice(0,500)});
    for(let i=stepIndex+1;i<plan.steps.length;i++)result.steps.push({id:plan.steps[i].id,status:'skipped',detail:'Stopped after prior failure or cancellation.'});
    await cleanupRelease();
  }finally{clearTimeout(deadlineTimer);signal?.removeEventListener('abort',cancel);}
  result.inputState=inputState;return result;
}
