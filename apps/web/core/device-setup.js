import {createDeviceURL} from './device.js';
import {validateRTCConfiguration} from './device-rtc.js';
/** Setup links carry only the bridge address and identity, never an enrollment secret. */
export function parseDeviceSetupLink(value){
 const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)throw new Error('DEVICE_INVALID_URL');
 const encoded=new URLSearchParams(url.hash.slice(1)).get('device');if(!encoded||encoded.length>4096||!/^[A-Za-z0-9_-]+$/.test(encoded))throw new Error('DEVICE_INVALID_URL');
 let data;try{data=JSON.parse(atob(encoded.replaceAll('-','+').replaceAll('_','/')));}catch{throw new Error('DEVICE_INVALID_URL');}
 if(data?.v!==1||typeof data.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(data.id))throw new Error('DEVICE_INVALID_URL');
 const baseUrl=createDeviceURL(data.url);if(!baseUrl.startsWith('http:'))throw new Error('DEVICE_SETUP_UPGRADE_REQUIRED');
 return {baseUrl,boardId:data.id,...(data.rtc?{rtc:validateRTCConfiguration(data.rtc,{fallbackHost:new URL(baseUrl).hostname})}:{})};
}
export function createDeviceSetupLink(info,siteOrigin=globalThis.location?.protocol==='https:'?globalThis.location.origin:'https://igent.cc'){
 const url=new URL(siteOrigin);if(url.protocol!=='https:'||url.username||url.password)throw new Error('DEVICE_INVALID_URL');
 const data={v:1,url:createDeviceURL(info.httpUrl||info.httpsUrl),id:info.boardId,...(info.rtc?{rtc:validateRTCConfiguration(info.rtc,{fallbackHost:new URL(info.httpUrl||info.httpsUrl).hostname})}:{})};
 const encoded=btoa(JSON.stringify(data)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
 const link=url.origin+'/#device='+encoded;parseDeviceSetupLink(link);return link;
}
export function takeDeviceSetupLink(location=globalThis.location,history=globalThis.history){
 if(!location?.hash||!new URLSearchParams(location.hash.slice(1)).has('device'))return null;
 const original=location.href,value=parseDeviceSetupLink(original);history.replaceState(history.state,'',location.pathname+location.search);return value;
}

const RETURN_KEY='iah-device-setup-return';
export function rememberDeviceSetupReturn({storage=globalThis.sessionStorage,now=Date.now()}={}){try{storage?.setItem(RETURN_KEY,String(now));}catch{}}
export function pendingDeviceSetupReturn({storage=globalThis.sessionStorage,now=Date.now(),consume=false}={}){try{const raw=storage?.getItem(RETURN_KEY),at=Number(raw),valid=!!raw&&Number.isFinite(at)&&at<=now&&now-at<86400000;if(consume||!valid)storage?.removeItem(RETURN_KEY);return valid;}catch{return false;}}
export function bridgeImportURL(baseUrl,locale,returnURL=globalThis.location?.href){
 const url=new URL('/settings',createDeviceURL(baseUrl));url.searchParams.set('import','1');url.searchParams.set('lang',locale);
 try{const back=new URL(returnURL);if(back.protocol==='https:'&&!back.username&&!back.password){back.hash='';url.searchParams.set('return',back.href);}}catch{}
 return url.href;
}
