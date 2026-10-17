// Explicit live-model acceptance with synthetic PNGs and a strict in-memory board.
// No browser, LAN, serial, user screen, real phone or durable conversation is used.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {createHarness} from '../apps/web/core/harness.js';
import {callModel} from '../apps/web/core/providers.js';
import {openStore} from '../apps/web/core/store.js';
import {setCredential,clearCredentials} from '../apps/web/core/credentials.js';
import {canonicalSegmentJson} from '../apps/web/core/plan.js';
const require=createRequire(import.meta.url),{fetch,EnvHttpProxyAgent}=require('undici');
if(!process.argv.includes('--run')){console.log('Use --run for the authorized two-case live model test.');process.exit(0);}
const crc32=bytes=>{let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;};
function png(rgb){const width=96,height=96,header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;const rows=Buffer.alloc(height*(1+width*3));for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++)rows[y*(1+width*3)+1+x*3+c]=rgb[c];const chunk=(type,data)=>{const name=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length,0);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([name,data])),data.length+8);return out;};return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);}
const images={blue:png([0,0,255]),green:png([0,255,0])};
const report={checkedAt:new Date().toISOString(),scope:'Real DeepSeek models through production Harness/provider/plan/store; synthetic in-memory device and generated solid-color PNGs only; not iPhone/Safari/hardware acceptance',containsUserScreen:false,containsUserData:false,credentialsStored:false,modelResponseContentStored:false,maxModelTurnsPerCase:10,maxDurationMsPerCase:120000,model:'deepseek-flash',results:[]};
let dispatcher;
try{
 const config=JSON.parse(await readFile(new URL('../research/background-api/credentials.local.json',import.meta.url),'utf8'));
 if(typeof config.key!=='string'||!config.key)throw Object.assign(new Error('Missing local credential'),{code:'LOCAL_CREDENTIAL_MISSING'});
 dispatcher=new EnvHttpProxyAgent();
 for(const protocol of ['openai','anthropic']){
  const start=performance.now(),store=await openStore({memory:true}),account='synthetic-phone-live-'+protocol;
  let color='blue',homes=0,modelTurns=0,invalidInputAttempts=0,releaseCalls=0,wireImageCount=0;const frames=new Map(),toolNames=[],httpStatuses=[];
  const identity={boardId:'synthetic-board',bootId:'synthetic-boot',targetId:'synthetic-phone',clientId:'synthetic-client',leaseId:'synthetic-lease',orientationEpoch:1};
  const capabilities={operations:['home','capture','wait'],maxEvents:256,maxRequestBytes:8192,maxHoldMs:3000,maxSegmentMs:5000,reportIntervalMs:40};
  const getContext=()=>({...identity,identityVerified:true,bindingVerified:true,leaseVerified:true,executionEnabled:true,inputState:'released',capabilities});
  const capture={active:true,orientationEpoch:1,configure(){},async grab(){const at=performance.now(),frameId=crypto.randomUUID();frames.set(frameId,{color,capturedAfterHome:homes===1});return {frameId,...identity,requestedAtMs:at,readyAtMs:performance.now(),mediaTimeMs:at,width:96,height:96,blob:new Blob([images[color]],{type:'image/png'})};}};
  const device={
   async submitSegment(s){try{for(const k of ['boardId','bootId','targetId','clientId','leaseId'])if(s[k]!==identity[k])throw new Error('scope');if(s.protocolVersion!==1||typeof s.segmentId!=='string'||s.segmentId.length!==36||!Array.isArray(s.events)||JSON.stringify(s.events)!==JSON.stringify([{atMs:0,kind:'consumer',usage:64},{atMs:100,kind:'consumer',usage:0}]))throw new Error('only-complete-home');if(createHash('sha256').update(canonicalSegmentJson(s)).digest('hex')!==s.payloadHash)throw new Error('hash');if(homes!==0||![...frames.values()].some(f=>f.color==='blue'))throw new Error('home-order-or-duplicate');if(Buffer.byteLength(JSON.stringify(s))>8192)throw new Error('size');}catch{invalidInputAttempts++;throw Object.assign(new Error('Synthetic board rejected unapproved input'),{code:'SYNTHETIC_INPUT_REJECTED'});}homes++;color='green';return {...Object.fromEntries(['boardId','bootId','targetId','clientId','segmentId','planId','payloadHash'].map(k=>[k,s[k]])),status:'hid_submitted',releaseSubmitted:true};},
   async getResult(){throw Object.assign(new Error('No retry or receipt fallback expected'),{code:'SYNTHETIC_UNEXPECTED_QUERY'});},
   async release(q){releaseCalls++;for(const k of ['boardId','bootId','targetId','clientId','leaseId'])if(q[k]!==identity[k])throw new Error('Synthetic release scope mismatch');return {...identity,status:'released',releaseSubmitted:true,leaseInvalidated:true};},
   async endRun(){return {status:'not_owned',leaseInvalidated:false};},
  };
  const baseUrl=protocol==='anthropic'?'https://api.deepseek.com/anthropic/v1/messages':'https://api.deepseek.com/chat/completions',provider={id:account,accountId:account,protocol,baseUrl,model:'deepseek-flash',stream:true,maxTokens:4096,timeoutMs:120000};
  await store.saveSettings({providers:[provider],activeProviderId:account,context:{maxTokens:20000,targetTokens:12000}});const session=await store.createSession({mode:'task',title:'Synthetic phone acceptance'});setCredential(account,config.key);
  const request=async(url,init)=>{if(new URL(url).origin!=='https://api.deepseek.com')throw Object.assign(new Error('Endpoint pin failed'),{code:'ENDPOINT_PIN_FAILED'});const wire=JSON.parse(init.body);wireImageCount+=(JSON.stringify(wire.messages).match(/(?:image_url|"type":"image")/g)||[]).length;const r=await fetch(url,{...init,dispatcher});httpStatuses.push(r.status);return r;};
  const harness=createHarness({store,capture,device,getContext,maxSteps:10,maxToolCalls:30,maxDurationMs:120000,invoke:async options=>{if(++modelTurns>10)throw Object.assign(new Error('Case model budget reached'),{code:'MODEL_BUDGET_REACHED'});return callModel({...options,fetchImpl:request});},onEvent:e=>{if(e.type==='tool.started')toolNames.push(e.payload?.name||e.name);}});
  let failureCode=null;
  try{await harness.run({sessionId:session.id,text:'This is an authorized synthetic phone acceptance test. The initial image is a solid color, and the only allowed phone input is Consumer Home exactly ONCE. First call phone_observe and identify the initial color from the image. Then use phone_execute_plan with one home step only; use this session/board/target/orientation and a frame ID observed in this run. No taps, drags, keys, waits, Skill edits, or any other input. After Home, obtain a FRESH screen image (phone_observe, or a final review capture inside that plan). Inspect its actual color; it must be solid green. Once and only once you have fresh green evidence, finish with task_report status completed and evidenceFrameIds containing that green frame ID from this run. Do not infer completion only from the receipt. The initial view should be blue; after one Home the simulation changes it to green. These are generated test images, never a real user screen. Keep tool steps bounded and do not retry a submitted Home.'});}catch(error){failureCode=error.cause?.code||error.code||error.name||'CASE_FAILED';}
  const messages=await store.getMessages(session.id),events=await store.getEvents(session.id),ended=events.filter(e=>e.type==='run.ended').at(-1),reports=messages.filter(m=>m.role==='tool').map(m=>{try{return JSON.parse(m.text);}catch{return null;}}).filter(v=>v?.status==='completed'&&Array.isArray(v.evidenceFrameIds));
  // Tool names are taken from durable audit records, never model prose.
  const actualTools=events.filter(e=>e.type==='tool.started').map(e=>e.payload.name),green=[...frames.entries()].filter(([,v])=>v.color==='green'&&v.capturedAfterHome).map(([id])=>id),greenEvidence=reports.some(r=>r.evidenceFrameIds.some(id=>green.includes(id))),result={protocol,model:'deepseek-flash',elapsedMs:Math.round(performance.now()-start),modelTurns,httpStatuses,toolNames:actualTools,homeSubmissions:homes,invalidInputAttempts,capturedFrames:frames.size,blueFrames:[...frames.values()].filter(f=>f.color==='blue').length,greenFrames:green.length,completedReportCount:reports.length,completedWithFreshGreenEvidence:greenEvidence,runStatus:ended?.payload?.status||'missing',releaseCalls,imagesSentToModel:wireImageCount>0,...(failureCode?{failureCode}:{})};
  result.passed=!failureCode&&modelTurns<=10&&homes===1&&invalidInputAttempts===0&&frames.size>=2&&greenEvidence&&result.runStatus==='completed'&&httpStatuses.every(s=>s===200);report.results.push(result);clearCredentials();
  console.log(JSON.stringify({protocol,passed:result.passed,modelTurns,toolNames:actualTools,homeSubmissions:homes,capturedFrames:frames.size,completedWithFreshGreenEvidence:greenEvidence,...(failureCode?{failureCode}:{})}));
 }
}catch(error){report.failureCode=error.code||'LIVE_SETUP_FAILED';process.exitCode=1;}
finally{clearCredentials();if(dispatcher)await dispatcher.close();}
report.passed=report.results.length===2&&report.results.every(r=>r.passed);report.limitations=['Both device and capture adapters are synthetic; no real phone or HID operation occurred.','Store uses production memory mode, not Safari IndexedDB persistence.','Node requests do not establish Safari CORS, background survival or real-device timing.','A single simple authorized Home workflow per protocol is not a GUI-reliability benchmark.'];await writeFile(new URL('../docs/research/phone-harness-live-verification.json',import.meta.url),JSON.stringify(report,null,2)+'\n');if(!report.passed)process.exitCode=1;
