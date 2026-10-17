// Deployment helper: receives a short-lived, manifest-scoped upload grant on
// non-echoing stdin. It never needs or saves a Cloudflare account API token.
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{fetch,EnvHttpProxyAgent,FormData}=require('undici');
const account='930fbb0ded7a94817e4b30b0e9e43739',root=path.resolve(import.meta.dirname,'../build/site');
const manifest=JSON.parse(await readFile(path.resolve(root,'../cloudflare-manifest.json'),'utf8'));
const dispatcher=new EnvHttpProxyAgent();
console.log('Waiting for the temporary upload grant. Token input is not echoed or saved.');
const grant=await new Promise((resolve,reject)=>{let value='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{value+=chunk;if(value.length>100000)reject(new Error('Grant is too large'));const end=value.indexOf('\n');if(end>=0){process.stdin.pause();try{resolve(JSON.parse(value.slice(0,end)));}catch{reject(new Error('Invalid upload grant'));}}});process.stdin.on('end',()=>reject(new Error('No upload grant received')));});
if(typeof grant.jwt!=='string'||!Array.isArray(grant.buckets))throw new Error('Invalid grant');
const mime=file=>({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.css':'text/css','.svg':'image/svg+xml','.md':'text/markdown','.txt':'text/plain','.bin':'application/octet-stream'}[path.extname(file)]||'application/octet-stream');
let files=0,completed=false;
try{
 for(const bucket of grant.buckets){const form=new FormData();for(const hash of bucket){const entry=Object.entries(manifest).find(([p,v])=>v.hash===hash);if(!entry)throw new Error('Grant refers to an unknown asset');const [name,info]=entry,data=await readFile(path.join(root,name.slice(1)));if(data.length!==info.size)throw new Error('Build changed during upload');form.append(hash,new File([data.toString('base64')],hash,{type:mime(name)}),hash);files++;}
  const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/assets/upload?base64=true`,{method:'POST',headers:{authorization:'Bearer '+grant.jwt},body:form,dispatcher,signal:AbortSignal.timeout(120000)});const result=await response.json();if(!response.ok||result.success===false){console.error(JSON.stringify({status:response.status,errors:(result.errors||[]).map(e=>({code:e.code,message:String(e.message||'').split(grant.jwt).join('[redacted]')}))}));throw new Error('Asset upload failed (HTTP '+response.status+')');}if(result.result?.jwt||result.jwt)completed=true;console.log(JSON.stringify({bucketUploaded:true,files,status:response.status}));
 }
 console.log(JSON.stringify({uploadedFiles:files,completed,buckets:grant.buckets.length}));
}catch(error){console.error(error?.message?.startsWith('Asset upload')?error.message:'Asset upload failed; no credential details logged.');process.exitCode=1;}finally{await dispatcher.close();process.stdin.destroy();}
