import {checkAbort} from './control.js';
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
export class ScreenCapture {
  #listeners=new Set();
  subscribe(listener){if(typeof listener!=='function')throw new TypeError('Capture listener must be a function');this.#listeners.add(listener);return ()=>this.#listeners.delete(listener);}
  #emit(event){for(const listener of [...this.#listeners])try{Promise.resolve(listener({...event,active:this.active,orientationEpoch:this.orientationEpoch})).catch(()=>{});}catch{}}
  stream=null;
  recorder=null;
  lastMediaEventAtMs=null;
  orientationEpoch=0;
  dimensions=null;
  imageSettings=normalizeImageSettings();
  configure(settings){this.imageSettings=normalizeImageSettings(settings);}
  get active(){return Boolean(this.stream?.getVideoTracks().some(t=>t.readyState==='live'));}
  async start(){
    if(!navigator.mediaDevices?.getDisplayMedia)throw new Error('此浏览器没有屏幕共享能力；请使用支持的 Safari');
    this.stop();const stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});this.stop();this.stream=stream;this.orientationEpoch++;this.dimensions=null;
    try{
      if(!globalThis.MediaRecorder)throw new Error('缺少本项目已验证后台路径所需的媒体录制能力');
      this.recorder=new MediaRecorder(this.stream,MediaRecorder.isTypeSupported('video/mp4')?{mimeType:'video/mp4'}:{});
      // Keep the same recording conditions as the physical probe, without
      // retaining a growing video. This does not guarantee background life.
      this.recorder.ondataavailable=()=>{if(this.stream===stream)this.lastMediaEventAtMs=performance.now();};
      const recorder=this.recorder;
      recorder.onerror=()=>{if(this.recorder===recorder)this.stop('recorder_error');};
      recorder.onstop=()=>{if(this.recorder===recorder)this.stop('recorder_stopped');};
      this.recorder.start(1000);
      stream.getVideoTracks()[0].addEventListener('ended',()=>{if(this.stream===stream)this.stop('track_ended');},{once:true});
      this.#emit({type:'started'});
      return this.stream;
    }catch(e){this.stop();throw e;}
  }
  stop(reason='user_stopped'){
    const stream=this.stream,recorder=this.recorder;if(!stream&&!recorder)return;
    // Fence async frame readers before recorder/track callbacks can re-enter.
    this.stream=null;this.recorder=null;this.orientationEpoch++;this.dimensions=null;
    if(recorder&&recorder.state!=='inactive')try{recorder.stop();}catch{}
    for(const track of stream?.getTracks()||[])try{track.stop();}catch{}
    this.#emit({type:'stopped',reason});
  }
  async grab({signal,targetId}={}){
    checkAbort(signal);
    if(!this.active)throw new Error('请先主动开始屏幕共享');
    if(!globalThis.ImageCapture)throw new Error('此浏览器没有已验证的单帧读取路径');
    const stream=this.stream,track=stream.getVideoTracks()[0];
    const current=()=>{checkAbort(signal);if(this.stream!==stream||track.readyState!=='live'){const error=new Error('Screen sharing changed or stopped; discard the late frame');error.code='CAPTURE_SOURCE_CHANGED';throw error;}};
    const requestedAtMs=performance.now(),bitmap=await new ImageCapture(track).grabFrame();let canvas,sourceWidth,sourceHeight,width,height,scale,frameEpoch;
    try{
      current();const dimensions=bitmap.width+'x'+bitmap.height;if(this.dimensions&&this.dimensions!==dimensions)this.orientationEpoch++;this.dimensions=dimensions;frameEpoch=this.orientationEpoch;
      sourceWidth=bitmap.width;sourceHeight=bitmap.height;({width,height,scale}=fitImage(sourceWidth,sourceHeight));
      canvas=new OffscreenCanvas(width,height);canvas.getContext('2d').drawImage(bitmap,0,0,width,height);
    }finally{bitmap.close();}
    let quality=this.imageSettings.quality,blob=await canvas.convertToBlob({type:'image/jpeg',quality});current();
    if(blob.size>5000000)throw Object.assign(new Error('JPEG image is too large; choose a lower image quality preset in Settings and try again'),{code:'CAPTURE_IMAGE_TOO_LARGE'});
    const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});current();
    return {frameId:crypto.randomUUID(),targetId,orientationEpoch:frameEpoch,requestedAtMs,readyAtMs:performance.now(),mediaTimeMs:null,width,height,sourceWidth,sourceHeight,scale,quality,compressedBytes:blob.size,mimeType:'image/jpeg',blob,dataUrl};
  }
}
export const screenCapture=new ScreenCapture();
