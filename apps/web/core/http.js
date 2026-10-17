import {abortable,checkAbort} from './control.js';
// Enforce limits while reading, before allocating an unbounded text/ArrayBuffer.
export async function readBytes(response,{maxBytes=2000000,signal}={}){
  checkAbort(signal);const limitError=()=>Object.assign(new Error('Response exceeded its size limit'),{code:'RESPONSE_TOO_LARGE'});
  if(Number(response.headers?.get('content-length'))>maxBytes){await response.body?.cancel?.().catch(()=>{});throw limitError();}
  if(!response.body)return new Uint8Array();
  const reader=response.body.getReader(),chunks=[];let length=0;
  try{while(true){const {done,value}=await abortable(reader.read(),signal);checkAbort(signal);if(done)break;length+=value.byteLength;if(length>maxBytes)throw limitError();chunks.push(value);}const result=new Uint8Array(length);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.byteLength;}return result;}
  finally{try{await reader.cancel();}catch{}reader.releaseLock();}
}
export async function readText(response,options){return new TextDecoder('utf-8',{fatal:true}).decode(await readBytes(response,options));}
