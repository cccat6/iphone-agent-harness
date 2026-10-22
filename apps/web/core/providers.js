import {cacheUsage} from './model-usage.js';
export {cacheUsage} from './model-usage.js';
import {modelContextMetadata} from './models.js';
import {modelReasoningMetadata,reasoningParameters} from './reasoning.js';
import {contextOverflowError,readProviderFailure} from './provider-errors.js';
import {readText} from './http.js';
import {checkAbort} from './control.js';
import {callCodexModel,discoverCodexModels} from './codex.js';
export const PROVIDER_LIMITS=Object.freeze({toolArgumentBytes:64000,toolCalls:8,toolNameChars:128,toolIdChars:128,stateBytes:1000000,thinkingBlocks:256});
function providerError(message,code='PROVIDER_RESPONSE_LIMIT'){const error=new Error(message);error.code=code;return error;}
const utf8=value=>new TextEncoder().encode(value).length;
const jsonBytes=value=>utf8(JSON.stringify(value));
const encodedStringBytes=value=>jsonBytes(value)-2;
const joinsPair=(left,right)=>left.length&&right.length&&left.charCodeAt(left.length-1)>=0xd800&&left.charCodeAt(left.length-1)<=0xdbff&&right.charCodeAt(0)>=0xdc00&&right.charCodeAt(0)<=0xdfff;
function appendBounded(target,key,chunk,limit,label){if(typeof chunk!=='string')throw providerError(label+' has invalid data','PROVIDER_RESPONSE_INVALID');const old=target[key]||'',bytesKey=key+'Bytes',count=target[bytesKey]??utf8(old),next=count+utf8(chunk)-(joinsPair(old,chunk)?2:0);if(next>limit)throw providerError(label+' exceeded its size limit');target[key]=old+chunk;target[bytesKey]=next;}
function toolIdentity(value,label,limit,{empty=false}={}){if(typeof value!=='string'||(!empty&&!value)||value.length>limit)throw providerError(label+' exceeded its size limit or is invalid');return value;}
// Two fixed wire protocols; no provider plugin registry or remote executable code.
export async function* readSSE(body) {
  const reader=body.getReader(), decoder=new TextDecoder('utf-8',{fatal:true}); let buffer='';
  try {
    while(true) {
      const {value,done}=await reader.read();buffer+=decoder.decode(value,{stream:!done});
      if(buffer.length>2000000)throw new Error('流式事件超过容量限制');
      let match;
      while((match=/\r?\n\r?\n/.exec(buffer))) {
        const block=buffer.slice(0,match.index);buffer=buffer.slice(match.index+match[0].length);
        const data=block.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).replace(/^ /,'')).join('\n');
        if(data)yield data;
      }
      if(done){if(buffer.trim()&&!buffer.trim().startsWith(':'))throw new Error('流在完整事件结束前断开');return;}
    }
  } finally {try{await reader.cancel();}catch{}reader.releaseLock();}
}
function imageBlock(image){const match=/^data:([^;]+);base64,(.+)$/.exec(image);if(!match)throw new Error('图片必须为本地数据格式');return {type:'image',source:{type:'base64',media_type:match[1],data:match[2]}};}
function anthropicMessages(messages,scope){
  const out=[],push=value=>{const last=out.at(-1);if(value.role==='user'&&last?.role==='user')last.content.push(...value.content);else out.push(value);};
  for(let i=0;i<messages.length;i++){
    const m=messages[i];if(m.role==='system')continue;
    if(m.role==='tool'){
      const content=[];do{const t=messages[i];content.push({type:'tool_result',tool_use_id:t.toolCallId,content:[{type:'text',text:t.text||' '},...(t.images||[]).map(imageBlock)]});if(messages[i+1]?.role!=='tool')break;i++;}while(i<messages.length);
      push({role:'user',content});continue;
    }
    const state=stateFor(m,scope);
    const content=[...(state?.thinkingBlocks||[]),...(m.text?[{type:'text',text:m.text}]:[]),...(m.images||[]).map(imageBlock),...(m.toolCalls||[]).map(t=>({type:'tool_use',id:t.id,name:t.name,input:t.arguments}))];
    push({role:m.role,content:content.length?content:[{type:'text',text:' '}]});
  }return out;
}
function openaiMessages(messages,scope,deepseek=false){
  const out=[];
  for(let i=0;i<messages.length;i++){
    const m=messages[i];if(m.role==='tool'){
      const images=[];do{const t=messages[i];out.push({role:'tool',tool_call_id:t.toolCallId,content:t.text||''});images.push(...(t.images||[]));if(messages[i+1]?.role!=='tool')break;i++;}while(i<messages.length);
      if(images.length)out.push({role:'user',content:[{type:'text',text:'Observation images for the preceding completed tool-result group.'},...images.map(url=>({type:'image_url',image_url:{url}}))]});continue;
    }
    const content=m.images?.length?[{type:'text',text:m.text||''},...m.images.map(url=>({type:'image_url',image_url:{url}}))]:m.text||'';
    out.push({role:m.role,content,...(m.role==='assistant'&&(stateFor(m,scope)?.reasoningContent!==undefined||deepseek)?{reasoning_content:stateFor(m,scope)?.reasoningContent||''}:{}),...(m.toolCalls?.length?{tool_calls:m.toolCalls.map(t=>({id:t.id,type:'function',function:{name:t.name,arguments:JSON.stringify(t.arguments)}}))}:{})});
  }return out;
}
function stateFor(message,scope){const s=message.providerState;return s&&s.kind===scope.kind&&s.origin===scope.origin&&typeof s.endpoint==='string'&&s.endpoint===scope.endpoint&&s.accountId===scope.accountId&&s.model===scope.model?s:null;}
export function normalizeProviderEndpoint(value){const u=rootURL(value);u.hash='';return u.href;}
function rootURL(value){const u=new URL(value);if(u.username||u.password)throw new Error('请勿将凭据写入 URL');if(u.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(u.hostname))throw new Error('后端需要 HTTPS，局域网 HTTP 受浏览器策略限制');u.pathname=u.pathname.replace(/\/(chat\/completions|completions|chat|messages|responses|models)\/?$/,'').replace(/\/$/,'');return u;}
export async function discoverModels({protocol,baseUrl,credential='',accountId,fetchImpl=fetch,signal}){
  checkAbort(signal);if(protocol==='codex')return discoverCodexModels({accountId,fetchImpl,signal});
  if(!['openai','anthropic'].includes(protocol))throw new Error('不支持的模型目录协议');
  const root=rootURL(baseUrl),headers={accept:'application/json'};let url;
  // DeepSeek's official model catalog is shared by both compatible inference APIs.
  if(root.hostname==='api.deepseek.com'){url=new URL('/models',root);if(credential)headers.authorization='Bearer '+credential;}
  else if(protocol==='anthropic'){url=new URL(root.href);url.pathname=root.pathname.replace(/\/$/,'')+(/\/v\d+$/.test(root.pathname)?'/models':'/v1/models');headers['anthropic-version']='2023-06-01';headers['anthropic-dangerous-direct-browser-access']='true';if(credential)headers['x-api-key']=credential;}
  else {url=new URL(root.href);const path=root.pathname.replace(/\/$/,'');url.pathname=path+(root.hostname==='api.openai.com'&&!path?'/v1/models':'/models');if(credential)headers.authorization='Bearer '+credential;}
  const models=[];let pages=0;
  while(true){const r=await fetchImpl(url,{headers,credentials:'omit',referrerPolicy:'no-referrer',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});checkAbort(signal);if(!r.ok){if([401,402,403].includes(r.status))throw await readProviderFailure(r,{signal});throw Object.assign(new Error(`PROVIDER_MODELS_HTTP (HTTP ${r.status})`),{code:'PROVIDER_MODELS_HTTP',status:r.status});}const data=JSON.parse(await readText(r,{maxBytes:2000000,signal}));checkAbort(signal);const entries=data.data||data.models;if(!Array.isArray(entries))throw new Error('模型目录没有返回有效列表');for(const m of entries)if(typeof m.id==='string'&&!models.some(v=>v.id===m.id))models.push({id:m.id,name:m.display_name||m.name||m.id,...modelContextMetadata(m),...modelReasoningMetadata(m)});if(models.length>2000)throw new Error('模型目录超过限额');if(!data.has_more)return models;if(!data.last_id||++pages>=20)throw new Error('模型目录分页不完整');url.searchParams.set('after_id',data.last_id);}
}
export async function callModel({provider,credential,messages,tools=[],toolDefinitions=tools,purpose,signal,onDelta=()=>{},onRetry=()=>{},fetchImpl=fetch}) {
  if(provider?.protocol==='codex')return callCodexModel({provider,messages,tools,toolDefinitions,signal,onDelta,onRetry,fetchImpl});
  if(!provider?.baseUrl||!provider?.model)throw new Error('请先配置后端地址和模型');
  if(!['openai','anthropic'].includes(provider.protocol))throw new Error('不支持的后端协议');
  const base=new URL(provider.baseUrl);
  if(base.username||base.password)throw new Error('请勿将凭据写入 URL');
  if(base.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(base.hostname))throw new Error('模型后端需要 HTTPS；局域网 HTTP 受浏览器策略限制');
  const isAnthropic=provider.protocol==='anthropic';
  const suffix=isAnthropic?'messages':'chat/completions';
  const root=rootURL(base.href);
  const prefix=isAnthropic&&!/\/v\d+$/.test(root.pathname)?'/v1':(!isAnthropic&&root.hostname==='api.openai.com'&&root.pathname==='/'?'/v1':'');
  const inference=new URL(base),basePath=base.pathname.replace(/\/$/,'');
  inference.pathname=basePath.endsWith('/'+suffix)?basePath:root.pathname.replace(/\/$/,'')+prefix+'/'+suffix;inference.hash='';
  const endpoint=inference.href;
  const headers={'content-type':'application/json'};
  if(credential){if(isAnthropic)headers['x-api-key']=credential;else headers.authorization='Bearer '+credential;}
  if(isAnthropic){headers['anthropic-version']='2023-06-01';headers['anthropic-dangerous-direct-browser-access']='true';}
  const canonicalEndpoint=new URL(endpoint);canonicalEndpoint.hash='';
  const scope={kind:provider.protocol,origin:base.origin,endpoint:canonicalEndpoint.href,accountId:provider.accountId||provider.id||'',model:provider.model};
  const payload={model:provider.model,stream:provider.stream!==false,messages:isAnthropic?anthropicMessages(messages,scope):openaiMessages(messages,scope,base.hostname==='api.deepseek.com')};
  Object.assign(payload,reasoningParameters(provider));
  if(!isAnthropic&&base.hostname==='api.openai.com'&&provider.promptCacheKey)payload.prompt_cache_key=provider.promptCacheKey;
  if(provider.maxTokens&&Number.isInteger(provider.maxTokens)&&provider.maxTokens>0)payload[base.hostname==='api.openai.com'&&payload.reasoning_effort?'max_completion_tokens':'max_tokens']=provider.maxTokens;
  if(isAnthropic){payload.max_tokens=provider.maxTokens||4096;payload.system=messages.filter(m=>m.role==='system').map(m=>m.text).join('\n\n');}
  if(!isAnthropic&&payload.stream&&['api.openai.com','api.deepseek.com'].includes(base.hostname))payload.stream_options={include_usage:true};
  // Only send provider-specific cache hints to the official native endpoint.
  if(isAnthropic&&base.hostname==='api.anthropic.com'){
    // Keep an explicit static-prefix read point and let the native API advance
    // the conversation cache point as new messages and tool results are added.
    payload.cache_control={type:'ephemeral'};
    if(payload.system)payload.system=[{type:'text',text:payload.system,cache_control:{type:'ephemeral'}}];
  }
  if(toolDefinitions.length)payload.tools=isAnthropic?toolDefinitions.map(t=>({name:t.name,description:t.description,input_schema:t.schema})):toolDefinitions.map(t=>({type:'function',function:{name:t.name,description:t.description,parameters:t.schema}}));
  // DeepSeek drops native tool instructions with `none`; Claude invalidates
  // message caches when tool_choice changes. Summaries retain that reference
  // format, while their caller permits no execution and validates plain text.
  const referenceOnlySummary=purpose==='compaction'&&['api.deepseek.com','api.anthropic.com'].includes(base.hostname);
  if(toolDefinitions.length&&!tools.length&&!referenceOnlySummary)payload.tool_choice=isAnthropic?{type:'none'}:'none';
  const controller=new AbortController();const abort=()=>controller.abort(signal?.reason);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const timer=setTimeout(()=>controller.abort(new Error('模型请求超过总时限')),provider.timeoutMs||180000);
  try {
    const response=await fetchImpl(endpoint,{method:'POST',headers,body:JSON.stringify(payload),signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
    if(!response.ok)throw await readProviderFailure(response,{signal:controller.signal});
    let text='',finish=null,ended=false,usage,reasoningContent='';const thinking=new Map();const calls=new Map();let opaqueBytes=128;
    const addCall=(index,c)=>{if(isAnthropic&&(!Number.isInteger(index)||index<0||index>=PROVIDER_LIMITS.thinkingBlocks))throw providerError('Model block index exceeded its limit');if(calls.has(index)||calls.size>=PROVIDER_LIMITS.toolCalls)throw providerError('Tool call count exceeded its limit');toolIdentity(c.id,'Tool ID',PROVIDER_LIMITS.toolIdChars);toolIdentity(c.name,'Tool name',PROVIDER_LIMITS.toolNameChars);if(typeof c.args!=='string'||utf8(c.args)>PROVIDER_LIMITS.toolArgumentBytes)throw providerError('Tool arguments exceeded their size limit');if(c.initial!==undefined&&jsonBytes(c.initial)>PROVIDER_LIMITS.toolArgumentBytes)throw providerError('Tool arguments exceeded their size limit');c.argsBytes=utf8(c.args);calls.set(index,c);};
    const addThinking=(index,b)=>{if(!Number.isInteger(index)||index<0||index>=PROVIDER_LIMITS.thinkingBlocks)throw providerError('Model block index exceeded its limit');if(thinking.has(index)||thinking.size>=PROVIDER_LIMITS.thinkingBlocks)throw providerError('Model protocol block count exceeded its limit');for(const key of ['thinking','signature','data'])if(b[key]!==undefined&&typeof b[key]!=='string')throw providerError('Invalid model protocol state','PROVIDER_RESPONSE_INVALID');const bytes=jsonBytes(b)+1;if(opaqueBytes+bytes>PROVIDER_LIMITS.stateBytes)throw providerError('Model protocol state exceeded its size limit');opaqueBytes+=bytes;thinking.set(index,{...b});};
    const addThinkingDelta=(index,key,chunk)=>{const b=thinking.get(index);if(!b||typeof chunk!=='string'||b[key]!==undefined&&typeof b[key]!=='string')throw providerError('Invalid thinking block boundary','PROVIDER_RESPONSE_INVALID');const old=b[key]||'',extra=encodedStringBytes(chunk)-(joinsPair(old,chunk)?8:0)+(Object.hasOwn(b,key)?0:jsonBytes(key)+4);if(opaqueBytes+extra>PROVIDER_LIMITS.stateBytes)throw providerError('Model protocol state exceeded its size limit');b[key]=old+chunk;opaqueBytes+=extra;};
    const addReasoning=chunk=>{if(typeof chunk!=='string')throw providerError('Invalid model protocol state','PROVIDER_RESPONSE_INVALID');const extra=encodedStringBytes(chunk)-(joinsPair(reasoningContent,chunk)?8:0);if(opaqueBytes+extra>PROVIDER_LIMITS.stateBytes)throw providerError('Model protocol state exceeded its size limit');reasoningContent+=chunk;opaqueBytes+=extra;};
    const addText=chunk=>{if(chunk){text+=chunk;if(text.length>1000000)throw new Error('模型输出超过容量限制');try{onDelta(chunk);}catch{}}};
    if(provider.stream===false) {
      const data=JSON.parse(await readText(response,{maxBytes:2000000,signal:controller.signal}));usage=data.usage;
      if(isAnthropic){finish=data.stop_reason;for(const [index,b] of (data.content||[]).entries()){if(['thinking','redacted_thinking'].includes(b.type))addThinking(index,b);if(b.type==='text')addText(b.text);if(b.type==='tool_use')addCall(index,{id:b.id,name:b.name,args:JSON.stringify(b.input)});}}
      else {const choice=data.choices?.[0];if(!choice)throw new Error('后端没有返回候选回复');finish=choice.finish_reason;addReasoning(choice.message?.reasoning_content||'');addText(choice.message?.content);for(const c of choice.message?.tool_calls||[])addCall(c.id,{id:c.id,name:c.function?.name,args:c.function?.arguments});}
      ended=true;
    } else {
      if(!response.body)throw new Error('后端没有返回可读的响应流');
      for await(const raw of readSSE(response.body)) {
        if(raw==='[DONE]'){ended=true;break;}
        const e=JSON.parse(raw);if(e.usage)usage={...usage,...e.usage};if(e.message?.usage)usage={...usage,...e.message.usage};
        if(e.error||e.type==='error')throw contextOverflowError(e)||new Error('后端返回流式错误');
        if(isAnthropic){
          if(e.type==='content_block_start'&&['thinking','redacted_thinking'].includes(e.content_block?.type))addThinking(e.index,e.content_block);
          if(e.type==='content_block_delta'&&['thinking_delta','signature_delta'].includes(e.delta?.type)){const key=e.delta.type==='thinking_delta'?'thinking':'signature';addThinkingDelta(e.index,key,e.delta[key]||'');}
          if(e.type==='content_block_start'&&e.content_block?.type==='tool_use')addCall(e.index,{id:e.content_block.id,name:e.content_block.name,args:'',initial:e.content_block.input});
          if(e.type==='content_block_delta'){if(e.delta?.type==='text_delta')addText(e.delta.text);if(e.delta?.type==='input_json_delta'){const c=calls.get(e.index);if(!c)throw new Error('工具参数缺少起始事件');appendBounded(c,'args',e.delta.partial_json,PROVIDER_LIMITS.toolArgumentBytes,'Tool arguments');}}
          if(e.type==='message_delta')finish=e.delta?.stop_reason||finish;
          if(e.type==='message_stop'){ended=true;break;}
        } else {
          const choice=e.choices?.[0];if(!choice)continue;addReasoning(choice.delta?.reasoning_content||'');addText(choice.delta?.content);
          for(const c of choice.delta?.tool_calls||[]){if(!Number.isInteger(c.index)||c.index<0||c.index>=PROVIDER_LIMITS.toolCalls)throw providerError('Tool call index exceeded its limit');let old=calls.get(c.index);if(!old){if(calls.size>=PROVIDER_LIMITS.toolCalls)throw providerError('Tool call count exceeded its limit');old={id:'',name:'',args:'',argsBytes:0};calls.set(c.index,old);}if(c.id!==undefined)old.id=toolIdentity(c.id,'Tool ID',PROVIDER_LIMITS.toolIdChars);const name=c.function?.name||'';if(typeof name!=='string'||old.name.length+name.length>PROVIDER_LIMITS.toolNameChars)throw providerError('Tool name exceeded its size limit');old.name+=name;appendBounded(old,'args',c.function?.arguments||'',PROVIDER_LIMITS.toolArgumentBytes,'Tool arguments');}
          finish=choice.finish_reason||finish;
        }
      }
    }
    if(!ended)throw new Error('模型响应未正常结束；未执行其中的操作');
    if(['length','max_tokens'].includes(finish))throw new Error('模型回复被截断；未执行其中的操作');
    if(!finish)throw new Error('模型缺少结束状态');
    if(!(isAnthropic?['end_turn','tool_use','stop_sequence']:['stop','tool_calls']).includes(finish))throw new Error('模型拒绝、过滤或返回了尚不支持的结束状态：'+finish);
    const seenIds=new Set();const toolCalls=[...calls.values()].map(c=>{toolIdentity(c.id,'Tool ID',PROVIDER_LIMITS.toolIdChars);toolIdentity(c.name,'Tool name',PROVIDER_LIMITS.toolNameChars);if(seenIds.has(c.id))throw providerError('Duplicate tool call ID','PROVIDER_RESPONSE_INVALID');seenIds.add(c.id);if(typeof c.args!=='string'||utf8(c.args)>PROVIDER_LIMITS.toolArgumentBytes)throw providerError('Tool arguments exceeded their size limit');return {id:c.id,name:c.name,arguments:c.args?JSON.parse(c.args):(c.initial||{})};});
    const opaque={...(reasoningContent?{reasoningContent}:{}),...(thinking.size?{thinkingBlocks:[...thinking].sort((a,b)=>a[0]-b[0]).map(([i,v])=>v)}:{})};if(jsonBytes(opaque)>PROVIDER_LIMITS.stateBytes)throw providerError('Model protocol state exceeded its size limit');
    return {text,toolCalls,finish,...(Object.keys(opaque).length?{providerState:{...scope,...opaque}}:{}),...(usage?{usage,cache:cacheUsage(usage,isAnthropic)}:{})};
  } catch(e) {if(credential&&String(e.message).includes(credential))throw new Error('模型通信失败，敏感错误已隐藏');throw e;}
  finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
