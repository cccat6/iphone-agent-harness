import test from 'node:test';import assert from 'node:assert/strict';
import {MCPClient} from '../../apps/web/core/mcp.js';
import {DeviceClient} from '../../apps/web/core/device.js';
import {startCodexLogin} from '../../apps/web/core/codex.js';
import {CommunityClient} from '../../apps/web/community/client.js';
// Browser native fetch uses a WebIDL receiver check absent from Node's fetch.
function brandChecked(reply){return function(url,init){assert.equal(this,globalThis,'native browser fetch requires its global receiver');return Promise.resolve(reply(url,init));};}
test('MCP invokes a browser-style fetch with the global receiver',async()=>{const client=new MCPClient({url:'https://mcp.invalid/mcp',fetchImpl:brandChecked((url,o)=>{const r=JSON.parse(o.body);return r.method==='notifications/initialized'?new Response(null,{status:202}):Response.json({jsonrpc:'2.0',id:r.id,result:{protocolVersion:'2025-11-25',capabilities:{}}});})});assert.equal((await client.initialize()).protocolVersion,'2025-11-25');});
test('device diagnostics invoke a browser-style fetch with the global receiver',async()=>{const client=new DeviceClient({baseUrl:'https://board.invalid',fetchImpl:brandChecked(()=>Response.json({executionEnabled:true,maxRequestBytes:8192}))});assert.equal((await client.capabilities()).maxRequestBytes,8192);});
test('community catalog invokes a browser-style fetch with the global receiver',async()=>{const client=new CommunityClient({baseUrl:'https://community.invalid',fetchImpl:brandChecked(()=>Response.json({items:[]}))});assert.deepEqual((await client.list()).items,[]);});
test('device authorization invokes a browser-style fetch with the global receiver',async()=>{const login=await startCodexLogin({fetchImpl:brandChecked(()=>Response.json({device_auth_id:'test-id',user_code:'test-code'}))});assert.equal(login.user_code,'test-code');});
