import {readText} from './http.js';
// Inspect bounded error data for the one recoverable condition. Never echo
// an upstream response body: gateways may include request text or credentials.
export function contextOverflowError(data){
 const error=data?.error||data?.response?.error||data;
 const code=String(error?.code||error?.type||'');
 const message=String(error?.message||'');
 if(['context_length_exceeded','context_window_exceeded','prompt_too_long','max_context_length_exceeded'].includes(code)||/prompt is too long|maximum context length|input (?:is too long|exceeds.*context)|context window.*exceed/i.test(message))return Object.assign(new Error('CONTEXT_WINDOW_EXCEEDED'),{code:'CONTEXT_WINDOW_EXCEEDED'});
 return null;
}
export async function readProviderFailure(response,{signal}={}){
 let data;try{data=JSON.parse(await readText(response,{maxBytes:64000,signal}));}catch{if(signal?.aborted)throw signal.reason||new DOMException('Aborted','AbortError');}
 if(response.status===403&&data?.error?.code==='unsupported_country_region_territory')return Object.assign(new Error('PROVIDER_REGION_UNSUPPORTED (HTTP 403)'),{code:'PROVIDER_REGION_UNSUPPORTED',status:403});
 const overflow=contextOverflowError(data);if(overflow)return overflow;
 const upstream=data?.error||data;
 if([400,404,410,422].includes(response.status)&&(['file_not_found','file_expired','invalid_file_id','expired_file'].includes(upstream?.code)||/file[_ ]id|file.*(?:not found|expired|unsupported)|(?:invalid|unsupported).*file|source.*type.*file/i.test(String(upstream?.message||''))))return Object.assign(new Error('PROVIDER_IMAGE_REFERENCE_INVALID'),{code:'PROVIDER_IMAGE_REFERENCE_INVALID',status:response.status});
 const code=response.status===401?'PROVIDER_AUTH_REJECTED':response.status===402?'PROVIDER_PAYMENT_REQUIRED':response.status===403?'PROVIDER_ACCESS_DENIED':'PROVIDER_HTTP_ERROR';
 return Object.assign(new Error(`${code} (HTTP ${response.status})`),{code,status:response.status});
}
