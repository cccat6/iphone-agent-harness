// Explicit opt-in real-provider transport verification. Does not print or persist keys/content.
import {readFile,writeFile} from 'node:fs/promises';
import {RecordDecoder} from './protocol.mjs';
const cfg=JSON.parse(await readFile(new URL('credentials.local.json',import.meta.url)));
if(cfg.enabled!==true || !cfg.key || !cfg.model) throw new Error('Set enabled:true, key and model in ignored local configuration first');
const cases=Array.isArray(cfg.cases)?cfg.cases:[{protocol:cfg.protocol,endpoint:cfg.endpoint,model:cfg.model}];
for(const c of cases) if(!['openai','anthropic'].includes(c.protocol)||!c.endpoint?.startsWith('https://'))throw new Error('Each case needs approved HTTPS endpoint and protocol');
const state=JSON.parse(await readFile(new URL('processes.local.json',import.meta.url)));
const origin=new URL(state.url).origin;
const results=[];
for(const c of cases){
 const headers=c.protocol==='anthropic'?{'Content-Type':'application/json','x-api-key':cfg.key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'}:{'Content-Type':'application/json',Authorization:'Bearer '+cfg.key};
 const cors={};
 try{
  const res=await fetch(c.endpoint,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':Object.keys(headers).map(x=>x.toLowerCase()).join(',')},signal:AbortSignal.timeout(20000)});
  cors.status=res.status;cors.allowOrigin=res.headers.get('access-control-allow-origin');cors.allowHeaders=res.headers.get('access-control-allow-headers');cors.allowMethods=res.headers.get('access-control-allow-methods');
 }catch(e){cors.reason=e.name;}
 for(const streaming of [false,true]){
  const at=performance.now();let status,bytes=0,chunks=0,records=0,firstChunkMs,ok=false,reason;
  const body={model:c.model||cfg.model,messages:[{role:'user',content:'Transport test. Reply only with the numbers 1 through 20, one per line.'}],stream:streaming,max_tokens:160};
  try{
   const res=await fetch(c.endpoint,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});status=res.status;
   if(!res.ok){await res.body.cancel();throw new Error('http-status');}
   if(!streaming){const raw=await res.text();JSON.parse(raw);bytes=new TextEncoder().encode(raw).length;records=1;}
   else{
    const parser=new RecordDecoder('sse',()=>records++),reader=res.body.getReader();
    while(true){const {done,value}=await reader.read();if(done)break;chunks++;bytes+=value.byteLength;if(firstChunkMs===undefined)firstChunkMs=Math.round(performance.now()-at);parser.push(value);}
    parser.finish();
   }
   ok=true;
  }catch(e){reason=e.message==='http-status'?'http-status':e.message==='missing-terminal-marker'?'missing-terminal-marker':e.name;}
  results.push({protocol:c.protocol,model:c.model||cfg.model,stream:streaming,status,ok,reason,elapsedMs:Math.round(performance.now()-at),firstChunkMs,chunks,records,bytes,cors});
 }
}
const report={at:new Date().toISOString(),environment:'Mac Node.js direct provider API',scope:'Real provider protocol and CORS header check only; not browser or iPhone background',results};
await writeFile(new URL('real-api-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
