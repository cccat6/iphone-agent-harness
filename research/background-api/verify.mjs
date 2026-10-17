import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {RecordDecoder} from './protocol.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
let assertions=0;
function check(value,message){assert(value,message);assertions++;}
const payload='data: '+JSON.stringify({choices:[{delta:{content:'汉字😀'}}]})+'\r\n\r\ndata: [DONE]\r\n\r\n';
const raw=new TextEncoder().encode(payload);
for(let size=1;size<=13;size++){
  const values=[],parser=new RecordDecoder('sse',v=>values.push(v));
  for(let i=0;i<raw.length;i+=size)parser.push(raw.slice(i,i+size));parser.finish();
  check(values[0].value.choices[0].delta.content==='汉字😀','UTF8 fragment reconstruction');check(parser.done,'terminal recognized');
}
assert.throws(()=>{const p=new RecordDecoder('sse',()=>{});p.push(new TextEncoder().encode('data: {"x":1}\n\n'));p.finish();},/missing-terminal/);assertions++;
assert.throws(()=>{const p=new RecordDecoder('sse',()=>{});p.push(new TextEncoder().encode('data: {'));p.finish();},/truncated/);assertions++;
const child=spawn('python3',['server.py','--port','18729'],{cwd:root,stdio:['ignore','pipe','inherit']});
try{
  await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);});
  const {token}=JSON.parse(await readFile(new URL('probe-token.local.json',import.meta.url)));
  const base='http://127.0.0.1:18729/'+token+'/';
  check((await fetch('http://127.0.0.1:18729/no-token/')).status===404,'token required');
  for(const kind of ['json','openai','anthropic','ndjson','fragment','interrupt']){
    const start=performance.now();
    const response=await fetch(base+'mock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,delay:.03,count:3,interval:.01,run:'mac-node-verification',test:kind})});
    check(response.status===200,'mock status');
    if(kind==='json'){const value=await response.json();check(value.done,'JSON complete');check(performance.now()-start>=25,'delay respected');continue;}
    const parser=new RecordDecoder(kind==='ndjson'?'ndjson':'sse',()=>{}),reader=response.body.getReader();let failed=false;
    try{while(true){const {done,value}=await reader.read();if(done)break;parser.push(value);}parser.finish();}catch{failed=true;}
    if(kind==='interrupt')check(failed,'interruption not success');else{check(!failed&&parser.done,'stream complete');check(parser.records>=3,'records parsed');}
  }
  const report={environment:'Mac Node.js '+process.version,scope:'protocol only; not browser, not iPhone, no real API',assertions,passed:true,at:new Date().toISOString()};
  await writeFile(new URL('verification.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{child.kill('SIGTERM');}
