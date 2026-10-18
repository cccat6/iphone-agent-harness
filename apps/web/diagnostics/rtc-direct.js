import {DirectProbeConnection,validateDirectConfig} from './rtc-direct-core.js';
import {abortableDelay} from './lna-core.js';
const $=selector=>document.querySelector(selector),connect=$('#connect'),captureConnect=$('#capture-connect'),background=$('#background'),stop=$('#stop'),status=$('#status');
let config=null,connection=null,active=null,stream=null,recorder=null,passed=false;
const report={pageOrigin:location.origin,isSecureContext,userAgent:navigator.userAgent,transport:'webrtc-direct-v2-json-echo',phoneInputSent:false,configuration:null,runs:[]};
function show(){ $('#result').textContent=JSON.stringify(report,null,2); }
function state(text,kind=''){status.textContent=text;status.dataset.state=kind;show();}
function controls(){const captureAvailable=Boolean(navigator.mediaDevices?.getDisplayMedia&&typeof MediaRecorder!=='undefined');connect.disabled=Boolean(active)||!config||typeof RTCPeerConnection==='undefined';captureConnect.disabled=Boolean(active)||!config||!captureAvailable||typeof RTCPeerConnection==='undefined';background.disabled=Boolean(active)||!passed||!connection?.ready||!captureAvailable;stop.disabled=!active&&!connection?.ready;}
function releaseCapture(){try{if(recorder?.state==='recording')recorder.stop();}catch{}recorder=null;for(const track of stream?.getTracks()||[])track.stop();stream=null;}
function closeConnection(){connection?.close();connection=null;passed=false;}
function cancel(){active?.abort();releaseCapture();closeConnection();controls();}
stop.onclick=()=>{cancel();state('测试已停止');};addEventListener('pagehide',cancel);
function newRun(capture){const run={startedAt:new Date().toISOString(),captureAtConnect:capture,foreground:[],background:[],states:[],recordingCallbacks:[]};report.runs.push(run);if(report.runs.length>8)report.runs.shift();return run;}
function createConnection(run){closeConnection();connection=new DirectProbeConnection(config,{onState:snapshot=>{for(const key of ['ice','dtls','channel'])$('#'+key).textContent=snapshot[key];run.states.push({at:new Date().toISOString(),...snapshot});if(run.states.length>30)run.states.shift();if(snapshot.closed&&!active&&passed){passed=false;run.disconnectedAt=new Date().toISOString();state('连接已断开，请重新连接。','fail');}controls();show();}});return connection;}
async function echoRound(peer,round){const requestedVisibility=document.visibilityState,requestedAt=new Date().toISOString();const result=await peer.echo();$('#echo').textContent=round+' 次成功';return {round,requestedAt,requestedVisibility,receivedAt:new Date().toISOString(),receivedVisibility:document.visibilityState,...result};}
async function checkRoute(peer,run){run.selectedCandidatePair=await peer.route();run.routeVerified=run.selectedCandidatePair.verified===true;if(!run.routeVerified)run.routeWarning='Safari 未提供完整路径统计；消息回传已单独验证。';else delete run.routeWarning;}
async function foreground(peer,run){await peer.open();for(let round=1;round<=3;round++)run.foreground.push(await echoRound(peer,round));await checkRoute(peer,run);run.foregroundPassed=true;show();}
async function backgroundRounds(peer,run,signal){state('连接已建立，请在时钟保持约 30 秒。');for(let round=1;round<=5;round++){await abortableDelay(5000,signal);if(signal.aborted)throw Error('测试已停止');run.background.push(await echoRound(peer,round));show();}await checkRoute(peer,run);run.backgroundPassed=run.background.length===5&&run.background.every(row=>row.requestedVisibility==='hidden');state(run.backgroundPassed?(run.routeVerified?'后台五轮回传成功，路径统计确认直连；已停止共享和连接。':'后台五轮回传成功；Safari 未提供完整路径统计。已停止共享和连接。'):'五轮回传成功，但并非全部在后台发起，不能计为后台通过。',run.backgroundPassed?'pass':'fail');}
connect.onclick=()=>{
 if(active||!config)return;const controller=new AbortController();active=controller;const run=newRun(false),peer=createConnection(run);controller.signal.addEventListener('abort',()=>peer.close(),{once:true});controls();state('正在建立 ICE、DTLS 和数据通道…');
 (async()=>{try{await foreground(peer,run);if(controller.signal.aborted)throw Error('测试已停止');passed=true;state(run.routeVerified?'三次回传成功，路径统计确认直连。可继续测试后台。':'三次回传成功；Safari 未提供完整路径统计。可继续测试后台。','pass');}catch(error){run.error=error.message;run.foregroundPassed=false;closeConnection();state('直连未通过：'+error.message,'fail');}finally{run.finishedAt=new Date().toISOString();if(active===controller)active=null;controls();show();}})();
};
function withCapture(reconnect){
 if(active||!config||(!reconnect&&(!passed||!connection?.ready)))return;
 const controller=new AbortController();active=controller;const run=newRun(reconnect?true:false);run.captureMode=reconnect?'capture-before-connect':'capture-after-connect';const peer=reconnect?createConnection(run):connection;controls();state('请同意共享屏幕，然后切到时钟。');
 let capture;try{capture=navigator.mediaDevices.getDisplayMedia({video:true,audio:false});}catch(error){run.error=error.message;active=null;closeConnection();controls();state(error.message,'fail');return;}
 const abort=()=>{releaseCapture();peer.close();};controller.signal.addEventListener('abort',abort,{once:true});const deadline=setTimeout(()=>controller.abort(),90000);
 (async()=>{try{stream=await capture;if(controller.signal.aborted){releaseCapture();throw Error('测试已停止');}for(const track of stream.getTracks())track.addEventListener('ended',()=>controller.abort(),{once:true});recorder=new MediaRecorder(stream);recorder.ondataavailable=event=>{if(controller.signal.aborted)return;run.recordingCallbacks.push({at:new Date().toISOString(),visibility:document.visibilityState,bytes:event.data.size});if(run.recordingCallbacks.length>40)run.recordingCallbacks.shift();};recorder.onerror=()=>controller.abort();recorder.start(1000);
 if(reconnect)await foreground(peer,run);await backgroundRounds(peer,run,controller.signal);
 }catch(error){run.error=error.message;run.backgroundPassed=false;state('共享测试未通过：'+error.message,'fail');}finally{clearTimeout(deadline);controller.signal.removeEventListener('abort',abort);releaseCapture();closeConnection();run.finishedAt=new Date().toISOString();if(active===controller)active=null;controls();show();}})();
}
captureConnect.onclick=()=>withCapture(true);background.onclick=()=>withCapture(false);
$('#copy').onclick=()=>{try{Promise.resolve(navigator.clipboard.writeText(JSON.stringify(report,null,2))).then(()=>$('#copy-status').textContent='已复制',()=>$('#copy-status').textContent='请展开详细结果手动复制。');}catch{$('#copy-status').textContent='请展开详细结果手动复制。';}};
async function loadConfiguration(){
 const hash=new URLSearchParams(location.hash.slice(1));let value;
 if(hash.has('config')){const encoded=hash.get('config');if(!encoded||encoded.length>2048||!/^[A-Za-z0-9_-]+$/.test(encoded))throw Error('配置片段无效');value=JSON.parse(atob(encoded.replaceAll('-','+').replaceAll('_','/')));}
 else if(hash.has('ip'))value={version:1,ip:hash.get('ip'),port:Number(hash.get('port')),fingerprint:hash.get('fingerprint')};
 else{const requested=new URLSearchParams(location.search).get('config')||'./rtc-direct-config.json',url=new URL(requested,location.href);if(url.origin!==location.origin||url.username||url.password||url.hash)throw Error('配置只能来自本站');const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);try{const response=await fetch(url,{credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal});if(!response.ok)throw Error('测试配置尚未就绪');const text=await response.text();if(text.length>8192)throw Error('测试配置过大');value=JSON.parse(text);}finally{clearTimeout(timer);}}
 if(value?.retired===true){config=null;report.configuration={retired:true};$('#endpoint').textContent='原型测试已结束，正式 C3 已使用新的控制协议。';state('请返回 Harness 连接 ESP32 桥。');controls();show();return;}
 config=validateDirectConfig(value);report.configuration=config;$('#endpoint').textContent=(typeof value.label==='string'?value.label.slice(0,80):'局域网测试端')+'：'+config.ip+':'+config.port+'（UDP）';state(typeof RTCPeerConnection==='undefined'?'此浏览器没有 WebRTC 接口。':'配置已就绪。');controls();
}
loadConfiguration().catch(error=>{state(error.message,'fail');controls();});show();controls();
