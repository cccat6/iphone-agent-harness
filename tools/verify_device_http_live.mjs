// Explicit read-only-control acceptance against the authorized C3. Pairing saves
// a reusable test client; no phone proof, input segment or control lease is sent.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {DeviceClient} from '../apps/web/core/device.js';
const require=createRequire(import.meta.url),{fetch,Agent}=require('undici');
if(!process.argv.includes('--run'))throw Error('Use --run only for the authorized local C3');
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const setup=JSON.parse(await read('build/device-setup.local.json')),radio=JSON.parse(await read('build/device-radio.local.json'));
if(!setup.httpUrl)throw Error('HTTP firmware is not installed');
const base=new URL(setup.httpUrl),dispatcher=new Agent({connect:{lookup(host,options,callback){if(host!==base.hostname){callback(Error('Unexpected device hostname'));return;}if(options.all)callback(null,[{address:radio.localIp,family:4}]);else callback(null,radio.localIp,4);}}});
const checks=[],requests=[];let client;
const fetchImpl=async(url,options={})=>{const response=await fetch(url,{...options,headers:{...options.headers,Origin:base.origin,'X-Harness-Window':'1'},dispatcher});requests.push({path:new URL(url).pathname,status:response.status});return response;};
try{
 const response=await fetch(new URL('/harness-link',base),{dispatcher,signal:AbortSignal.timeout(8000)}),html=await response.text();
 const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 let executable=false;if(script){new vm.Script(script);executable=true;}
 checks.push({name:'actual-served-helper-has-complete-HTML-and-parseable-script',passed:response.status===200&&html.startsWith('<!doctype html>')&&executable&&html.includes('const harnessOrigin="https://igent.cc"'),bytes:Buffer.byteLength(html),sha256:createHash('sha256').update(html).digest('hex')});
 client=new DeviceClient({baseUrl:base.href,fetchImpl});
 const identity=await client.identity();checks.push({name:'HTTP-identity-without-manual-trust',passed:identity.boardId===setup.boardId&&identity.transport==='http'&&identity.requiresManualTrust===false,firmwareVersion:identity.firmwareVersion});
 const caps=await client.capabilities();checks.push({name:'runtime-capabilities',passed:caps.maxRequestBytes===8192&&caps.maxEvents===128&&caps.reportIntervalMs===40,freeHeapBytes:caps.freeHeapBytes,minFreeHeapBytes:caps.minFreeHeapBytes});
 await client.pair({clientId:'acceptance-device-client',setupPassword:setup.setupPassword});checks.push({name:'production-client-pairs-over-helper-origin-policy',passed:client.paired&&client.identityVerified});
 const binding=await client.getBinding();checks.push({name:'pairing-does-not-fabricate-phone-proof',passed:client.bindingVerified===false&&client.targetId===null});
 const missing=await fetchImpl(new URL('/v1/binding',base),{signal:AbortSignal.timeout(8000)});await missing.arrayBuffer();checks.push({name:'missing-token-rejected',passed:missing.status===401});
 const alien=await fetch(new URL('/v1/identity',base),{headers:{Origin:'https://untrusted.invalid','X-Harness-Window':'1'},dispatcher,signal:AbortSignal.timeout(8000)});await alien.arrayBuffer();checks.push({name:'foreign-origin-cannot-use-helper-header',passed:alien.status===403});
 const clock=await client.clockSync(2);checks.push({name:'production-clock-roundtrip',passed:Number.isFinite(clock.offsetMs)&&clock.rttMs>0,rttMs:Math.round(clock.rttMs)});
 let blocked=false;try{await client.claimLease({writerId:'acceptance-no-phone',allowClaim:true});}catch(error){blocked=['DEVICE_BINDING_UNVERIFIED','DEVICE_TARGET_NOT_READY'].includes(error.code);}
 checks.push({name:'phone-control-blocked-before-proof',passed:blocked});
}catch(error){checks.push({name:'live-check-error',passed:false,code:error.code||error.name});}
finally{await dispatcher.close();}
const manifest=JSON.parse(await read('apps/web/firmware/manifest.json')),build=JSON.parse(await read('apps/web/firmware/build-report.json'));
const report={checkedAt:new Date().toISOString(),scope:'Real ESP32-C3 HTTP endpoints and served HTML; production DeviceClient with helper-equivalent headers. Cached USB-reported IP used for hostname lookup. This is not a native-browser product helper run, mDNS reliability test, or phone HID test.',sourceSha256:build.sourceSha256,applicationSha256:manifest.profiles.find(x=>x.id==='esp32c3').parts.find(x=>x.path.endsWith('application.bin')).sha256,phoneInputSent:false,checks,requests,passed:checks.every(x=>x.passed)};
await writeFile(new URL('../docs/research/device-http-live-verification.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
