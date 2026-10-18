import {createDeviceURL} from './device.js';
export const DEVICE_CLIPBOARD_CHUNK_BYTES=1024;
export const CLIPBOARD_SHORTCUT_NAME='iPhone Agent Clipboard';
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const fail=code=>Object.assign(new Error(code),{code});
function delay(ms,signal){return new Promise((resolve,reject)=>{const cancel=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);reject(fail('CLIPBOARD_CANCELLED'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},ms);signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();});}
export function clipboardUTF8Chunk(bytes,offset,maxBytes=DEVICE_CLIPBOARD_CHUNK_BYTES){
 if(!(bytes instanceof Uint8Array)||!Number.isSafeInteger(offset)||offset<0||offset>=bytes.length||!Number.isInteger(maxBytes)||maxBytes<4||maxBytes>DEVICE_CLIPBOARD_CHUNK_BYTES||(bytes[offset]&0xc0)===0x80)throw fail('CLIPBOARD_BRIDGE_RESPONSE_INVALID');
 let end=Math.min(bytes.length,offset+maxBytes);while(end<bytes.length&&(bytes[end]&0xc0)===0x80)end--;if(end<=offset)throw fail('CLIPBOARD_BRIDGE_RESPONSE_INVALID');
 const chunk=bytes.subarray(offset,end);return {end,textBase64:btoa(String.fromCharCode(...chunk))};
}
export function shortcutLaunchURL({baseUrl,requestId,sessionId,targetId,jobToken},name=CLIPBOARD_SHORTCUT_NAME){
 const origin=createDeviceURL(baseUrl);if(!origin.startsWith('http:')||![requestId,sessionId,targetId].every(v=>typeof v==='string'&&ID.test(v))||!/^[a-f0-9]{64}$/.test(jobToken)||typeof name!=='string'||!name.trim()||name.length>100)throw fail('CLIPBOARD_BRIDGE_RESPONSE_INVALID');
 const path=origin+'/v1/clipboard/jobs/'+encodeURIComponent(requestId);
 const input={requestId,sessionId,targetId,jobURL:path+'?token='+jobToken,ackURL:path+'/ack?token='+jobToken};
 return 'shortcuts://run-shortcut?'+new URLSearchParams({name,input:'text',text:JSON.stringify(input)});
}
export function createDeviceClipboard({getDevice,isCurrent=()=>true,now=()=>Date.now(),sleep=delay,pollIntervalMs=1000,chunkPollMs=100,ttlMs=120000,shortcutName=()=>CLIPBOARD_SHORTCUT_NAME}={}){
 let active=null;const listeners=new Set();
 const snapshot=()=>active?{requestId:active.requestId,sessionId:active.sessionId,targetId:active.targetId,status:active.status,totalBytes:active.totalBytes,transferredBytes:active.committed,errorCode:active.errorCode||null}:null;
 const emit=()=>{for(const fn of listeners)try{fn(snapshot());}catch{}};
 const current=job=>active===job&&!job.controller.signal.aborted&&getDevice()===job.device&&isCurrent(job)&&job.device.identityVerified&&job.device.bindingVerified&&job.device.boardId===job.boardId&&job.device.bootId===job.bootId&&job.device.clientId===job.clientId&&job.device.targetId===job.targetId;
 const rejectCurrent=job=>{if(!current(job))throw fail('CLIPBOARD_TARGET_CHANGED');if(now()>=job.deadline)throw fail('CLIPBOARD_JOB_EXPIRED');};
 const matches=(job,value)=>value&&value.requestId===job.wireRequestId&&value.sessionId===job.sessionId&&value.targetId===job.targetId&&value.clientId===job.clientId&&value.boardId===job.boardId&&value.bootId===job.bootId;
 function progress(job,value){
  if(!matches(job,value)||value.totalBytes!==job.totalBytes||value.chunkBytes!==DEVICE_CLIPBOARD_CHUNK_BYTES||typeof value.chunkPending!=='boolean'||!Number.isSafeInteger(value.nextOffset)||value.nextOffset<job.committed||value.nextOffset>job.acceptedEnd)throw fail('CLIPBOARD_BRIDGE_RESPONSE_INVALID');
  if(value.nextOffset>job.committed){job.committed=value.nextOffset;job.deadline=now()+ttlMs;emit();}
  if(['delivered','copied'].includes(value.status)&&job.committed!==job.totalBytes)throw fail('CLIPBOARD_BRIDGE_RESPONSE_INVALID');
 }
 function stopJob(job){job.controller.abort();job.bytes=null;job.launchURL='';try{void Promise.resolve(job.device.cancelClipboard?.({requestId:job.wireRequestId,targetId:job.targetId})).catch(()=>{});}catch{}}
 function cancel(){const job=active;active=null;if(job)stopJob(job);emit();}
 function armJob(job){if(job.completion)return job.completion;
  job.completion=(async()=>{try{while(true){rejectCurrent(job);const value=await job.device.getClipboardStatus({requestId:job.wireRequestId,targetId:job.targetId},{signal:job.controller.signal});rejectCurrent(job);progress(job,value);if(value.status==='streaming'&&job.status==='ready'){job.status='waiting';emit();}
    if(value.status==='copied'){if(!Number.isFinite(value.copiedAtDeviceMs))throw fail('CLIPBOARD_BRIDGE_RESPONSE_INVALID');job.status='copied';job.bytes=null;job.launchURL='';emit();return {requestId:job.requestId,sessionId:job.sessionId,targetId:job.targetId,status:'copied',copiedAt:now(),source:'shortcut',requiresTargetRefocus:true};}
    if(value.status==='expired')throw fail('CLIPBOARD_JOB_EXPIRED');if(value.status==='cancelled')throw fail('CLIPBOARD_CANCELLED');if(!['pending','streaming','delivered'].includes(value.status))throw fail('CLIPBOARD_BRIDGE_RESPONSE_INVALID');
    if(value.status==='streaming'&&!value.chunkPending&&job.committed===job.acceptedEnd&&job.committed<job.totalBytes){
     const chunk=clipboardUTF8Chunk(job.bytes,job.committed,value.chunkBytes),offset=job.committed;
     const response=await job.device.addClipboardChunk({requestId:job.wireRequestId,targetId:job.targetId,offset,textBase64:chunk.textBase64},{signal:job.controller.signal});rejectCurrent(job);
     job.acceptedEnd=chunk.end;job.deadline=now()+ttlMs;progress(job,response);if(!['streaming','delivered'].includes(response.status))throw fail('CLIPBOARD_BRIDGE_RESPONSE_INVALID');continue;
    }
    await sleep(value.status==='streaming'?chunkPollMs:pollIntervalMs,job.controller.signal);
   }}catch(error){if(active===job){stopJob(job);job.status='failed';job.errorCode=error.code||'CLIPBOARD_BRIDGE_FAILED';emit();}throw error;}})();
  return job.completion;
 }
 return {
  getSnapshot:snapshot,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},cancel,
  available(){const device=getDevice();return Boolean(device?.identityVerified&&device?.bindingVerified&&typeof device.stageClipboard==='function'&&typeof device.addClipboardChunk==='function');},
  async prepare({requestId,sessionId,targetId,text},{retry=false}={}){
   if(active?.requestId===requestId&&!retry)return snapshot();cancel();
   const device=getDevice();if(!device?.identityVerified||!device?.bindingVerified||device.targetId!==targetId)throw fail('CLIPBOARD_TARGET_CHANGED');
   if(![requestId,sessionId,targetId].every(v=>typeof v==='string'&&ID.test(v)))throw fail('CLIPBOARD_BRIDGE_RESPONSE_INVALID');
   if(typeof text!=='string'||!text.length)throw fail('CLIPBOARD_TEXT_INVALID');let bytes;try{bytes=new TextEncoder().encode(text);}catch{throw fail('CLIPBOARD_BRIDGE_TEXT_TOO_LARGE');}if(!Number.isSafeInteger(bytes.length)||!bytes.length)throw fail('CLIPBOARD_BRIDGE_TEXT_TOO_LARGE');
   // A retry gets a fresh wire ID. Delayed cancellation cannot affect its replacement.
   const job={requestId,wireRequestId:retry?crypto.randomUUID():requestId,sessionId,targetId,device,bytes,totalBytes:bytes.length,acceptedEnd:0,committed:0,clientId:device.clientId,boardId:device.boardId,bootId:device.bootId,deadline:now()+ttlMs,status:'preparing',controller:new AbortController(),launchURL:''};active=job;emit();
   try{const value=await device.stageClipboard({requestId:job.wireRequestId,sessionId,targetId,totalBytes:job.totalBytes,ttlMs},{signal:job.controller.signal});rejectCurrent(job);progress(job,value);if(value.status!=='pending'||value.nextOffset!==0||value.chunkPending||!Number.isFinite(value.expiresAtDeviceMs))throw fail('CLIPBOARD_BRIDGE_RESPONSE_INVALID');job.launchURL=shortcutLaunchURL({...job,requestId:job.wireRequestId,baseUrl:device.baseUrl.origin,jobToken:value.jobToken},shortcutName());job.status='ready';emit();return snapshot();}
   catch(error){if(active===job){stopJob(job);job.status='failed';job.errorCode=error.code||'CLIPBOARD_BRIDGE_FAILED';emit();}throw error;}
  },
  arm(){const job=active;if(!job||!['ready','waiting','copied'].includes(job.status))throw fail('CLIPBOARD_SHORTCUT_NOT_READY');return armJob(job);},
  start(){
   const job=active;if(!job||job.status!=='ready')throw fail('CLIPBOARD_SHORTCUT_NOT_READY');try{rejectCurrent(job);}catch(error){stopJob(job);job.status='failed';job.errorCode=error.code;emit();throw error;}job.status='waiting';emit();const url=job.launchURL;
   const completion=armJob(job);
   return {url,completion};
  }
 };
}
