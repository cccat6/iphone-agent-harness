import test from 'node:test';
import assert from 'node:assert/strict';
import {mcpEndpointForStorage} from '../../apps/web/ui/mcp-settings.js';
import {MCP_MESSAGES} from '../../apps/web/locales/mcp.js';
test('MCP endpoint settings never contain connection query credentials',()=>{
  const value=mcpEndpointForStorage('https://mcp.example/service?token=mock-secret&project=test');
  assert.equal(value,'https://mcp.example/service');assert.ok(!value.includes('mock-secret'));
  assert.equal(mcpEndpointForStorage('http://localhost:18833/mcp?auth=mock'),'http://localhost:18833/mcp');
});
test('MCP settings reject URL user information and fragments before connecting',()=>{
  for(const url of ['https://user:password@example.test/mcp','https://example.test/mcp#secret'])assert.throws(()=>mcpEndpointForStorage(url),{code:'MCP_INVALID_ENDPOINT'});
});
test('MCP permission UI has all eight locales and matching placeholders',()=>{
  assert.equal(Object.keys(MCP_MESSAGES).length,8);
  for(const [locale,dictionary] of Object.entries(MCP_MESSAGES)){assert.deepEqual(Object.keys(dictionary).sort(),Object.keys(MCP_MESSAGES.en).sort());for(const [key,value] of Object.entries(dictionary)){assert.ok(value.trim(),locale+':'+key);assert.deepEqual((value.match(/\{\w+\}/g)||[]).sort(),(MCP_MESSAGES.en[key].match(/\{\w+\}/g)||[]).sort(),locale+':'+key);}}
});
