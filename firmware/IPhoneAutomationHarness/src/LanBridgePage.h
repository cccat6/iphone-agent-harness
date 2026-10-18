#pragma once
#include "HtmlJson.h"
namespace iah {
// Static same-origin LAN bridge. The configured Harness origin is inserted as JSON.
static const char LanBridgePageStart[]=R"HTML(<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="referrer" content="no-referrer"><title>iPhone Agent Harness · Device connection</title><style>body{font:17px system-ui;max-width:32rem;margin:3rem auto;padding:1.2rem;color-scheme:light dark}button{font:inherit;padding:.8rem 1rem}p{line-height:1.6}</style><h1>Device connection</h1><p id="status">Keep this tab open, then return to Harness.</p><button id="back">Return to Harness</button><script>
const harnessOrigin=)HTML";
static const char LanBridgePageEnd[]=R"HTML(;
const query=new URLSearchParams(location.hash.slice(1)),nonce=query.get('nonce'),pending=new Map();
/*iah-localization-start*/const pageMessages={"en":["Device connection","Keep this tab open, then return to Harness.","Return to Harness","Open this page from Connect a device in Harness."],"zh-Hans":["设备连接","保持此标签页打开，然后返回 Harness。","返回 Harness","请在 Harness 的“连接设备”中打开此页面。"],"zh-Hant":["裝置連接","保持此分頁開啟，然後返回 Harness。","返回 Harness","請從 Harness 的「連接裝置」開啟此頁面。"],"ja":["デバイス接続","このタブを開いたまま Harness に戻ってください。","Harness に戻る","Harness の「デバイスを接続」から開いてください。"],"ru":["Подключение устройства","Оставьте вкладку открытой и вернитесь в Harness.","Вернуться в Harness","Откройте эту страницу через подключение устройства в Harness."],"de":["Geräteverbindung","Lass diesen Tab geöffnet und kehre zu Harness zurück.","Zurück zu Harness","Öffne diese Seite über „Gerät verbinden“ in Harness."],"fr":["Connexion de l’appareil","Gardez cet onglet ouvert et revenez à Harness.","Retour à Harness","Ouvrez cette page via « Connecter un appareil » dans Harness."],"es":["Conexión del dispositivo","Deja esta pestaña abierta y vuelve a Harness.","Volver a Harness","Abre esta página desde «Conectar dispositivo» en Harness."]};function choosePageLanguage(messages,forced){for(const raw of [forced,...(navigator.languages||[]),navigator.language]){if(typeof raw!=='string')continue;const tag=raw.toLowerCase().replaceAll('_','-');const code=tag.startsWith('zh')?(/hant|-(tw|hk|mo)(-|$)/.test(tag)?'zh-Hant':'zh-Hans'):tag.split('-')[0];if(Object.hasOwn(messages,code))return code;}return 'en';}/*iah-localization-end*/
const language=choosePageLanguage(pageMessages,query.get('lang')),copy=pageMessages[language];document.documentElement.lang=language;document.title='iPhone Agent Harness · '+copy[0];document.querySelector('h1').textContent=copy[0];document.querySelector('#status').textContent=copy[1];document.querySelector('#back').textContent=copy[2];
const instance=Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
history.replaceState(null,'',location.pathname);const parent=window.opener;
const active=parent&&/^[a-f0-9]{32}$/.test(nonce||'');
const send=value=>{if(active)parent.postMessage({nonce,instance,...value},harnessOrigin);};
const allowed=(method,path)=>method==='GET'?/^\/v1\/(identity|capabilities|clock|binding)$/.test(path)||/^\/v1\/targets\/[A-Za-z0-9][A-Za-z0-9._:-]{0,79}\/results\/[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(path):method==='POST'&&(path==='/v1/pair'||/^\/v1\/targets\/[A-Za-z0-9][A-Za-z0-9._:-]{0,79}\/(segments|release|cancel|challenge\/(start|confirm)|leases\/(claim|renew))$/.test(path));
document.querySelector('#back').onclick=()=>{if(active)parent.focus();};
if(!active)document.querySelector('#status').textContent=copy[3];
addEventListener('message',async event=>{
 if(!active||event.source!==parent||event.origin!==harnessOrigin||event.data?.nonce!==nonce)return;
 const data=event.data;if(typeof data.id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/.test(data.id))return;
 if(data.type==='iah-lan-cancel'){pending.get(data.id)?.abort();return;}
 if(data.type!=='iah-lan-request'||!allowed(data.method,data.path)||typeof data.body!=='string'||new TextEncoder().encode(data.body).length>8192||!data.headers||typeof data.headers!=='object'||Array.isArray(data.headers))return;
 if(pending.size>=8||pending.has(data.id)){send({type:'iah-lan-response',id:data.id,error:'busy'});return;}
 const headers={'X-Harness-Window':'1'};
 for(const [name,value] of Object.entries(data.headers)){if(!['accept','content-type','authorization','x-request-id'].includes(name)||typeof value!=='string'||value.length>512||/[\r\n]/.test(value))return;headers[name]=value;}
 const controller=new AbortController();pending.set(data.id,controller);const timer=setTimeout(()=>controller.abort(),8000);
 try{
  const response=await fetch(data.path,{method:data.method,headers,body:data.method==='POST'?data.body:undefined,signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'});
  const reader=response.body?.getReader();let bytes=0,text='',decoder=new TextDecoder('utf-8',{fatal:true});
  if(reader){try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>262144){await reader.cancel();throw Error('response too large');}text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}}
  send({type:'iah-lan-response',id:data.id,status:response.status,body:text,helperVisibility:document.visibilityState});
 }catch(error){send({type:'iah-lan-response',id:data.id,error:controller.signal.aborted?'cancelled':'connection_failed',helperVisibility:document.visibilityState});}
 finally{clearTimeout(timer);pending.delete(data.id);}
});
addEventListener('pagehide',()=>{for(const controller of pending.values())controller.abort();pending.clear();send({type:'iah-lan-closed'});});
document.addEventListener('visibilitychange',()=>send({type:'iah-lan-ready',helperVisibility:document.visibilityState}));
send({type:'iah-lan-ready',helperVisibility:document.visibilityState});
</script>)HTML";
template<class Text> Text renderLanBridgePage(const Text& origin){return renderHtmlJson(LanBridgePageStart,origin,LanBridgePageEnd);}

}
