import {RecordDecoder} from './protocol.mjs';
const $=id=>document.getElementById(id), rows=[], clientId=crypto.randomUUID();
let stream, recorder, capture, frameTimer, active, runId='', frames=0, lastFrameAt=0;
const base=new URL('.',location.href), mono=()=>Math.round(performance.now()*10)/10;
function event(event,detail={}) {
  const row={clientId,run:runId,event,at:mono(),wall:Date.now(),visibility:document.visibilityState,frames,...detail};
  rows.push(row); if(rows.length>10000) rows.shift();
  $('log').textContent=rows.slice(-35).map(r=>JSON.stringify(r)).join('\n');
  const allowed={...row}; delete allowed.error;
  // Endpoint receives metadata only. Fetch errors do not recursively generate new events.
  fetch(new URL('metadata',base),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(allowed),keepalive:true}).catch(()=>{});
}
function failReason(e) { return e?.name==='AbortError'?'aborted':e?.message==='missing-terminal-marker'?'missing-terminal-marker':e?.message==='truncated-record'?'truncated-record':'network-or-protocol-error'; }
document.addEventListener('visibilitychange',()=>event('visibility'));
window.addEventListener('pagehide',()=>event('pagehide'));
window.addEventListener('pageshow',()=>event('pageshow'));
async function takeFrame(){
  if(!stream?.active || !capture) return;
  const at=mono();
  try { const bitmap=await capture.grabFrame(); frames++; event('frame',{elapsed:mono()-at,width:bitmap.width,height:bitmap.height}); bitmap.close(); lastFrameAt=mono(); }
  catch(e){event('frame-error',{reason:e.name});}
  if(stream?.active) frameTimer=setTimeout(takeFrame,3000);
}
$('share').onclick=async()=>{
  try {
    clearTimeout(frameTimer); if(recorder?.state==='recording') recorder.stop(); stream?.getTracks().forEach(t=>t.stop());
    stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});
    $('preview').srcObject=stream;
    const track=stream.getVideoTracks()[0];
    ['ended','mute','unmute'].forEach(name=>track.addEventListener(name,()=>event('track-'+name)));
    if(typeof ImageCapture==='function'){capture=new ImageCapture(track); takeFrame();}
    if(typeof MediaRecorder==='function'){
      recorder=new MediaRecorder(stream);
      recorder.ondataavailable=e=>event('media-data',{bytes:e.data.size});
      recorder.onerror=()=>event('media-error'); recorder.start(3000);
    }
    event('share-start'); $('state').textContent='共享已开始。点测试后立即切到时钟等 App；测试期间不要锁屏。';
  }catch(e){event('share-error',{reason:e.name});$('state').textContent='共享失败：'+e.name;}
};
async function request(test,body,signal,endpoint=new URL('mock',base),headers={}){
  const at=mono(); let chunks=0,bytes=0,records=0;
  event('request-start',{test,protocol:body.protocol||body.kind,stream:body.stream??body.kind!=='json'});
  try{
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal});
    event('headers',{test,status:response.status,elapsed:mono()-at});
    if(!response.ok) throw new Error('http-error');
    if(body.kind==='json' || body.stream===false){
      const text=await response.text(); bytes=new TextEncoder().encode(text).length; JSON.parse(text); records=1;
    }else{
      const parser=new RecordDecoder(body.kind==='ndjson'?'ndjson':'sse',()=>records++),reader=response.body.getReader();
      while(true){const {done,value}=await reader.read(); if(done)break; chunks++;bytes+=value.byteLength;parser.push(value);event('chunk-read',{test,chunks,bytes,records,elapsed:mono()-at});}
      parser.finish();
    }
    event('request-complete',{test,chunks,bytes,records,elapsed:mono()-at,ok:true});return true;
  }catch(e){event('request-failed',{test,chunks,bytes,records,elapsed:mono()-at,reason:failReason(e),ok:false});return false;}
}
const suites={
  basic:[{test:'json-30',kind:'json',delay:30},{test:'openai-sse-30',kind:'openai',count:7,interval:5},{test:'anthropic-sse-30',kind:'anthropic',count:7,interval:5},{test:'idle-60',kind:'openai',delay:60,count:2,interval:1}],
  delays:[10,30,60,120].map(delay=>({test:'json-'+delay,kind:'json',delay})),
  five:Array.from({length:5},(_,i)=>({test:'round-'+(i+1),kind:i%2?'anthropic':'openai',delay:10,count:3,interval:1})),
  edges:[{test:'fragmented-utf8',kind:'fragment',count:8,interval:1},{test:'ndjson',kind:'ndjson',count:6,interval:1},{test:'idle-30',kind:'openai',delay:30,count:2,interval:1},{test:'expected-interruption',kind:'interrupt',count:3,interval:1}]
};
async function suite(name){
  if(active){$('state').textContent='已有测试运行，请先停止。';return;}
  runId=crypto.randomUUID(); active=new AbortController(); const signal=active.signal;
  event('suite-start',{test:name});$('state').textContent='运行中：'+name+'。请立即切到其他 App，约3分钟后返回。';
  try{for(const test of suites[name]){if(signal.aborted)break;await request(test.test,{...test,run:runId},signal);}event('suite-end',{test:name,reason:signal.aborted?'aborted':'finished'});}
  finally{active=null;$('state').textContent='测试结束，可导出元数据。屏幕共享保持开启，点停止结束。';}
}
$('run').onclick=()=>suite('basic');
document.querySelectorAll('[data-suite]').forEach(b=>b.onclick=()=>suite(b.dataset.suite));
$('stop').onclick=()=>{active?.abort();clearTimeout(frameTimer);if(recorder?.state==='recording')recorder.stop();stream?.getTracks().forEach(t=>t.stop());event('stopped');};
$('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,events:rows},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='background-metadata.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
async function real(streaming){
  if(active)return; let endpoint;
  try{endpoint=new URL($('endpoint').value);if(endpoint.protocol!=='https:')throw 0;}catch{ $('state').textContent='请输入完整 HTTPS endpoint';return; }
  if(!$('model').value||!$('key').value){$('state').textContent='请填写模型和 Key；仅当前页面内存使用。';return;}
  runId=crypto.randomUUID();active=new AbortController();const protocol=$('protocol').value;
  const body={model:$('model').value,stream:streaming,messages:[{role:'user',content:'Reply with the numbers 1 through 20 in order, one per line. This is a transport test.'}],max_tokens:160};
  const headers=protocol==='anthropic'?{'x-api-key':$('key').value,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'}:{Authorization:'Bearer '+$('key').value};
  event('real-start',{protocol,stream:streaming,hasKey:true});
  try{await request('real-'+protocol+(streaming?'-stream':'-json'),body,active.signal,endpoint,headers);}
  finally{active=null;$('state').textContent='真实请求结束。失败可能是 CORS、服务端或网络，需独立诊断。';}
}
$('deepseekpreset').onclick=()=>{$('endpoint').value='https://api.deepseek.com/chat/completions';$('model').value='deepseek-flash';$('protocol').value='openai';};
function backgroundGate(signal){
  return new Promise((resolve,reject)=>{
    let timer;const timeout=setTimeout(()=>finish(false),60000);
    const change=()=>{if(document.visibilityState==='hidden'&&!timer)timer=setTimeout(()=>finish(true),5000);else if(document.visibilityState!=='hidden'){clearTimeout(timer);timer=undefined;}};
    const abort=()=>finish(false);
    function finish(ok){clearTimeout(timeout);clearTimeout(timer);document.removeEventListener('visibilitychange',change);signal.removeEventListener('abort',abort);ok?resolve():reject(new DOMException('Stopped','AbortError'));}
    document.addEventListener('visibilitychange',change);signal.addEventListener('abort',abort,{once:true});change();
  });
}
$('realboth').onclick=async()=>{
  if(active)return;
  if(!stream?.active){await $('share').onclick();if(!stream?.active)return;}
  $('deepseekpreset').click();runId=crypto.randomUUID();active=new AbortController();const signal=active.signal;
  event('real-suite-start',{test:'deepseek-dual-protocol'});$('state').textContent='请立即切到其他 App，保持解锁约30秒；自动在后台开始四个真实请求。';
  try{
    const key=$('key').value; if(!key)throw new Error('manual-test-key-required');
    await backgroundGate(signal);event('real-background-gate');
    for(const protocol of ['openai','anthropic'])for(const streaming of [false,true]){
      if(signal.aborted)break;
      const endpoint=protocol==='openai'?'https://api.deepseek.com/chat/completions':'https://api.deepseek.com/anthropic/v1/messages';
      const headers=protocol==='anthropic'?{'x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'}:{Authorization:'Bearer '+key};
      const body={model:'deepseek-flash',stream:streaming,messages:[{role:'user',content:'Transport test. Reply only with the numbers 1 through 20, one per line.'}],max_tokens:160};
      await request('real-deepseek-'+protocol+(streaming?'-stream':'-json'),body,signal,endpoint,headers);
    }
    event('real-suite-end',{test:'deepseek-dual-protocol',reason:signal.aborted?'aborted':'finished'});
  }catch(e){event('real-suite-error',{reason:failReason(e)});}
  finally{active=null;$('state').textContent='真实四轮结束。请停止共享；不会发送操作指令。';}
};
$('realstream').onclick=()=>real(true);$('realjson').onclick=()=>real(false);
event('ready',{secure:isSecureContext,screenAPI:typeof navigator.mediaDevices?.getDisplayMedia,recorderAPI:typeof MediaRecorder});$('state').textContent='准备完成。点首个“后台真实四轮”按钮即可自动开启共享并运行。';
