import {readText} from './http.js';
export const firmwareVersionLabel=value=>String(value||'').replace(/-rtc-direct$/,'');
export function firmwarePublicationDate(manifest,value){
 if(value?.schemaVersion!==1||!manifest.buildId||value.buildId!==manifest.buildId||value.firmwareVersion!==manifest.firmwareVersion||typeof value.publishedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value.publishedAt))return null;
 const date=new Date(value.publishedAt);return Number.isFinite(date.getTime())&&date.toISOString().replace('.000Z','Z')===value.publishedAt?date:null;
}
export async function loadFirmwarePublication(manifest,{fetchImpl=fetch}={}){
 try{const signal=AbortSignal.timeout(3000),response=await fetchImpl(new URL('../firmware-publication.json',manifest.manifestUrl),{signal,credentials:'omit',cache:'no-store'});if(!response.ok)return null;return firmwarePublicationDate(manifest,JSON.parse(await readText(response,{signal,maxBytes:2048})));}catch{return null;}
}
export function firmwarePublicationLabel(date){return date?date.toISOString().slice(0,19).replace('T',' ')+' UTC':'';}
