// Explicit PC-only acceptance. Uses a locally exported CA; never bypasses TLS.
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {DeviceClient} from '../apps/web/core/device.js';
const require=createRequire(import.meta.url),{fetch,Agent}=require('undici');
if(!process.argv.includes('--run')){console.log('Use --run with the authorized local C3 setup files. No phone input is sent.');process.exit(0);}
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const setup=JSON.parse(await read('build/device-setup.local.json')),radio=JSON.parse(await read('build/device-radio.local.json')),ca=await read('build/device-ca.pem');
const dispatcher=new Agent({connect:{ca,lookup(host,options,callback){if(host!==setup.hostname){callback(new Error('Unexpected device hostname'));return;}if(options.all)callback(null,[{address:radio.localIp,family:4}]);else callback(null,radio.localIp,4);}}});
const requests=[],checks=[];let client,resources=null;
let flashedFirmware=null;try{const record=JSON.parse(await read('build/device-flashed.local.json'));flashedFirmware={sourceSha256:record.sourceSha256,applicationSha256:record.applicationSha256,flashedAt:record.flashedAt};}catch{}
const fetchImpl=async(url,options={})=>{const at=performance.now();try{const r=await fetch(url,{...options,headers:{...options.headers,Origin:'https://igent.cc'},dispatcher});requests.push({path:new URL(url).pathname,status:r.status,headerMs:Math.round(performance.now()-at)});return r;}catch(error){requests.push({path:new URL(url).pathname,error:error.code||error.name});throw error;}};
try{
 client=new DeviceClient({baseUrl:setup.httpsUrl,expectedFingerprint:setup.publicKeyFingerprint,fetchImpl});
 const identity=await client.pinIdentity(setup.publicKeyFingerprint);checks.push({name:'pinned-CA-and-board-identity',passed:identity.boardId===setup.boardId});
 const caps=await client.capabilities();resources=Object.fromEntries(['freeHeapBytes','minFreeHeapBytes','maxEvents','maxRequestBytes','maxConcurrentTls'].map(key=>[key,caps[key]]));checks.push({name:'resource-limits-advertised',passed:caps.maxRequestBytes===8192&&caps.maxEvents<=128&&caps.reportIntervalMs===40});
 await client.pair({clientId:'acceptance-device-client',setupPassword:setup.setupPassword});checks.push({name:'production-client-owner-pair',passed:client.paired&&client.identityVerified});
 const binding=await client.getBinding();checks.push({name:'no-fabricated-target-binding',passed:binding.bindingVerified===false&&binding.targetId===null});
 const wrongOrigin=await fetch(setup.httpsUrl+'/v1/identity',{headers:{Origin:'https://untrusted.invalid'},dispatcher,signal:AbortSignal.timeout(8000)});await wrongOrigin.arrayBuffer();checks.push({name:'wrong-origin-rejected',passed:wrongOrigin.status===403});
 const missingToken=await fetchImpl(setup.httpsUrl+'/v1/binding',{signal:AbortSignal.timeout(8000)});await missingToken.arrayBuffer();checks.push({name:'missing-token-rejected',passed:missingToken.status===401});
 const clock=await client.clockSync(2);checks.push({name:'production-client-clock-sync',passed:Number.isFinite(clock.offsetMs)&&clock.rttMs>0,rttMs:Math.round(clock.rttMs),uncertaintyMs:Math.round(clock.uncertaintyMs)});
 let blocked=false;try{await client.claimLease({writerId:'acceptance-no-phone',allowClaim:true});}catch(error){blocked=error.code==='DEVICE_BINDING_UNVERIFIED'||error.code==='DEVICE_TARGET_NOT_READY';}checks.push({name:'unverified-phone-cannot-acquire-control',passed:blocked});
}catch(error){checks.push({name:'live-error',passed:false,code:error.code||error.name});}
finally{client?.disconnect?.();await dispatcher.close();}
const report={resources,checkedAt:new Date().toISOString(),flashedFirmware,scope:'Production DeviceClient with real C3 CA-verified HTTPS; cached address from USB diagnostic, original DNS name verified by TLS. No HID target challenge, lease or phone input sent.',checks,requests,passed:checks.every(c=>c.passed)};
await writeFile(new URL('../docs/research/device-client-live-verification.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
