import {abortable,checkAbort} from './control.js';
export const IMAGE_QUALITY_PRESETS=Object.freeze({compact:.65,balanced:.8,high:.92});
export function normalizeImageSettings(input={}){
  let qualityPreset=input.qualityPreset;
  if(!Object.hasOwn(IMAGE_QUALITY_PRESETS,qualityPreset)){
    const legacy=Number(input.quality);
    qualityPreset=Number.isFinite(legacy)?Object.keys(IMAGE_QUALITY_PRESETS).reduce((best,key)=>Math.abs(IMAGE_QUALITY_PRESETS[key]-legacy)<Math.abs(IMAGE_QUALITY_PRESETS[best]-legacy)?key:best,'balanced'):'balanced';
  }
  return {qualityPreset,quality:IMAGE_QUALITY_PRESETS[qualityPreset]};
}
// Preserve all source pixels. Compression only changes JPEG encoding quality.
export function fitImage(width,height){if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw new Error('Invalid source image dimensions');return {width,height,scale:1};}
export const CAPTURE_FRAME_TIMEOUT_MS=15000;
export function captureTimeout(stage){return Object.assign(new Error('Screen capture timed out'),{code:'CAPTURE_TIMEOUT',stage});}
// Bound application waiting without pretending native capture/encoding is cancellable.
// The late-value handler owns resources delivered after cancellation or timeout.
export async function boundedCaptureStage(operation,{signal,deadlineAtMs=performance.now()+CAPTURE_FRAME_TIMEOUT_MS,timeoutMs=CAPTURE_FRAME_TIMEOUT_MS,stage,onDiagnostic,details,onLate,onAbandon}={}){
 checkAbort(signal);const started=performance.now();let timer,outcome='completed';
 let task;try{checkAbort(signal);if(started>=deadlineAtMs)throw captureTimeout(stage);task=Promise.resolve(operation());}catch(error){task=Promise.reject(error);}
 try{const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(captureTimeout(stage)),Math.max(0,Math.min(timeoutMs,deadlineAtMs-started)));});const result=await abortable(Promise.race([task,timeout]),signal);checkAbort(signal);return result;}
 catch(error){outcome=error?.code==='CAPTURE_TIMEOUT'?'timeout':signal?.aborted?'cancelled':'failed';try{onAbandon?.(error);}catch{}if(onLate)void task.then(value=>onLate(value),()=>{}).catch(()=>{});throw error;}
 finally{clearTimeout(timer);try{onDiagnostic?.({stage,status:outcome,durationMs:Math.max(0,performance.now()-started),...(details?.()||{})});}catch{}}
}
export class ScreenCapture {
  #listeners=new Set();
  #lanes=new WeakMap();
  #sourceAbort=new AbortController();
  #recorderTimer=null;
  #recorderAttempts=0;
  #lastRecoveryAtMs=0;
  #awaitingRecorderData=false;
  needsRestart=false;
  constructor({timeoutMs=CAPTURE_FRAME_TIMEOUT_MS,stageTimeoutMs=10000}={}){this.timeoutMs=timeoutMs;this.stageTimeoutMs=stageTimeoutMs;}
  diagnostics(){const track=this.stream?.getVideoTracks()[0];return {trackState:track?.readyState||'absent',trackMuted:track?.muted===true,recorderState:this.recorder?.state||(this.#recorderTimer!==null?'recovering':'absent'),recorderRecoveries:this.#recorderAttempts,visibility:globalThis.document?.visibilityState||'unknown',lastRecorderEventAgeMs:this.lastMediaEventAtMs===null?null:Math.max(0,performance.now()-this.lastMediaEventAtMs),needsRestart:this.needsRestart,lastRecorderIssue:this.lastRecorderIssue,lastStop:this.lastStop};}
  subscribe(listener){if(typeof listener!=='function')throw new TypeError('Capture listener must be a function');this.#listeners.add(listener);return ()=>this.#listeners.delete(listener);}
  #emit(event){for(const listener of [...this.#listeners])try{Promise.resolve(listener({...event,active:this.active,orientationEpoch:this.orientationEpoch})).catch(()=>{});}catch{}}
  stream=null;
  recorder=null;
  lastMediaEventAtMs=null;
  lastRecorderIssue=null;
  lastStop=null;
  orientationEpoch=0;
  dimensions=null;
  imageSettings=normalizeImageSettings();
  configure(settings){this.imageSettings=normalizeImageSettings(settings);}
  get active(){return Boolean(this.stream?.getVideoTracks().some(t=>t.readyState==='live'));}
  #startRecorder(stream){
    const recorder=new MediaRecorder(stream,MediaRecorder.isTypeSupported('video/mp4')?{mimeType:'video/mp4'}:{});this.recorder=recorder;
    recorder.ondataavailable=event=>{
      if(this.stream!==stream||this.recorder!==recorder)return;this.lastMediaEventAtMs=performance.now();
      if(event?.data?.size>0){if(this.#awaitingRecorderData){this.#awaitingRecorderData=false;this.#emit({type:'recorder_recovered',attempt:this.#recorderAttempts});}if(this.#recorderAttempts&&performance.now()-this.#lastRecoveryAtMs>=60000)this.#recorderAttempts=0;}
    };
    recorder.onerror=event=>this.#recoverRecorder(stream,recorder,'recorder_error',event?.error);
    recorder.onstop=()=>this.#recoverRecorder(stream,recorder,'recorder_stopped');
    recorder.start(1000);
  }
  #recoverRecorder(stream,recorder,reason,error){
    if(this.stream!==stream||this.recorder!==recorder)return;
    this.lastRecorderIssue={at:Date.now(),reason,recorderState:recorder?.state||'absent',trackState:stream.getVideoTracks()[0]?.readyState||'absent',visibility:globalThis.document?.visibilityState||'unknown',...(error?{errorName:String(error.name||'Error').slice(0,100),errorMessage:String(error.message||'').slice(0,500)}:{})};
    this.recorder=null;if(recorder){recorder.onerror=recorder.onstop=recorder.ondataavailable=null;if(recorder.state!=='inactive')try{recorder.stop();}catch{}}
    if(!this.active){this.stop('track_ended');return;}
    if(this.#recorderAttempts>=3){this.stop('recorder_recovery_exhausted');return;}
    this.#recorderAttempts++;this.#lastRecoveryAtMs=performance.now();this.#awaitingRecorderData=true;
    const delay=[0,250,1000][this.#recorderAttempts-1];
    this.#recorderTimer=setTimeout(()=>{this.#recorderTimer=null;if(this.stream!==stream)return;if(!this.active){this.stop('track_ended');return;}try{this.#startRecorder(stream);}catch(cause){this.#recoverRecorder(stream,this.recorder,'recorder_start_failed',cause);}},delay);
    this.#emit({type:'recorder_recovering',reason,attempt:this.#recorderAttempts});
  }
  async start(){
    if(!navigator.mediaDevices?.getDisplayMedia)throw new Error('此浏览器没有屏幕共享能力；请使用支持的 Safari');
    this.stop('source_replaced');const stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});this.stop('source_replaced');this.stream=stream;this.#sourceAbort=new AbortController();this.needsRestart=false;this.lastMediaEventAtMs=null;this.#recorderAttempts=0;this.#awaitingRecorderData=false;this.orientationEpoch++;this.dimensions=null;
    try{
      if(!globalThis.MediaRecorder)throw new Error('缺少本项目已验证后台路径所需的媒体录制能力');
      // Keep the same recording conditions as the physical probe, without
      // retaining a growing video. This does not guarantee background life.
      this.#startRecorder(stream);
      stream.getVideoTracks()[0].addEventListener('ended',()=>{if(this.stream===stream)this.stop('track_ended');},{once:true});
      this.#emit({type:'started'});
      return this.stream;
    }catch(e){this.stop('capture_start_failed',e);throw e;}
  }
  stop(reason='user_stopped',error){
    const stream=this.stream,recorder=this.recorder;if(!stream&&!recorder)return;
    this.lastStop={at:Date.now(),reason,trackState:stream?.getVideoTracks()[0]?.readyState||'absent',recorderState:recorder?.state||'absent',visibility:globalThis.document?.visibilityState||'unknown',...(error?{errorName:String(error.name||'Error').slice(0,100),errorMessage:String(error.message||'').slice(0,500)}:{})};
    clearTimeout(this.#recorderTimer);this.#recorderTimer=null;this.#awaitingRecorderData=false;
    // Fence async frame readers before recorder/track callbacks can re-enter.
    this.stream=null;this.recorder=null;this.needsRestart=false;this.lastMediaEventAtMs=null;this.orientationEpoch++;this.dimensions=null;this.#sourceAbort.abort(Object.assign(new Error('Screen sharing changed or stopped'),{code:'CAPTURE_SOURCE_CHANGED'}));
    if(recorder&&recorder.state!=='inactive')try{recorder.stop();}catch{}
    for(const track of stream?.getTracks()||[])try{track.stop();}catch{}
    this.#emit({type:'stopped',reason});
  }
  async grab({signal,targetId,deadlineAtMs,onDiagnostic}={}){
    checkAbort(signal);
    if(!this.active)throw new Error('请先主动开始屏幕共享');
    if(this.needsRestart)throw Object.assign(new Error('Share your screen again to resume capture'),{code:'CAPTURE_RESTART_REQUIRED'});
    if(!globalThis.ImageCapture)throw new Error('此浏览器没有已验证的单帧读取路径');
    const stream=this.stream,track=stream.getVideoTracks()[0];
    if(this.#lanes.has(track))throw Object.assign(new Error('A screen capture is already pending'),{code:'CAPTURE_BUSY'});
    const lane={native:false,encode:false,finished:false};this.#lanes.set(track,lane);
    const release=()=>{if(lane.finished&&!lane.native&&!lane.encode&&this.#lanes.get(track)===lane)this.#lanes.delete(track);};
    const abandoned=()=>{if((lane.native||lane.encode)&&this.stream===stream&&track.readyState==='live'){this.needsRestart=true;this.#emit({type:'restart_required',reason:lane.native?'native_frame_stalled':'encoder_stalled'});}};
    const sourceSignal=AbortSignal.any([this.#sourceAbort.signal,...(signal?[signal]:[])]);
    const current=()=>{checkAbort(sourceSignal);if(this.stream!==stream||track.readyState!=='live')throw Object.assign(new Error('Screen sharing changed or stopped; discard the late frame'),{code:'CAPTURE_SOURCE_CHANGED'});};
    const requestedAtMs=performance.now(),end=Math.min(Number.isFinite(deadlineAtMs)?deadlineAtMs:Infinity,requestedAtMs+this.timeoutMs);
    const stage=(name,operation,extra={})=>boundedCaptureStage(operation,{signal:sourceSignal,deadlineAtMs:end,timeoutMs:this.stageTimeoutMs,stage:name,onDiagnostic,details:()=>this.diagnostics(),onAbandon:abandoned,...extra});
    let bitmap=null,canvas=null,reader=null,sourceWidth,sourceHeight,width,height,scale,frameEpoch;
    try{
      bitmap=await stage('native_frame',()=>{
        current();lane.native=true;let native;
        try{native=new ImageCapture(track).grabFrame();}catch(error){lane.native=false;throw error;}
        return Promise.resolve(native).finally(()=>{lane.native=false;release();});
      },{onLate:value=>value?.close?.()});
      try{
        current();const dimensions=bitmap.width+'x'+bitmap.height;if(this.dimensions&&this.dimensions!==dimensions)this.orientationEpoch++;this.dimensions=dimensions;frameEpoch=this.orientationEpoch;
        sourceWidth=bitmap.width;sourceHeight=bitmap.height;({width,height,scale}=fitImage(sourceWidth,sourceHeight));
        canvas=new OffscreenCanvas(width,height);canvas.getContext('2d').drawImage(bitmap,0,0,width,height);
      }finally{bitmap.close();bitmap=null;}
      const quality=this.imageSettings.quality;
      const blob=await stage('encode',()=>{current();lane.encode=true;let encoded;try{encoded=canvas.convertToBlob({type:'image/jpeg',quality});}catch(error){lane.encode=false;throw error;}return Promise.resolve(encoded).finally(()=>{lane.encode=false;release();});});current();
      canvas.width=canvas.height=0;canvas=null;
      if(blob.size>5000000)throw Object.assign(new Error('JPEG image is too large; choose a lower image quality preset in Settings and try again'),{code:'CAPTURE_IMAGE_TOO_LARGE'});
      const dataUrl=await stage('read',()=>new Promise((resolve,reject)=>{reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error||new Error('Image read failed'));reader.onabort=()=>reject(new DOMException('Image read cancelled','AbortError'));reader.readAsDataURL(blob);}),{onAbandon:()=>{try{reader?.abort?.();}catch{}}});current();
      return {frameId:crypto.randomUUID(),targetId,orientationEpoch:frameEpoch,requestedAtMs,readyAtMs:performance.now(),mediaTimeMs:null,width,height,sourceWidth,sourceHeight,scale,quality,compressedBytes:blob.size,mimeType:'image/jpeg',blob,dataUrl};
    }finally{
      if(bitmap)bitmap.close();if(canvas){canvas.width=canvas.height=0;canvas=null;}
      if(reader){reader.onload=reader.onerror=reader.onabort=null;reader=null;}
      lane.finished=true;release();
    }
  }
}
export const screenCapture=new ScreenCapture();
