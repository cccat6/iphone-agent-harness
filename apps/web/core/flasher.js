import {abortable,checkAbort} from './control.js';
import {validateRTCConfiguration} from './device-rtc.js';
import {readText,readBytes} from './http.js';
// Flashing is reachable only through an explicit user click. No auto-port probing.
const fail=(code,message)=>Object.assign(new Error(message),{code});
const manifestDefault=new URL('../firmware/manifest.json',import.meta.url).href;
const normalizeChip=value=>String(value).toLowerCase().replace(/[^a-z0-9]/g,'');
const hex=data=>[...new Uint8Array(data)].map(n=>n.toString(16).padStart(2,'0')).join('');
export function canFlash({navigator=globalThis.navigator,secure=globalThis.isSecureContext}={}){return Boolean(secure&&navigator?.serial?.requestPort);}
export function validateFirmwareManifest(value){
  if(value?.schemaVersion!==1||!Array.isArray(value.profiles)||value.profiles.length>32)throw fail('flash_manifest','Invalid firmware manifest');
  const ids=new Set(),crystals=new Set();for(const p of value.profiles){
    if(!p?.id||ids.has(p.id)||!['esp32','esp32c2','esp32c3','esp32c5','esp32s3','esp32c6'].includes(p.chip)||(![2,4].includes(p.minFlashMB)||p.minFlashMB===2&&p.chip!=='esp32c2')||p.flashFreq!==undefined&&!['15m','20m','26m','30m','40m','48m','60m','80m','120m'].includes(p.flashFreq)||!Array.isArray(p.parts)||p.parts.length<1||p.parts.length>8)throw fail('flash_manifest','Invalid firmware profile');if(p.chip==='esp32c2'){if(![26,40].includes(p.xtalMHz)||crystals.has(p.xtalMHz))throw fail('flash_manifest','Invalid C2 crystal profile');crystals.add(p.xtalMHz);}ids.add(p.id);
    let end=0;for(const part of [...p.parts].sort((a,b)=>a.offset-b.offset)){
      if(typeof part.path!=='string'||!/^[-A-Za-z0-9_./]+$/.test(part.path)||part.path.startsWith('/')||part.path.includes('..')||!Number.isSafeInteger(part.offset)||part.offset<end||!Number.isSafeInteger(part.size)||part.size<1||part.offset+part.size>p.minFlashMB*1048576||!/^[a-f0-9]{64}$/.test(part.sha256))throw fail('flash_manifest','Invalid firmware binary record');end=part.offset+part.size;
    }
  }return value;
}
export function firmwareInstallerChoices(profiles){let c2=false;return profiles.filter(profile=>profile.chip!=='esp32c2'||!c2&&(c2=true));}
export async function loadFirmwareManifest({url=manifestDefault,fetchImpl=fetch,signal}={}){
  const response=await fetchImpl(url,{signal,credentials:'omit'});if(!response.ok)throw fail('flash_manifest','Firmware manifest could not be loaded');
  const manifest=validateFirmwareManifest(JSON.parse(await readText(response,{maxBytes:200000,signal})));return {...manifest,manifestUrl:String(url)};
}
export async function loadFirmwareParts(profile,{manifestUrl=manifestDefault,fetchImpl=fetch,signal}={}){
  validateFirmwareManifest({schemaVersion:1,profiles:[profile]});const parts=[];
  for(const part of profile.parts){const deadline=AbortSignal.timeout(30000),requestSignal=signal?AbortSignal.any([signal,deadline]):deadline;const response=await fetchImpl(new URL(part.path,manifestUrl),{signal:requestSignal,credentials:'omit'});if(!response.ok)throw fail('flash_download','Firmware download failed');let data;try{data=await readBytes(response,{maxBytes:part.size,signal:requestSignal});}catch(error){if(error.code==='RESPONSE_TOO_LARGE')throw fail('flash_integrity','Firmware exceeded its expected size');throw error;}if(data.length!==part.size||hex(await crypto.subtle.digest('SHA-256',data))!==part.sha256)throw fail('flash_integrity','Firmware checksum did not match');parts.push({data,address:part.offset});}return parts;
}
let flashing=false,serialReading=false;
export async function flashFirmware({profile,profiles=[profile],manifestUrl=manifestDefault,onProgress=()=>{},onLog=()=>{},fetchImpl=fetch,serial=globalThis.navigator?.serial,loaderModule,md5Impl}={}){
  if(flashing||serialReading)throw fail('flash_busy','Firmware installation is already running');
  validateFirmwareManifest({schemaVersion:1,profiles});if(!profiles.some(item=>JSON.stringify(item)===JSON.stringify(profile)))throw fail('flash_manifest','Selected firmware is not in the manifest');if(!serial?.requestPort)throw fail('flash_unsupported','Use a desktop browser with Web Serial support');
  flashing=true;let transport;
  const log=text=>{try{onLog(String(text));}catch{}};
  try{
    // Keep the user activation for the native chooser. Choosing does not flash.
    const port=await serial.requestPort();
    let files;const verified=new Map();for(const candidate of profile.chip==='esp32c2'?profiles.filter(item=>item.chip==='esp32c2'):[profile])verified.set(candidate.id,await loadFirmwareParts(candidate,{manifestUrl,fetchImpl}));files=verified.get(profile.id);
    const {ESPLoader,Transport}=loaderModule||await import('../vendor/esptool-js/bundle.js');
    const md5=md5Impl||(await import('../vendor/js-md5/md5.js')).default;
    if(typeof md5!=='function')throw fail('flash_dependency','Firmware verification could not be initialized');
    transport=new Transport(port,false);const loader=new ESPLoader({transport,baudrate:115200,debugLogging:false,
      // esptool-js 0.7.0's default HardReset only releases RTS. Start an actual
      // reset pulse and clear its cached DTR first, so IO0 is not held low.
      resetConstructors:{hardReset:(link,usingUsbOtg=false)=>({async reset(){await link.setDTR(false);await link.setRTS(true);await new Promise(resolve=>setTimeout(resolve,200));await link.setRTS(false);if(usingUsbOtg)await new Promise(resolve=>setTimeout(resolve,200));}})},
      terminal:{clean(){},write:log,writeLine:log}});
    const description=await loader.main(),detected=normalizeChip(loader.chip?.CHIP_NAME||description);if(!detected.startsWith(profile.chip)||profile.chip==='esp32'&&detected!=='esp32')throw fail('flash_chip_mismatch','Selected firmware does not match the connected chip');
    if(profile.chip==='esp32c2'){const crystal=await loader.chip?.getCrystalFreq?.(loader),matched=profiles.find(item=>item.chip==='esp32c2'&&item.xtalMHz===crystal);if(!matched||!verified.has(matched.id))throw fail('flash_crystal','No matching ESP32-C2 crystal firmware is available');profile=matched;files=verified.get(profile.id);log('ESP32-C2 · '+crystal+' MHz · '+profile.id);}
    const capacity=await loader.detectFlashSize();if(!capacity||loader.flashSizeBytes(capacity)<profile.minFlashMB*1048576)throw fail(profile.minFlashMB===2?'flash_capacity_c2':'flash_capacity','The connected device needs at least '+profile.minFlashMB+' MB of flash');
    const total=files.reduce((n,f)=>n+f.data.length,0),progress=files.map(()=>0);
    // C2's compiled 60 MHz header must remain intact: vendor 0.7.0 has no 60m option.
    await loader.writeFlash({fileArray:files,flashMode:'dio',flashFreq:profile.chip==='esp32c2'?'keep':profile.flashFreq||'40m',flashSize:profile.minFlashMB+'MB',eraseAll:false,compress:true,calculateMD5Hash:data=>md5(data),reportProgress:(i,written)=>{progress[i]=Math.min(files[i].data.length,written);try{onProgress({written:progress.reduce((a,b)=>a+b,0),total,percent:100*progress.reduce((a,b)=>a+b,0)/total});}catch{}}});
    await loader.after('hard_reset');return {status:'flashed',profileId:profile.id,verified:true,port};
  }finally{try{await transport?.disconnect();}finally{flashing=false;}}
}

// Secrets from explicit USB setup reads are returned only to the local setup UI.
// They never pass through onLog, remote APIs or ordinary settings.
export function parseDeviceSetupLine(line){
  const prefix='IAH_SETUP ';if(!line.startsWith(prefix))return null;
  let value;try{value=JSON.parse(line.slice(prefix.length));}catch{throw fail('flash_setup_invalid','Invalid USB setup response');}
  if(value.format!=='iah-setup/1'||typeof value.boardId!=='string'||!value.boardId||typeof value.hostname!=='string'||!/^[-a-z0-9]+\.local$/i.test(value.hostname)||typeof value.apSsid!=='string'||new TextEncoder().encode(value.apSsid).length>32||typeof value.apPassword!=='string'||value.apPassword.length<8||value.apPassword.length>63)throw fail('flash_setup_invalid','Invalid USB setup fields');
  let url;try{url=new URL(value.httpUrl||value.httpsUrl);}catch{throw fail('flash_setup_invalid','Invalid controller address');}if(!['https:','http:'].includes(url.protocol)||url.pathname!=='/'||url.search||url.hash||url.hostname!==value.hostname.toLowerCase()||url.username||url.password)throw fail('flash_setup_invalid','Invalid controller address');
  if(value.caReady&&!/^[a-f0-9]{64}$/i.test(value.publicKeyFingerprint||''))throw fail('flash_setup_invalid','Missing controller fingerprint');const {setupPassword,owner,caReady,caProfileUrl,httpsUrl,manualTrustRequired,...information}=value;if(!information.httpUrl&&httpsUrl)information.httpUrl=httpsUrl;if(value.rtc){try{information.rtc=validateRTCConfiguration(value.rtc,{fallbackHost:value.hostname});}catch{throw fail('flash_setup_invalid','Invalid device RTC configuration');}}return information;
}
export async function readDeviceSetup({port,serial=globalThis.navigator?.serial,signal,timeoutMs=10000}={}){
  if(flashing||serialReading)throw fail('flash_busy','Firmware operation is already running');if(!port&&!serial?.requestPort)throw fail('flash_unsupported','Web Serial is unavailable');
  serialReading=true;let reader,writer,opened=false,timer;const timeout=new AbortController(),active=signal?AbortSignal.any([signal,timeout.signal]):timeout.signal;
  try{
    checkAbort(active);port=port||await serial.requestPort();checkAbort(active);
    // User deliberation in the native chooser is not a device I/O timeout.
    timer=setTimeout(()=>timeout.abort(new Error('USB setup timed out')),timeoutMs);
    if(!port.readable){
      const opening=port.open({baudRate:115200});
      try{await abortable(opening,active);opened=true;}
      catch(error){Promise.resolve(opening).then(()=>port.close()).catch(()=>{});throw error;}
    }
    if(!port.readable||!port.writable||port.readable.locked||port.writable.locked)throw fail('flash_setup_busy','The selected serial port is in use');
    reader=port.readable.getReader();writer=port.writable.getWriter();
    await abortable(writer.write(new TextEncoder().encode(JSON.stringify({op:'setup-info'})+'\n')),active);
    const decoder=new TextDecoder('utf-8',{fatal:true});let pending='';
    while(true){const {done,value}=await abortable(reader.read(),active);if(done)throw fail('flash_setup_closed','The controller disconnected');pending+=decoder.decode(value,{stream:true});if(pending.length>100000)throw fail('flash_setup_invalid','USB setup response exceeded its limit');let split;while((split=pending.indexOf('\n'))>=0){const line=pending.slice(0,split).replace(/\r$/,''),result=parseDeviceSetupLine(line);pending=pending.slice(split+1);if(result)return result;}}
  }catch(error){if(active.aborted)throw fail('flash_setup_timeout','USB setup could not be read before the request ended');throw error;}
  finally{clearTimeout(timer);try{await reader?.cancel();}catch{}try{reader?.releaseLock();}catch{}try{writer?.releaseLock();}catch{}if(opened)try{await port.close();}catch{}serialReading=false;}
}
