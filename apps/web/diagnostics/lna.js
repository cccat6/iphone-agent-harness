import {localProbeURL,foregroundProbe,backgroundProbe} from './lna-core.js';
const $=selector=>document.querySelector(selector),address=$('#address'),run=$('#run'),background=$('#background'),stop=$('#stop'),target=$('#background-target'),status=$('#status'),summary=$('#summary');
let active=null,stream=null,recorder=null,successful=[],fixture='';
const report={pageOrigin:location.origin,isSecureContext,userAgent:navigator.userAgent,startedAt:null,foreground:[],background:null,phoneInputSent:false};
try{const requested=new URLSearchParams(location.search).get('fixture');if(requested){fixture=localProbeURL(requested);$('#fixture-note').hidden=false;$('#fixture-note').textContent='同时测试 Mac 网络对照：'+fixture;}}catch(error){status.textContent=error.message;}
function show(){ $('#result').textContent=JSON.stringify(report,null,2); }
function state(text,kind=''){status.textContent=text;status.dataset.state=kind;show();}
function controls(busy){run.disabled=busy;address.disabled=busy;stop.disabled=!busy;target.disabled=busy||!successful.length;background.disabled=busy||!successful.length||!navigator.mediaDevices?.getDisplayMedia||typeof MediaRecorder==='undefined';}
function releaseCapture(){try{if(recorder&&recorder.state!=='inactive')recorder.stop();}catch{}recorder=null;for(const track of stream?.getTracks()||[])track.stop();stream=null;}
function cancel(){active?.abort();releaseCapture();}
stop.onclick=cancel;addEventListener('pagehide',cancel);address.addEventListener('input',()=>{if(active)return;successful=[];target.replaceChildren();controls(false);});
run.onclick=()=>{
 if(active)return;let base;try{base=localProbeURL(address.value.trim());}catch(error){state(error.message,'fail');return;}
 const controller=new AbortController();active=controller;successful=[];target.replaceChildren();summary.replaceChildren();report.startedAt=new Date().toISOString();report.foreground=[];report.background=null;controls(true);state('正在测试 ESP32…');
 // Start both explicit-local requests synchronously in the same click activation.
 const destinations=[{name:'ESP32',base,promise:foregroundProbe(base,{signal:controller.signal})},...(fixture&&fixture!==base?[{name:'Mac 网络对照',base:fixture,promise:foregroundProbe(fixture,{signal:controller.signal})}]:[])];
 (async()=>{try{for(const destination of destinations){if(controller.signal.aborted)break;const result=await destination.promise;report.foreground.push({name:destination.name,...result});const li=document.createElement('li');li.textContent=destination.name+'：'+(result.passed?'直连成功':'直连失败')+'（'+result.tests.filter(row=>row.passed).length+'/3 项通过）';summary.append(li);if(result.passed){successful.push(destination.base);const option=document.createElement('option');option.value=destination.base;option.textContent=destination.name+' · '+destination.base;target.append(option);}show();}
 if(controller.signal.aborted)state('测试已停止');else{const primary=report.foreground[0];state(primary?.passed?'ESP32 直连成功，可继续测试后台。':successful.length?'ESP32 未通过；Mac 对照成功，浏览器已有局域网直连能力。':'直连未通过。请复制结果。',primary?.passed?'pass':'fail');}
 }catch(error){state(error.message,'fail');}finally{if(active===controller)active=null;controls(false);}})();
};
background.onclick=()=>{
 if(active||!successful.includes(target.value))return;const base=target.value,controller=new AbortController();active=controller;controls(true);report.background={baseUrl:base,startedAt:new Date().toISOString(),tests:[],recordingCallbacks:[]};state('同意共享屏幕后，请切到时钟约 30 秒。');
 let capture;try{capture=navigator.mediaDevices.getDisplayMedia({video:true,audio:false});}catch(error){active=null;controls(false);state(error.message,'fail');return;}
 const deadline=setTimeout(()=>controller.abort(),60000);controller.signal.addEventListener('abort',releaseCapture,{once:true});
 (async()=>{try{stream=await capture;if(controller.signal.aborted){releaseCapture();throw Error('测试已停止');}for(const track of stream.getTracks())track.addEventListener('ended',()=>controller.abort(),{once:true});recorder=new MediaRecorder(stream);recorder.ondataavailable=event=>{if(controller.signal.aborted)return;const callbacks=report.background.recordingCallbacks;callbacks.push({at:new Date().toISOString(),visibility:document.visibilityState,bytes:event.data.size});if(callbacks.length>35)callbacks.shift();};recorder.onerror=()=>controller.abort();recorder.start(1000);
 const result=await backgroundProbe(base,{signal:controller.signal,onRow:row=>{report.background.tests.push(row);show();}});Object.assign(report.background,result);report.background.finishedAt=new Date().toISOString();if(controller.signal.aborted)throw Error('测试已停止');state(result.passed?(result.allRequestedInBackground?'后台五轮直连成功，已停止共享。':'五轮连接成功，但未全部在后台发起；不能计为后台通过。'):'后台连接失败，已停止共享。',result.passed&&result.allRequestedInBackground?'pass':'fail');
 }catch(error){report.background.passed=false;report.background.error=error.message;report.background.finishedAt=new Date().toISOString();state('后台测试已停止：'+error.message,'fail');}finally{clearTimeout(deadline);controller.signal.removeEventListener('abort',releaseCapture);releaseCapture();if(active===controller)active=null;controls(false);show();}})();
};
$('#copy').onclick=()=>{const result=JSON.stringify(report,null,2);try{const copying=navigator.clipboard.writeText(result);Promise.resolve(copying).then(()=>$('#copy-status').textContent='已复制',()=>$('#copy-status').textContent='复制失败，请展开详细结果选取文字。');}catch{$('#copy-status').textContent='复制失败，请展开详细结果选取文字。';}};
show();controls(false);
