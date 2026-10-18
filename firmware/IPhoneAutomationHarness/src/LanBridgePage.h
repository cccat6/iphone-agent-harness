#pragma once
#include "HtmlJson.h"
namespace iah {
// Static same-origin LAN bridge. The configured Harness origin is inserted as JSON.
static const char LanBridgePageStart[]=R"HTML(<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="referrer" content="no-referrer"><title>iPhone Agent Harness · Device connection</title><style>body{font:17px system-ui;max-width:32rem;margin:3rem auto;padding:1.2rem;color-scheme:light dark}a{font:inherit;padding:.8rem 0;display:inline-block}a[hidden]{display:none}p{line-height:1.6}</style><h1>Device connection</h1><p id="status">Waiting for Harness to connect.</p><a id="back" hidden target="_blank" rel="noopener noreferrer">Open Harness</a><script>
const harnessOrigin=)HTML";
static const char LanBridgePageEnd[]=R"HTML(;
const query=new URLSearchParams(location.hash.slice(1)),nonce=query.get('nonce'),pending=new Map();
/*iah-localization-start*/const pageMessages={"en":["ESP32 bridge connection","The local channel is ready. Use Safari’s tab switcher to return to the original Harness tab. Keep this tab open.","Open Harness","This tab has no connection information. Open Harness and tap “Connect ESP32 bridge”.","Waiting for Harness to connect. Keep this tab open, then use Safari’s tab switcher to return to the original Harness tab."],"zh-Hans":["ESP32 桥连接","本地通道已准备。请用 Safari 标签页切换回原来的 Harness 页面，并保留本标签页。","打开 Harness","此标签页没有连接信息。请打开 Harness，点击“连接 ESP32 桥”。","正在等待 Harness 建立连接。请保留本标签页，用 Safari 标签页切换回原来的 Harness 页面。"],"zh-Hant":["ESP32 橋接器連線","本機通道已準備好。請用 Safari 分頁切換回原來的 Harness 頁面，並保留此分頁。","開啟 Harness","此分頁沒有連線資訊。請開啟 Harness，點選「連接 ESP32 橋接器」。","正在等待 Harness 建立連線。請保留此分頁，用 Safari 分頁切換回原來的 Harness 頁面。"],"ja":["ESP32 ブリッジ接続","ローカル接続の準備ができました。Safari のタブ一覧から元の Harness タブに戻ってください。このタブは開いたままにしてください。","Harness を開く","このタブには接続情報がありません。Harness を開き、「ESP32 ブリッジに接続」をタップしてください。","Harness からの接続を待っています。このタブを開いたまま、Safari のタブ一覧から元の Harness タブに戻ってください。"],"ru":["Подключение моста ESP32","Локальный канал готов. Через переключатель вкладок Safari вернитесь на исходную вкладку Harness. Оставьте эту вкладку открытой.","Открыть Harness","В этой вкладке нет данных подключения. Откройте Harness и нажмите «Подключить мост ESP32».","Ожидание подключения Harness. Оставьте эту вкладку открытой и через переключатель вкладок Safari вернитесь на исходную вкладку Harness."],"de":["ESP32-Bridge verbinden","Der lokale Kanal ist bereit. Wechsle über die Tabübersicht von Safari zum ursprünglichen Harness-Tab zurück. Lass diesen Tab geöffnet.","Harness öffnen","Dieser Tab enthält keine Verbindungsdaten. Öffne Harness und tippe auf „ESP32-Bridge verbinden“.","Warte auf die Verbindung mit Harness. Lass diesen Tab geöffnet und wechsle über die Tabübersicht von Safari zum ursprünglichen Harness-Tab zurück."],"fr":["Connexion du pont ESP32","Le canal local est prêt. Revenez à l’onglet Harness d’origine via le sélecteur d’onglets de Safari. Gardez cet onglet ouvert.","Ouvrir Harness","Cet onglet ne contient aucune information de connexion. Ouvrez Harness et touchez « Connecter le pont ESP32 ».","En attente de la connexion de Harness. Gardez cet onglet ouvert, puis revenez à l’onglet Harness d’origine via le sélecteur d’onglets de Safari."],"es":["Conexión del puente ESP32","El canal local está listo. Vuelve a la pestaña original de Harness con el selector de pestañas de Safari. Mantén esta pestaña abierta.","Abrir Harness","Esta pestaña no contiene información de conexión. Abre Harness y pulsa «Conectar puente ESP32».","Esperando la conexión de Harness. Mantén esta pestaña abierta y vuelve a la pestaña original de Harness con el selector de pestañas de Safari."]};function choosePageLanguage(messages,forced){for(const raw of [forced,...(navigator.languages||[]),navigator.language]){if(typeof raw!=='string')continue;const tag=raw.toLowerCase().replaceAll('_','-');const code=tag.startsWith('zh')?(/hant|-(tw|hk|mo)(-|$)/.test(tag)?'zh-Hant':'zh-Hans'):tag.split('-')[0];if(Object.hasOwn(messages,code))return code;}return 'en';}/*iah-localization-end*/
const language=choosePageLanguage(pageMessages,query.get('lang')),copy=pageMessages[language];document.documentElement.lang=language;document.title='iPhone Agent Harness · '+copy[0];document.querySelector('h1').textContent=copy[0];document.querySelector('#status').textContent=copy[1];document.querySelector('#back').textContent=copy[2];
const instance=Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
// The nonce is a window-routing identifier, not a credential. Keep it for reloads.
const validNonce=/^[a-f0-9]{32}$/.test(nonce||'');let parent=validNonce?window.opener:null;
const active=()=>validNonce&&parent;
const send=value=>{if(active())parent.postMessage({nonce,instance,...value},harnessOrigin);};
const allowed=(method,path)=>method==='GET'?/^\/v1\/(identity|capabilities|clock|binding)$/.test(path)||/^\/v1\/targets\/[A-Za-z0-9][A-Za-z0-9._:-]{0,79}\/results\/[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(path):method==='POST'&&(path==='/v1/pair'||/^\/v1\/targets\/[A-Za-z0-9][A-Za-z0-9._:-]{0,79}\/(segments|release|cancel|challenge\/(start|confirm)|leases\/(claim|renew))$/.test(path));
const showState=()=>{document.querySelector('#status').textContent=!validNonce?copy[3]:parent?copy[1]:copy[4];document.querySelector('#back').hidden=validNonce;};
document.querySelector('#back').href=harnessOrigin;showState();
addEventListener('message',async event=>{
 if(!validNonce||event.origin!==harnessOrigin||event.data?.nonce!==nonce||!event.source)return;
 const data=event.data;
 if(data.type==='iah-lan-connect'){if(parent&&event.source!==parent)return;parent=event.source;showState();send({type:'iah-lan-ready',helperVisibility:document.visibilityState});return;}
 if(!parent||event.source!==parent)return;
 if(typeof data.id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/.test(data.id))return;
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
