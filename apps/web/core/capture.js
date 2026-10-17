export class ScreenCapture {
  stream=null;
  recorder=null;
  lastMediaEventAtMs=null;
  get active(){return Boolean(this.stream?.getVideoTracks().some(t=>t.readyState==='live'));}
  async start(){
    if(!navigator.mediaDevices?.getDisplayMedia)throw new Error('此浏览器没有屏幕共享能力；请使用支持的 Safari');
    this.stop();this.stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});
    try{
      if(!globalThis.MediaRecorder)throw new Error('缺少本项目已验证后台路径所需的媒体录制能力');
      this.recorder=new MediaRecorder(this.stream,MediaRecorder.isTypeSupported('video/mp4')?{mimeType:'video/mp4'}:{});
      // Keep the same recording conditions as the physical probe, without
      // retaining a growing video. This does not guarantee background life.
      this.recorder.ondataavailable=()=>{this.lastMediaEventAtMs=performance.now();};
      this.recorder.start(1000);
      this.stream.getVideoTracks()[0].addEventListener('ended',()=>this.stop(),{once:true});
      return this.stream;
    }catch(e){this.stop();throw e;}
  }
  stop(){if(this.recorder&&this.recorder.state!=='inactive')try{this.recorder.stop();}catch{}this.recorder=null;for(const t of this.stream?.getTracks()||[])t.stop();this.stream=null;}
  async grab(){
    if(!this.active)throw new Error('请先主动开始屏幕共享');
    if(!globalThis.ImageCapture)throw new Error('此浏览器没有已验证的单帧读取路径');
    const requestedAtMs=performance.now();const bitmap=await new ImageCapture(this.stream.getVideoTracks()[0]).grabFrame();
    const width=Math.min(bitmap.width,1536),height=Math.round(bitmap.height*width/bitmap.width);
    const canvas=new OffscreenCanvas(width,height);canvas.getContext('2d').drawImage(bitmap,0,0,width,height);bitmap.close();
    const blob=await canvas.convertToBlob({type:'image/jpeg',quality:.8});
    const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});
    return {frameId:crypto.randomUUID(),requestedAtMs,readyAtMs:performance.now(),mediaTimeMs:null,width,height,blob,dataUrl};
  }
}
export const screenCapture=new ScreenCapture();
