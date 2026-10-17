import {readFile,writeFile} from 'node:fs/promises';
const {url}=JSON.parse(await readFile(new URL('processes.local.json',import.meta.url)));
const results=[];
for(const kind of ['json','openai','ndjson']){
 const at=performance.now();const chunks=[];let status,reason;
 try{
  const response=await fetch(new URL('mock',url),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,count:4,interval:2,delay:kind==='json'?1:0,run:'mac-public-preflight',test:kind}),signal:AbortSignal.timeout(20000)});status=response.status;
  const reader=response.body.getReader();while(true){const{done,value}=await reader.read();if(done)break;chunks.push({elapsed:Math.round(performance.now()-at),bytes:value.byteLength});}
 }catch(e){reason=e.name;}
 results.push({kind,status,chunks,reason,elapsed:Math.round(performance.now()-at)});
}
const report={environment:'Mac Node.js via Cloudflare Quick Tunnel',scope:'Public transport preflight only; NOT Safari or iPhone background',knownLimitation:'Cloudflare officially says Quick Tunnels do not support SSE; any observed SSE success is exploratory only.',at:new Date().toISOString(),results};
await writeFile(new URL('public-preflight.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
