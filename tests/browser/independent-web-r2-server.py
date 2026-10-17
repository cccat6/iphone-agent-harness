#!/usr/bin/env python3
"""Loopback-only R2 fixture: current build, isolated phone UA, real HTTP MCP mock."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit
from functools import partial
import threading, json
ThreadingHTTPServer.request_queue_size=128
ROOT=Path(__file__).resolve().parents[2]
SITE=ROOT/'build/site'
PRELUDE="""<script>Object.defineProperty(navigator,'userAgent',{value:'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 Version/27.0 Mobile/15E148 Safari/604.1'});localStorage.setItem('iah.locale','en');</script>"""
class Page(SimpleHTTPRequestHandler):
 def do_GET(self):
  path=urlsplit(self.path).path
  if path=='/qa-mcp-http':
   raw=(ROOT/'tests/browser/mcp-http-r2.html').read_bytes()
  elif path in ['/','/main','/skills','/flash']:
   raw=(SITE/'index.html').read_bytes()
   if self.server.server_port==18852: raw=raw.replace(b'<script src="./bootstrap.js"></script>',PRELUDE.encode()+b'<script src="./bootstrap.js"></script>')
  else:return super().do_GET()
  self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
class MCP(BaseHTTPRequestHandler):
 def cors(self):
  self.send_header('Access-Control-Allow-Origin','http://127.0.0.1:18851');self.send_header('Vary','Origin');self.send_header('Access-Control-Allow-Headers','content-type,authorization,mcp-session-id,mcp-protocol-version');self.send_header('Access-Control-Allow-Methods','POST,OPTIONS');self.send_header('Access-Control-Expose-Headers','MCP-Session-Id')
 def do_OPTIONS(self):
  print('MCP OPTIONS',self.headers.get('Origin'),self.headers.get('Access-Control-Request-Headers'),flush=True);self.send_response(204);self.cors();self.end_headers()
 def do_POST(self):
  rpc=json.loads(self.rfile.read(int(self.headers['Content-Length'])));method=rpc['method'];session=self.headers.get('MCP-Session-Id');version=self.headers.get('MCP-Protocol-Version');auth=self.headers.get('Authorization')=='Bearer mock-r2-token'
  print('MCP POST',method,'origin='+str(self.headers.get('Origin')),'session='+str(session),'version='+str(version),'auth='+str(auth),flush=True)
  valid=auth and (method=='initialize' or session=='r2-session' and version=='2025-11-25')
  if not valid:self.send_response(400);self.cors();self.end_headers();return
  if method=='notifications/initialized':self.send_response(202);self.cors();self.end_headers();return
  if method=='initialize':result={'protocolVersion':'2025-11-25','capabilities':{'tools':{}},'serverInfo':{'name':'R2 loopback mock','version':'1'}}
  elif method=='tools/list':result={'tools':[{'name':'echo','description':'Readonly echo only','inputSchema':{'type':'object','properties':{'text':{'type':'string'}},'required':['text'],'additionalProperties':False}}]}
  elif method=='tools/call':result={'content':[{'type':'text','text':rpc['params']['arguments']['text']}]}
  else:raise ValueError(method)
  raw=json.dumps({'jsonrpc':'2.0','id':rpc['id'],'result':result}).encode();self.send_response(200);self.cors();self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)))
  if method=='initialize':self.send_header('MCP-Session-Id','r2-session')
  self.end_headers();self.wfile.write(raw)
servers=[ThreadingHTTPServer(('127.0.0.1',p),partial(Page,directory=str(SITE))) for p in [18851,18852]]+[ThreadingHTTPServer(('127.0.0.1',18853),MCP)]
for s in servers:threading.Thread(target=s.serve_forever,daemon=True).start()
print('R2 desktop 18851, mock-phone 18852, mock MCP 18853',flush=True)
try:threading.Event().wait()
except KeyboardInterrupt:
 for s in servers:s.shutdown()
