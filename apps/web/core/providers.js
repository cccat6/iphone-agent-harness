// Two fixed wire protocols; no provider plugin registry or remote executable code.
export async function* readSSE(body) {
  const reader=body.getReader(), decoder=new TextDecoder(); let buffer='';
  try {
    while(true) {
      const {value,done}=await reader.read();buffer+=decoder.decode(value,{stream:!done});
      let match;
      while((match=/\r?\n\r?\n/.exec(buffer))) {
        const block=buffer.slice(0,match.index);buffer=buffer.slice(match.index+match[0].length);
        const data=block.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).replace(/^ /,'')).join('\n');
        if(data)yield data;
      }
      if(done){if(buffer.trim()&&!buffer.trim().startsWith(':'))throw new Error('流在完整事件结束前断开');return;}
    }
  } finally {reader.releaseLock();}
}
function anthropicMessages(messages) {
  return messages.filter(m=>m.role!=='system').map(m=>{
    if(m.role==='tool')return {role:'user',content:[{type:'tool_result',tool_use_id:m.toolCallId,content:[{type:'text',text:m.text||' '},...(m.images||[]).map(image=>{const match=/^data:([^;]+);base64,(.+)$/.exec(image);if(!match)throw new Error('图片必须为本地数据格式');return {type:'image',source:{type:'base64',media_type:match[1],data:match[2]}};})]}]};
    const content=[...(m.text?[{type:'text',text:m.text}]:[])];
    for(const image of m.images||[]) {const match=/^data:([^;]+);base64,(.+)$/.exec(image);if(!match)throw new Error('图片必须为本地数据格式');content.push({type:'image',source:{type:'base64',media_type:match[1],data:match[2]}});}
    for(const t of m.toolCalls||[])content.push({type:'tool_use',id:t.id,name:t.name,input:t.arguments});
    return {role:m.role,content:content.length?content:[{type:'text',text:' '}]};
  });
}
function openaiMessages(messages) {
  return messages.flatMap(m=>{
    const images=m.images?.map(url=>({type:'image_url',image_url:{url}}))||[];
    const value={role:m.role,content:images.length&&m.role!=='tool'?[{type:'text',text:m.text||''},...images]:m.text||'',...(m.toolCallId?{tool_call_id:m.toolCallId}:{}),...(m.toolCalls?.length?{tool_calls:m.toolCalls.map(t=>({id:t.id,type:'function',function:{name:t.name,arguments:JSON.stringify(t.arguments)}}))}:{})};
    return m.role==='tool'&&images.length?[value,{role:'user',content:[{type:'text',text:'Observation images for the preceding tool result.'},...images]}]:[value];
  });
}
function rootURL(value){const u=new URL(value);if(u.username||u.password)throw new Error('请勿将凭据写入 URL');if(u.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(u.hostname))throw new Error('后端需要 HTTPS，局域网 HTTP 受浏览器策略限制');u.pathname=u.pathname.replace(/\/(chat\/completions|messages|responses)\/?$/,'').replace(/\/$/,'');return u;}
export async function discoverModels({protocol,baseUrl,credential='',fetchImpl=fetch}){
  if(!['openai','anthropic'].includes(protocol))throw new Error('不支持的模型目录协议');
  const root=rootURL(baseUrl),headers={accept:'application/json'};let url;
  // DeepSeek's official model catalog is shared by both compatible inference APIs.
  if(root.hostname==='api.deepseek.com'){url=new URL('/models',root);if(credential)headers.authorization='Bearer '+credential;}
  else if(protocol==='anthropic'){url=new URL(root.href);url.pathname=root.pathname.replace(/\/$/,'')+(/\/v\d+$/.test(root.pathname)?'/models':'/v1/models');headers['anthropic-version']='2023-06-01';headers['anthropic-dangerous-direct-browser-access']='true';if(credential)headers['x-api-key']=credential;}
  else {url=new URL(root.href);const path=root.pathname.replace(/\/$/,'');url.pathname=path+(root.hostname==='api.openai.com'&&!path?'/v1/models':'/models');if(credential)headers.authorization='Bearer '+credential;}
  const models=[];let pages=0;
  while(true){const r=await fetchImpl(url,{headers,credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error(`模型目录返回 HTTP ${r.status}；可检查权限、CORS 或手动填写模型`);const data=await r.json();const entries=data.data||data.models;if(!Array.isArray(entries))throw new Error('模型目录没有返回有效列表');for(const m of entries)if(typeof m.id==='string'&&!models.some(v=>v.id===m.id))models.push({id:m.id,name:m.display_name||m.name||m.id});if(models.length>2000)throw new Error('模型目录超过限额');if(!data.has_more)return models;if(!data.last_id||++pages>=20)throw new Error('模型目录分页不完整');url.searchParams.set('after_id',data.last_id);}
}
export async function callModel({provider,credential,messages,tools=[],signal,onDelta=()=>{},fetchImpl=fetch}) {
  if(!provider?.baseUrl||!provider?.model)throw new Error('请先配置后端地址和模型');
  if(!['openai','anthropic'].includes(provider.protocol))throw new Error('不支持的后端协议');
  const base=new URL(provider.baseUrl);
  if(base.username||base.password)throw new Error('请勿将凭据写入 URL');
  if(base.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(base.hostname))throw new Error('模型后端需要 HTTPS；局域网 HTTP 受浏览器策略限制');
  const isAnthropic=provider.protocol==='anthropic';
  const suffix=isAnthropic?'messages':'chat/completions';
  const root=rootURL(base.href);
  const prefix=isAnthropic&&!/\/v\d+$/.test(root.pathname)?'/v1':(!isAnthropic&&root.hostname==='api.openai.com'&&root.pathname==='/'?'/v1':'');
  const endpoint=base.href.replace(/\/$/,'').endsWith('/'+suffix)?base.href:root.href.replace(/\/$/,'')+prefix+'/'+suffix;
  const headers={'content-type':'application/json'};
  if(credential){if(isAnthropic)headers['x-api-key']=credential;else headers.authorization='Bearer '+credential;}
  if(isAnthropic){headers['anthropic-version']='2023-06-01';headers['anthropic-dangerous-direct-browser-access']='true';}
  const payload={model:provider.model,stream:provider.stream!==false,messages:isAnthropic?anthropicMessages(messages):openaiMessages(messages)};
  if(isAnthropic){payload.max_tokens=provider.maxTokens||4096;payload.system=messages.filter(m=>m.role==='system').map(m=>m.text).join('\n\n');}
  if(tools.length)payload.tools=isAnthropic?tools.map(t=>({name:t.name,description:t.description,input_schema:t.schema})):tools.map(t=>({type:'function',function:{name:t.name,description:t.description,parameters:t.schema}}));
  const controller=new AbortController();const abort=()=>controller.abort(signal?.reason);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const timer=setTimeout(()=>controller.abort(new Error('模型请求超过总时限')),provider.timeoutMs||180000);
  try {
    const response=await fetchImpl(endpoint,{method:'POST',headers,body:JSON.stringify(payload),signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
    if(!response.ok)throw new Error(`模型请求失败（HTTP ${response.status}）；请检查地址、权限、额度或 CORS`);
    let text='',finish=null,ended=false;const calls=new Map();
    const addText=chunk=>{if(chunk){text+=chunk;onDelta(chunk);}};
    if(provider.stream===false) {
      const data=await response.json();
      if(isAnthropic){finish=data.stop_reason;for(const b of data.content||[]){if(b.type==='text')addText(b.text);if(b.type==='tool_use')calls.set(b.id,{id:b.id,name:b.name,args:JSON.stringify(b.input)});}}
      else {const choice=data.choices?.[0];if(!choice)throw new Error('后端没有返回候选回复');finish=choice.finish_reason;addText(choice.message?.content);for(const c of choice.message?.tool_calls||[])calls.set(c.id,{id:c.id,name:c.function.name,args:c.function.arguments});}
      ended=true;
    } else {
      if(!response.body)throw new Error('后端没有返回可读的响应流');
      for await(const raw of readSSE(response.body)) {
        if(raw==='[DONE]'){ended=true;continue;}
        const e=JSON.parse(raw);
        if(e.error||e.type==='error')throw new Error('后端返回流式错误');
        if(isAnthropic){
          if(e.type==='content_block_start'&&e.content_block?.type==='tool_use')calls.set(e.index,{id:e.content_block.id,name:e.content_block.name,args:'',initial:e.content_block.input});
          if(e.type==='content_block_delta'){if(e.delta?.type==='text_delta')addText(e.delta.text);if(e.delta?.type==='input_json_delta'){const c=calls.get(e.index);if(!c)throw new Error('工具参数缺少起始事件');c.args+=e.delta.partial_json;}}
          if(e.type==='message_delta')finish=e.delta?.stop_reason||finish;
          if(e.type==='message_stop')ended=true;
        } else {
          const choice=e.choices?.[0];if(!choice)continue;addText(choice.delta?.content);
          for(const c of choice.delta?.tool_calls||[]){const old=calls.get(c.index)||{id:'',name:'',args:''};old.id=c.id||old.id;old.name+=c.function?.name||'';old.args+=c.function?.arguments||'';calls.set(c.index,old);}
          finish=choice.finish_reason||finish;
        }
      }
    }
    if(!ended)throw new Error('模型响应未正常结束；未执行其中的操作');
    if(['length','max_tokens'].includes(finish))throw new Error('模型回复被截断；未执行其中的操作');
    if(!finish)throw new Error('模型缺少结束状态');
    const toolCalls=[...calls.values()].map(c=>{if(!c.id||!c.name)throw new Error('不完整的工具调用');return {id:c.id,name:c.name,arguments:c.args?JSON.parse(c.args):(c.initial||{})};});
    return {text,toolCalls,finish};
  } catch(e) {if(credential&&String(e.message).includes(credential))throw new Error('模型通信失败，敏感错误已隐藏');throw e;}
  finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
