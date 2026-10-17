// Read-only, non-sensitive acceptance against Cloudflare's official public docs MCP.
import {createMCPAccess} from '../apps/web/core/mcp.js';
import {writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{fetch,EnvHttpProxyAgent}=require('undici'),dispatcher=new EnvHttpProxyAgent();
const endpoint='https://docs.mcp.cloudflare.com/mcp',checks=[];
const request=(url,init)=>fetch(url,{...init,dispatcher});
const access=createMCPAccess({fetchImpl:request});
try{
 access.configure({id:'official-docs',name:'Cloudflare documentation',url:endpoint});
 const connection=await access.connect('official-docs');checks.push({name:'initialize-and-tool-directory',passed:connection.connected&&connection.tools.length>0,tools:connection.tools.map(t=>t.name)});
 checks.push({name:'disabled-by-default',passed:access.hasAuthorizedTools()===false});
 const name='search_cloudflare_documentation';access.setAllowedTools('official-docs',[name]);access.setEnabled('official-docs',true);
 const list=await access.listForModel({});checks.push({name:'only-selected-tool-exposed',passed:list.tools.length===1&&list.tools[0].name===name});
 const value=await access.call({serverId:'official-docs',name,arguments:{query:'Workers compatibility_date 2026-10-17' }},{mode:'task'});
 checks.push({name:'real-readonly-tool-call',passed:value.status==='returned'&&Array.isArray(value.result.content),resultBlocks:value.result?.content?.length||0});
 access.setEnabled('official-docs',false);let rejected=false;try{await access.call({serverId:'official-docs',name,arguments:{query:'unused'}},{mode:'task'});}catch(error){rejected=error.code==='MCP_NOT_AUTHORIZED';}checks.push({name:'revoked-tool-rejected',passed:rejected});
 const cors=await request(endpoint,{method:'OPTIONS',headers:{Origin:'https://igent.cc','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,mcp-protocol-version,mcp-session-id'},signal:AbortSignal.timeout(20000)});
 checks.push({name:'browser-preflight-headers',httpStatus:cors.status,passed:cors.ok&&['*','https://igent.cc'].includes(cors.headers.get('access-control-allow-origin'))&&(cors.headers.get('access-control-allow-headers')||'').toLowerCase().includes('content-type'),allowOrigin:cors.headers.get('access-control-allow-origin'),allowHeaders:cors.headers.get('access-control-allow-headers')});await cors.body?.cancel();
}catch(error){checks.push({name:'live-check-error',passed:false,code:error.code||error.name,reason:error.reason});process.exitCode=1;}
finally{access.disconnect('official-docs');await dispatcher.close();}
const report={checkedAt:new Date().toISOString(),endpoint,scope:'Mac Node production MCP permission bridge, real public read-only service; not an iPhone browser run',containsUserData:false,responseContentStored:false,checks,passed:checks.every(x=>x.passed)};
await writeFile(new URL('../docs/research/mcp-live-verification.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
