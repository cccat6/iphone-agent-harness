import {readSSE} from './providers.js';
// Optional fixed bridge, not a plugin host. stdio and executable packages are absent.
export class MCPClient {
  constructor({url,token='',fetchImpl=fetch}){this.url=new URL(url);if(this.url.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(this.url.hostname))throw new Error('MCP 需要浏览器可访问的 HTTPS 端点');this.token=token;this.fetchImpl=fetchImpl;this.sessionId=null;this.version=null;this.counter=0;}
  async rpc(method,params={}, {signal,notification=false}={}){
    const id=++this.counter,controller=new AbortController(),abort=()=>controller.abort(signal?.reason);
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();const timer=setTimeout(()=>controller.abort(),60000);
    const headers={'content-type':'application/json',accept:'application/json, text/event-stream'};
    if(this.token)headers.authorization='Bearer '+this.token;
    if(this.sessionId)headers['MCP-Session-Id']=this.sessionId;
    if(this.version)headers['MCP-Protocol-Version']=this.version;
    try{
      const r=await this.fetchImpl(this.url,{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',...(notification?{}:{id}),method,params}),signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
      if(!r.ok)throw new Error(`MCP 请求失败（${r.status}）；检查认证、CORS 和会话状态`);
      if(method==='initialize')this.sessionId=r.headers.get('MCP-Session-Id');
      if(notification&&r.status===202)return;
      let result;
      if(r.headers.get('content-type')?.includes('text/event-stream')){
        for await(const raw of readSSE(r.body)){let event;try{event=JSON.parse(raw);}catch{throw new Error('无效的 MCP SSE JSON');}if(event.id===id){result=event;break;}if(event.method&&'id'in event)throw new Error('此轻量客户端不支持服务器主动请求');}
      }else result=await r.json();
      if(notification)return;
      if(result?.id!==id||result.jsonrpc!=='2.0')throw new Error('MCP 返回未匹配的请求 ID');
      if(result.error)throw new Error(`MCP RPC 错误 ${result.error.code}`);
      return result.result;
    }finally{clearTimeout(timer);controller.abort();signal?.removeEventListener('abort',abort);}
  }
  async initialize(options={}){const r=await this.rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'iphone-automation-harness',version:'0.1.0'}},options);if(!['2025-11-25','2025-06-18','2025-03-26'].includes(r?.protocolVersion))throw new Error('不支持的 MCP 协议版本');this.version=r.protocolVersion;await this.rpc('notifications/initialized',{}, {...options,notification:true});return r;}
  async listTools(options={}){const all=[];let cursor;for(let page=0;page<20;page++){const r=await this.rpc('tools/list',cursor?{cursor}:{},options);if(!Array.isArray(r.tools))throw new Error('无效工具目录');all.push(...r.tools);if(all.length>500)throw new Error('MCP 工具目录超过限额');cursor=r.nextCursor;if(!cursor)return all;}throw new Error('MCP 工具分页超过限额');}
  async callTool(name,args,{allowedTools=[],...options}={}){if(!allowedTools.includes(name))throw new Error('该 MCP 工具尚未被用户启用');return this.rpc('tools/call',{name,arguments:args},options);}
}
