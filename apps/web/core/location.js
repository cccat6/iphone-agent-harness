import {abortable,checkAbort} from './control.js';

const failure=code=>Object.assign(new Error(code),{code,retryable:false});
const cancelled=()=>new DOMException('Location request cancelled','AbortError');

// Browser permission and the local opt-in are separate. Only read() accesses
// coordinates; inspecting availability or permission never requests a position.
export function createLocationAccess({getSettings,navigator=globalThis.navigator,isSecure=()=>globalThis.isSecureContext!==false,timeoutMs=15000,deadlineMs=30000}={}){
  const pending=new Set();let generation=0;
  const supported=()=>isSecure()&&typeof navigator?.geolocation?.getCurrentPosition==='function';
  const isEnabled=async()=>supported()&&(await getSettings())?.locationEnabled===true;
  async function permission(){
    if(!supported())return 'unsupported';
    try{const result=await navigator.permissions?.query({name:'geolocation'});return ['granted','denied','prompt'].includes(result?.state)?result.state:'unknown';}
    catch{return 'unknown';}
  }
  async function allowed(signal){
    checkAbort(signal);
    if((await abortable(Promise.resolve(getSettings()),signal))?.locationEnabled!==true)throw failure('LOCATION_DISABLED');
    checkAbort(signal);
    if(!supported())throw failure('LOCATION_UNSUPPORTED');
  }
  async function read({signal}={}){
    const requestGeneration=generation;await allowed(signal);
    if(requestGeneration!==generation)throw failure('LOCATION_DISABLED');
    return new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(error,value)=>{
        if(settled)return;settled=true;clearTimeout(timer);pending.delete(disable);signal?.removeEventListener('abort',abort);
        if(error)reject(error);else resolve(value);
      };
      const disable=()=>finish(failure('LOCATION_DISABLED'));
      const abort=()=>finish(signal?.reason||cancelled());
      const timer=setTimeout(()=>finish(failure('LOCATION_TIMEOUT')),deadlineMs);
      pending.add(disable);signal?.addEventListener('abort',abort,{once:true});
      if(signal?.aborted){abort();return;}
      try{
        navigator.geolocation.getCurrentPosition(position=>{
          if(settled)return;
          allowed(signal).then(()=>{
            if(settled)return;
            if(requestGeneration!==generation)throw failure('LOCATION_DISABLED');
            const {latitude,longitude,accuracy}=position?.coords||{},timestamp=position?.timestamp;
            if(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180||!Number.isFinite(accuracy)||accuracy<0||!Number.isFinite(timestamp)||Math.abs(timestamp)>8640000000000000)throw failure('LOCATION_UNAVAILABLE');
            finish(null,{status:'located',source:'browser-device',coordinateSystem:'WGS84',latitude,longitude,accuracyMeters:accuracy,timestamp:new Date(timestamp).toISOString()});
          }).catch(error=>finish(error));
        },error=>finish(failure(error?.code===1?'LOCATION_DENIED':error?.code===3?'LOCATION_TIMEOUT':'LOCATION_UNAVAILABLE')),{enableHighAccuracy:false,maximumAge:0,timeout:timeoutMs});
      }catch(error){finish(failure(error?.name==='SecurityError'?'LOCATION_DENIED':'LOCATION_UNAVAILABLE'));}
    });
  }
  return {supported,isEnabled,permission,read,cancel(){generation++;for(const disable of [...pending])disable();}};
}
