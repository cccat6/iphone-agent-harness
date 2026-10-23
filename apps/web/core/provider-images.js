import {imageData} from './attachments.js';
import {readText} from './http.js';
import {checkAbort} from './control.js';
const disabled=new Map();
const expired=file=>!file||!Number.isFinite(file.expiresAt)||file.expiresAt<=Date.now()+60000;
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');
export function imageFileProvider(provider){
 if(provider?.reuseImages===false||!['openai','anthropic'].includes(provider?.protocol))return null;
 let url;try{url=new URL(provider.baseUrl);}catch{return null;}
 if(url.protocol!=='https:'||url.username||url.password)return null;
 if(url.hostname==='api.deepseek.com')return {kind:'deepseek',url:'https://api.deepseek.com/files'};
 if(provider.protocol==='anthropic'&&url.hostname==='api.anthropic.com')return {kind:'anthropic',url:'https://api.anthropic.com/v1/files'};
 return null;
}
function headersFor(config,credential,json=false){return config.kind==='deepseek'?{authorization:'Bearer '+credential,...(json?{accept:'application/json'}:{})}:{'x-api-key':credential,'anthropic-version':'2026-10-21','anthropic-dangerous-direct-browser-access':'true'};}
async function upload({config,credential,frame,signal,fetchImpl}){
 let blob=frame.blob;if(!blob&&frame.dataUrl){const match=/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(frame.dataUrl);if(!match)return null;blob=new Blob([Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0))],{type:match[1]});}
 if(!blob||blob.size>5000000)return null;
 const form=new FormData();form.set('file',blob,'screen.'+({ 'image/png':'png','image/webp':'webp','image/gif':'gif'}[blob.type]||'jpg'));
 if(config.kind==='deepseek'){form.set('purpose','user_data');form.set('expires_after[anchor]','created_at');form.set('expires_after[seconds]','3600');}else form.set('expires_in_seconds','3600');
 const response=await fetchImpl(config.url,{method:'POST',headers:headersFor(config,credential),body:form,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal});checkAbort(signal);
 if(!response.ok){await response.body?.cancel();throw Object.assign(new Error('PROVIDER_IMAGE_UPLOAD_FAILED'),{code:'PROVIDER_IMAGE_UPLOAD_FAILED',status:response.status});}
 const data=JSON.parse(await readText(response,{maxBytes:16000,signal})),expiresAt=typeof data.expires_at==='number'?data.expires_at*1000:Date.parse(data.expires_at);
 if(typeof data.id!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(data.id))throw new Error('PROVIDER_IMAGE_UPLOAD_INVALID');
 // Only use server-confirmed expiring files. A legacy endpoint that ignores
 // expiration is cleaned up immediately instead of retaining screenshots.
 if(!Number.isFinite(expiresAt)||expiresAt<=Date.now()+60000||expiresAt>Date.now()+3660000){
  const cleanup=await fetchImpl(config.url+'/'+encodeURIComponent(data.id),{method:'DELETE',headers:headersFor(config,credential),credentials:'omit',redirect:'error',signal});await cleanup.body?.cancel();return null;
 }
 return {fileId:data.id,expiresAt,bytes:blob.size};
}
export async function invalidateProviderImageReuse(provider,credential){const config=imageFileProvider(provider);if(config&&credential){const scope=await digest(config.url+'\n'+credential);disabled.set(scope+'::'+provider.model,Infinity);}}
// Resolve one local frame at a time. Only small provider file references remain
// in the request; original JPEGs stay in the browser's paginated asset store.
export async function hydrateProviderImages(messages,{store,provider,credential,signal,fetchImpl=globalThis.fetch,inlineLimit=12000000}={}){
 const config=imageFileProvider(provider),scope=config&&credential?await digest(config.url+'\n'+credential):null;
 let inlineBytes=0,uploadedBytes=0,uploaded=0,reused=0;
 for(const message of messages){
  if(!message.frameRefs?.length)continue;const images=[],parts=[];
  for(const ref of message.frameRefs){
   checkAbort(signal);const frame=await store.getFrame(ref);checkAbort(signal);if(!frame)throw new Error('Local screenshot asset is missing');
   const available=scope&&typeof store.saveFrameProviderFile==='function'&&(disabled.get(scope)||0)<Date.now()&&(disabled.get(scope+'::'+provider.model)||0)<Date.now();
   let file=available?frame.providerFiles?.[scope]:null;
   if(available&&expired(file)){
    try{file=await upload({config,credential,frame,signal,fetchImpl});checkAbort(signal);if(file){await store.saveFrameProviderFile(ref,scope,file);uploaded++;uploadedBytes+=file.bytes;}else disabled.set(scope,Date.now()+180000);}
    catch(error){checkAbort(signal);disabled.set(scope,Date.now()+180000);file=null;}
   }else if(!expired(file))reused++;
   if(!expired(file)){parts.push(provider.protocol==='anthropic'?{type:'image',source:{type:'file',file_id:file.fileId}}:{type:'file',file_id:file.fileId});continue;}
   const data=await imageData(frame);checkAbort(signal);if(!data)throw new Error('Local screenshot asset is missing');inlineBytes+=data.length;if(inlineBytes>inlineLimit)throw Object.assign(new Error('Context image transfer capacity reached'),{code:'CONTEXT_TRANSPORT_LIMIT'});images.push(data);parts.push(data);
  }
  message.images=images;message.providerImageParts=parts;
 }
 return Object.assign(messages,{imageTransfer:{uploaded,reused,uploadedBytes,inlineBytes}});
}
