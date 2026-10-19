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
 const code=response.status===401?'PROVIDER_AUTH_REJECTED':response.status===402?'PROVIDER_PAYMENT_REQUIRED':response.status===403?'PROVIDER_ACCESS_DENIED':'PROVIDER_HTTP_ERROR';
 return contextOverflowError(data)||Object.assign(new Error(`${code} (HTTP ${response.status})`),{code,status:response.status});
}
