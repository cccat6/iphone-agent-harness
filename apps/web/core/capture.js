import {checkAbort} from './control.js';
export function normalizeImageSettings(input={}){const maxSide=Number(input.maxSide??1280),quality=Number(input.quality??.72);if(!Number.isInteger(maxSide)||maxSide<320||maxSide>4096||!Number.isFinite(quality)||quality<.2||quality>.95)throw new Error('图片设置需为320–4096像素、0.2–0.95质量');return {maxSide,quality};}
export function fitImage(width,height,maxSide){const scale=Math.min(1,maxSide/Math.max(width,height));return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale)),scale};}
export class ScreenCapture {
  #listeners=new Set();
  subscribe(listener){if(typeof listener!=='function')throw new TypeError('Capture listener must be a function');this.#listeners.add(listener);return ()=>this.#listeners.delete(listener);}
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
      this.recorder.start(1000);
      stream.getVideoTracks()[0].addEventListener('ended',()=>{if(this.stream===stream)this.stop();},{once:true});
      return this.stream;
    }catch(e){this.stop();throw e;}
  }
  stop(){
    const stream=this.stream,recorder=this.recorder;if(!stream&&!recorder)return;
    // Fence async frame readers before recorder/track callbacks can re-enter.
    this.stream=null;this.recorder=null;this.orientationEpoch++;this.dimensions=null;
    if(recorder&&recorder.state!=='inactive')try{recorder.stop();}catch{}
    for(const track of stream?.getTracks()||[])try{track.stop();}catch{}
    const event={type:'stopped',orientationEpoch:this.orientationEpoch};for(const listener of [...this.#listeners])try{Promise.resolve(listener(event)).catch(()=>{});}catch{}
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
      sourceWidth=bitmap.width;sourceHeight=bitmap.height;({width,height,scale}=fitImage(sourceWidth,sourceHeight,this.imageSettings.maxSide));
      canvas=new OffscreenCanvas(width,height);canvas.getContext('2d').drawImage(bitmap,0,0,width,height);
    }finally{bitmap.close();}
    let quality=this.imageSettings.quality,blob=await canvas.convertToBlob({type:'image/jpeg',quality});current();
    for(let i=0;blob.size>1500000&&i<2;i++){quality=Math.max(.2,quality*.7);blob=await canvas.convertToBlob({type:'image/jpeg',quality});current();}
    if(blob.size>5000000)throw new Error('压缩后图片仍然过大');
    const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});current();
    return {frameId:crypto.randomUUID(),targetId,orientationEpoch:frameEpoch,requestedAtMs,readyAtMs:performance.now(),mediaTimeMs:null,width,height,sourceWidth,sourceHeight,scale,quality,compressedBytes:blob.size,mimeType:'image/jpeg',blob,dataUrl};
  }
}
export const screenCapture=new ScreenCapture();
