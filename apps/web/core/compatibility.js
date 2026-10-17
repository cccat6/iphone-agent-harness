// Compatibility is an entry preflight, not proof that screen-sharing consent,
// background execution or storage writes will succeed. Never spoof a detected OS.
// Safari 26 froze the OS UA token; Version/ continues to change:
// https://webkit.org/blog/17333/webkit-features-in-safari-26-0/#update-to-ua-string
// iPadOS may send the same UA as macOS:
// https://webkit.org/blog/9674/new-webkit-features-in-safari-13/
export const MINIMUM_IOS=27;
export const REQUIRED_HARNESS_FEATURES=Object.freeze(['getDisplayMedia','MediaRecorder','ImageCapture','OffscreenCanvas','indexedDB','webCrypto']);
const available=value=>value===true||typeof value==='function';
const major=version=>version?Number(version.split('.')[0]):null;
const thirdParty=/(?:CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Chromium|Firefox|Edg|OPR|GSA|DuckDuckGo|FBAN|FBAV|Instagram|MicroMessenger|YaBrowser)\//i;

export function detectCompatibility({userAgent='',platform='',maxTouchPoints=0,secureContext=false,features={}}={}){
 const ua=String(userAgent||''),navPlatform=String(platform||''),touch=Number(maxTouchPoints)||0;
 const android=/Android/i.test(ua),directIOS=/iPhone|iPad|iPod/i.test(ua),desktopIPad=!android&&navPlatform==='MacIntel'&&touch>1;
 const isIOS=!android&&(directIOS||desktopIPad),desktop=!android&&!isIOS&&(/Macintosh|Windows NT|X11|Linux/i.test(ua)||/^(Mac|Win|Linux)/i.test(navPlatform));
 const kind=isIOS?'ios':desktop?'desktop':'other';
 const reportedOS=isIOS?(ua.match(/\b(?:CPU(?: iPhone)? OS|iPhone OS)\s+(\d+(?:[_.]\d+)*)/i)?.[1]?.replaceAll('_','.')||null):null;
 const safariVersion=isIOS?(ua.match(/\bVersion\/(\d+(?:\.\d+)*)/i)?.[1]||null):null;
 // WebKit's original freeze and subsequent adjustments used 18.6 / 18.6.2 /
 // 18.7. Those tokens are ambiguous; they do not establish an old OS version.
 const frozenOS=Boolean(reportedOS&&/^18\.(?:6|7)(?:\.|$)/.test(reportedOS));
 const detectedOS=reportedOS&&!frozenOS?reportedOS:null;
 const missingFeatures=REQUIRED_HARNESS_FEATURES.filter(key=>!available(features?.[key]));
 const warnings=[];
 if(desktopIPad)warnings.push('IPADOS_DESKTOP_USER_AGENT');
 if(frozenOS)warnings.push('FROZEN_OS_USER_AGENT');
 if(isIOS&&!detectedOS)warnings.push('OS_VERSION_UNVERIFIED');
 const result={platform:kind,isIOS,supportedForHarness:false,supported:false,reasonCode:'UNSUPPORTED_PLATFORM',reason:'UNSUPPORTED_PLATFORM',detectedOS,reportedOS,safariVersion,minimumOS:MINIMUM_IOS,uncertainVersion:isIOS&&!detectedOS,warnings,missingFeatures,versionEvidence:detectedOS?'os-user-agent':safariVersion?'safari-version-proxy':'capabilities-only'};
 const finish=code=>({...result,supportedForHarness:code==='SUPPORTED',supported:code==='SUPPORTED',reasonCode:code,reason:code});
 if(!isIOS)return finish('UNSUPPORTED_PLATFORM');
 if(secureContext!==true)return finish('INSECURE_CONTEXT');
 if(detectedOS&&major(detectedOS)<MINIMUM_IOS)return finish('IOS_VERSION_TOO_OLD');
 if(thirdParty.test(ua)||!/AppleWebKit\//i.test(ua))return finish('UNSUPPORTED_BROWSER');
 if(safariVersion&&major(safariVersion)<MINIMUM_IOS)return finish('SAFARI_VERSION_TOO_OLD');
 if(missingFeatures.length)return finish('REQUIRED_FEATURES_MISSING');
 // Installed Web Apps can omit Version/Safari tokens. Full required capability
 // preflight is the fallback; an absent OS is never reported as iOS 27.
 if(!safariVersion)warnings.push('BROWSER_VERSION_UNVERIFIED');
 warnings.push('CAPABILITY_PREFLIGHT_ONLY');
 return finish('SUPPORTED');
}

export function getBrowserCompatibility(scope=globalThis){
 const read=fn=>{try{return fn();}catch{return undefined;}},nav=read(()=>scope.navigator)||{},recorder=read(()=>scope.MediaRecorder),image=read(()=>scope.ImageCapture),canvas=read(()=>scope.OffscreenCanvas);
 return detectCompatibility({userAgent:read(()=>nav.userAgent),platform:read(()=>nav.platform),maxTouchPoints:read(()=>nav.maxTouchPoints),secureContext:read(()=>scope.isSecureContext)===true,features:{
  getDisplayMedia:read(()=>typeof nav.mediaDevices?.getDisplayMedia==='function'),
  MediaRecorder:read(()=>typeof recorder==='function'&&typeof recorder.isTypeSupported==='function'),
  ImageCapture:read(()=>typeof image==='function'&&typeof image.prototype?.grabFrame==='function'),
  OffscreenCanvas:read(()=>typeof canvas==='function'&&typeof canvas.prototype?.convertToBlob==='function'),
  indexedDB:read(()=>typeof scope.indexedDB?.open==='function'),
  webCrypto:read(()=>typeof scope.crypto?.subtle?.digest==='function'&&typeof scope.crypto?.subtle?.encrypt==='function'&&typeof scope.crypto?.subtle?.generateKey==='function'&&typeof scope.crypto?.randomUUID==='function'),
 }});
}

// Flashing is independent of mobile Harness support and never gates /main.
export function detectFlasherCompatibility({secureContext=false,webSerial=false}={}){const supported=secureContext===true&&available(webSerial);return {supported,reasonCode:supported?'SUPPORTED':secureContext!==true?'INSECURE_CONTEXT':'WEB_SERIAL_UNAVAILABLE'};}
