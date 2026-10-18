import {isLocalDeviceHost} from '../core/device.js';
export function localProbeURL(value){const u=new URL(value);if(u.protocol!=='http:'||!isLocalDeviceHost(u.hostname)||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('请输入本地 HTTP 地址，例如 http://igent.local');return u.origin;}
export async function permissionSnapshot(permissions=globalThis.navigator?.permissions,timeoutMs=1500){
 return Promise.all(['local-network','loopback-network'].map(async name=>{let timer;try{
  if(!permissions?.query)return {name,supported:false};
  const timedOut=new Promise(resolve=>{timer=setTimeout(()=>resolve(null),timeoutMs);});
  const result=await Promise.race([permissions.query({name}),timedOut]);
  return result?{name,supported:true,state:result.state}:{name,supported:null,state:'unknown',errorName:'TimeoutError'};
 }catch(error){return {name,supported:false,errorName:error.name};}finally{clearTimeout(timer);}}));
}
export async function probe(base,{method='GET',explicit=false,fetchImpl=fetch,signal,timeoutMs=8000,visibility=()=>globalThis.document?.visibilityState||'unknown',nonce=crypto.randomUUID()}={}){
 const origin=localProbeURL(base);if(!['GET','POST'].includes(method))throw Error('Invalid probe method');
 const started=performance.now(),controller=new AbortController(),cancel=()=>controller.abort(signal?.reason),timeout=setTimeout(()=>controller.abort(Error('请求超时')),timeoutMs);
 const row={method,explicitTargetAddressSpace:explicit,requestedVisibility:visibility(),requestedAt:new Date().toISOString(),path:method==='GET'?'/v1/identity':'/v1/probe'};let reader;
 signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
 try{
  // fetch begins immediately, before permission queries or any other await.
  const response=await fetchImpl(origin+row.path,{method,mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal,...(explicit?{targetAddressSpace:'local'}:{}),...(method==='POST'?{headers:{'content-type':'application/json'},body:JSON.stringify({probe:true,nonce})}:{})});
  row.httpReached=true;row.status=response.status;if(!response.ok)throw Error('HTTP '+response.status);
  reader=response.body?.getReader();if(!reader)throw Error('响应内容为空');let size=0,text='';const decoder=new TextDecoder();
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>16384)throw Error('响应内容过大');text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();
  const data=JSON.parse(text);if(!data||typeof data!=='object'||(method==='GET'&&(typeof data.boardId!=='string'||!data.boardId)))throw Error('响应不是设备标识');
  if(method==='POST'&&(data.probe!==true||data.nonce!==nonce||data.phoneInputSent!==false))throw Error('回传校验失败');
  row.passed=true;if(typeof data.boardId==='string')row.boardId=data.boardId;if(method==='POST'){row.nonceMatched=true;row.phoneInputSent=false;}
 }catch(error){row.passed=false;row.httpReached??=false;row.errorName=error.name;row.error=controller.signal.aborted?'请求已停止或超时':error.message;}
 finally{clearTimeout(timeout);signal?.removeEventListener('abort',cancel);try{await reader?.cancel();}catch{}try{reader?.releaseLock();}catch{}row.receivedAt=new Date().toISOString();row.receivedVisibility=visibility();row.elapsedMs=Math.round(performance.now()-started);}
 return row;
}
export async function foregroundProbe(base,{signal,permissions,onRow=()=>{},...options}={}){
 const first=probe(base,{timeoutMs:60000,...options,signal,explicit:true});
 const permission=permissionSnapshot(permissions);
 const rows=[];const add=row=>{rows.push(row);onRow(row);};add(await first);
 for(const config of [{explicit:false},{method:'POST',explicit:true}]){if(signal?.aborted)break;add(await probe(base,{timeoutMs:60000,...options,...config,signal}));}
 return {baseUrl:localProbeURL(base),tests:rows,permissions:await permission,passed:rows.length===3&&rows[0].passed&&rows[2].passed};
}
export function abortableDelay(ms,signal){return new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(Error('测试已停止'));};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();});}
export async function backgroundProbe(base,{signal,onRow=()=>{},delay=abortableDelay,...options}={}){
 const rows=[];for(let round=1;round<=5;round++){await delay(5000,signal);if(signal?.aborted)throw Error('测试已停止');const row={round,...await probe(base,{...options,signal,explicit:true})};rows.push(row);onRow(row);if(!row.passed)break;}
 return {tests:rows,passed:rows.length===5&&rows.every(row=>row.passed),allRequestedInBackground:rows.length===5&&rows.every(row=>row.requestedVisibility==='hidden')};
}
