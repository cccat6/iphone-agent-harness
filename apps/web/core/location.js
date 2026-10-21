import {abortable,checkAbort} from './control.js';
const failure=code=>Object.assign(new Error(code),{code,retryable:false});
const cancelled=()=>new DOMException('Location request cancelled','AbortError');

// Positions are never cached. Permission checks only query browser state;
// coordinates are read by an explicit tool call or a user authorization click.
export function createLocationAccess({getSettings,saveSettings,navigator=globalThis.navigator,document=globalThis.document,isSecure=()=>globalThis.isSecureContext!==false,timeoutMs=15000,deadlineMs=30000,permissionTimeoutMs=2000}={}){
 const pending=new Set(),listeners=new Set();let generation=0,permissionEpoch=0,permissionQuery=0,confirmed=false,request=null,permissionStatus=null,permissionState='unknown';
 const supported=()=>isSecure()&&typeof navigator?.geolocation?.getCurrentPosition==='function';
 const foreground=()=>document?.visibilityState!=='hidden'&&(typeof document?.hasFocus!=='function'||document.hasFocus());
 const notify=()=>{for(const listener of [...listeners])try{listener(request?{...request}:null);}catch{}};
 const needUser=(code,sessionId)=>{if(sessionId){request={sessionId,code,requestedAt:Date.now()};notify();}return failure(code);};
 const persist=async(enabled,epoch=permissionEpoch)=>{if(!saveSettings||epoch!==permissionEpoch)return;const settings=await getSettings();if(epoch!==permissionEpoch)return;if(settings?.locationEnabled!==enabled)await saveSettings({locationEnabled:enabled});};
 async function permission({signal}={}){
  if(!supported())return 'unsupported';
  const query=++permissionQuery;let timer;try{checkAbort(signal);const result=await abortable(Promise.race([Promise.resolve().then(()=>navigator.permissions?.query({name:'geolocation'})),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),permissionTimeoutMs);})]),signal);if(query!==permissionQuery)return permissionState;if(result&&result!==permissionStatus){permissionStatus?.removeEventListener?.('change',permissionChanged);permissionStatus=result;permissionStatus.addEventListener?.('change',permissionChanged);}permissionState=['granted','denied','prompt'].includes(result?.state)?result.state:'unknown';}
  catch(error){checkAbort(signal);if(query===permissionQuery)permissionState='unknown';}finally{clearTimeout(timer);}
  return permissionState;
 }
 async function syncPermission(){const epoch=permissionEpoch,state=await permission();if(epoch!==permissionEpoch)return {permission:permissionState,confirmed:permissionState==='granted'||permissionState==='unknown'&&confirmed};if(state!=='granted'&&(state!=='unknown'||!confirmed)){confirmed=false;await persist(false,epoch);}const latest=epoch===permissionEpoch?state:permissionState;return {permission:latest,confirmed:latest==='granted'||latest==='unknown'&&confirmed};}
 function permissionChanged(){if(permissionStatus?.state!=='granted'){permissionEpoch++;permissionQuery++;generation++;confirmed=false;permissionState=permissionStatus?.state||'unknown';for(const disable of [...pending])disable(failure(permissionState==='denied'?'LOCATION_DENIED':'LOCATION_PERMISSION_REQUIRED'));}void syncPermission().then(notify).catch(()=>{});}
 const isEnabled=async()=>{const value=await syncPermission();return supported()&&(await getSettings())?.locationEnabled===true&&value.confirmed;};
 function position({signal,requestGeneration=generation,requestEpoch=permissionEpoch,checkSetting=false}={}){
  return new Promise((resolve,reject)=>{
   let settled=false;const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);pending.delete(disable);signal?.removeEventListener('abort',abort);if(error)reject(error);else resolve(value);};
   const disable=(error=failure('LOCATION_DISABLED'))=>finish(error),abort=()=>finish(signal?.reason||cancelled()),timer=setTimeout(()=>finish(failure('LOCATION_TIMEOUT')),deadlineMs);pending.add(disable);signal?.addEventListener('abort',abort,{once:true});
   if(signal?.aborted){abort();return;}if(!supported()){finish(failure('LOCATION_UNSUPPORTED'));return;}
   try{navigator.geolocation.getCurrentPosition(fix=>{
    if(settled)return;Promise.resolve(checkSetting?getSettings():null).then(settings=>{checkAbort(signal);if(requestGeneration!==generation||requestEpoch!==permissionEpoch||checkSetting&&settings?.locationEnabled!==true)throw failure('LOCATION_DISABLED');
     const {latitude,longitude,accuracy}=fix?.coords||{},timestamp=fix?.timestamp;if(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180||!Number.isFinite(accuracy)||accuracy<0||!Number.isFinite(timestamp)||Math.abs(timestamp)>8640000000000000)throw failure('LOCATION_UNAVAILABLE');
     confirmed=true;finish(null,{status:'located',source:'browser-device',coordinateSystem:'WGS84',latitude,longitude,accuracyMeters:accuracy,timestamp:new Date(timestamp).toISOString()});
    }).catch(error=>finish(error));
   },error=>{if(settled||requestGeneration!==generation)return;if(requestEpoch!==permissionEpoch){finish(failure('LOCATION_DISABLED'));return;}if(error?.code===1){confirmed=false;void persist(false).catch(()=>{});}finish(failure(error?.code===1?'LOCATION_DENIED':error?.code===3?'LOCATION_TIMEOUT':'LOCATION_UNAVAILABLE'));},{enableHighAccuracy:false,maximumAge:0,timeout:timeoutMs});}
   catch(error){finish(failure(error?.name==='SecurityError'?'LOCATION_DENIED':'LOCATION_UNAVAILABLE'));}
  });
 }
 async function read({signal,sessionId}={}){
  checkAbort(signal);if(!supported())throw failure('LOCATION_UNSUPPORTED');const requestGeneration=generation,settings=await abortable(Promise.resolve(getSettings()),signal);checkAbort(signal);if(requestGeneration!==generation)throw failure('LOCATION_DISABLED');
  const state=await permission({signal});checkAbort(signal);if(requestGeneration!==generation)throw failure('LOCATION_DISABLED');
  if(state==='denied'){await persist(false);throw needUser('LOCATION_DENIED',sessionId);}
  if(!foreground()&&state!=='granted'&&!(state==='unknown'&&confirmed)){await persist(false);throw needUser('LOCATION_PERMISSION_REQUIRED',sessionId);}
  try{const value=await position({signal,requestGeneration,checkSetting:settings?.locationEnabled===true&&state==='granted'});if(requestGeneration!==generation)throw failure('LOCATION_DISABLED');if(request?.sessionId===sessionId){request=null;notify();}return value;}
  catch(error){if(error?.code==='LOCATION_DENIED'||error?.code==='LOCATION_PERMISSION_REQUIRED'||error?.code==='LOCATION_TIMEOUT'&&!foreground())throw needUser(error.code==='LOCATION_DENIED'?'LOCATION_DENIED':'LOCATION_PERMISSION_REQUIRED',sessionId);throw error;}
 }
 function authorize({signal}={}){
  // Call the sensor synchronously from the click, before any storage/query await.
  const requestGeneration=generation,epoch=++permissionEpoch;if(!foreground())return Promise.reject(failure('LOCATION_PERMISSION_REQUIRED'));const acquired=position({signal,requestGeneration});
  return acquired.then(async()=>{checkAbort(signal);if(requestGeneration!==generation)throw failure('LOCATION_DISABLED');const state=await permission({signal});checkAbort(signal);if(requestGeneration!==generation)throw failure('LOCATION_DISABLED');const allowed=state==='granted'||state==='unknown'&&confirmed;await persist(allowed,epoch);checkAbort(signal);if(requestGeneration!==generation||epoch!==permissionEpoch){await persist(false,epoch);throw failure('LOCATION_DISABLED');}return {status:'authorized',permission:state,confirmed:allowed};}).catch(async error=>{if(error?.name!=='AbortError'&&requestGeneration===generation&&epoch===permissionEpoch){confirmed=false;await persist(false).catch(()=>{});}throw error;});
 }
 const foregroundChanged=()=>{if(document?.visibilityState!=='hidden')void syncPermission().then(notify).catch(()=>{});};document?.addEventListener?.('visibilitychange',foregroundChanged);
 return {supported,isEnabled,permission,syncPermission,read,authorize,getSnapshot:()=>request?{...request}:null,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},dismiss(sessionId){if(!sessionId||request?.sessionId===sessionId){request=null;notify();}},cancel(){generation++;permissionEpoch++;confirmed=false;request=null;for(const disable of [...pending])disable();notify();},dispose(){this.cancel();document?.removeEventListener?.('visibilitychange',foregroundChanged);permissionStatus?.removeEventListener?.('change',permissionChanged);listeners.clear();}};
}
