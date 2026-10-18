#!/usr/bin/env python3
"""Finite local-network browser fixture; no device credentials or control endpoints."""
import argparse,base64,hashlib,json,struct
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from datetime import datetime,timezone
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def record(self):
  print(json.dumps({'at':datetime.now(timezone.utc).isoformat(),'method':self.command,'path':self.path,'origin':self.headers.get('Origin'),'userAgent':self.headers.get('User-Agent')},ensure_ascii=False),flush=True)
 def cors(self):
  origin=self.headers.get('Origin','')
  if origin in self.server.origins:self.send_header('Access-Control-Allow-Origin',origin)
  self.send_header('Vary','Origin');self.send_header('Access-Control-Allow-Methods','GET, POST, OPTIONS');self.send_header('Access-Control-Allow-Headers','content-type,x-request-id');self.send_header('Access-Control-Allow-Private-Network','true');self.send_header('Cache-Control','no-store')
 def json(self,status,value):
  data=json.dumps(value).encode();self.send_response(status);self.cors();self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
 def do_OPTIONS(self):self.record();self.send_response(204);self.cors();self.end_headers()
 def do_POST(self):
  self.record();length=int(self.headers.get('Content-Length','0'))
  if self.path!='/v1/probe' or length>1024:return self.json(400,{'error':'probe_only'})
  try:data=json.loads(self.rfile.read(length))
  except Exception:return self.json(400,{'error':'invalid_json'})
  self.json(200,{'probe':data.get('probe') is True,'nonce':data.get('nonce'),'phoneInputSent':False})
 def do_GET(self):
  self.record()
  if self.path=='/v1/identity':return self.json(200,{'boardId':'browser-lan-fixture','transport':'http','phoneInputSent':False})
  if self.path=='/helper':
   page="""<!doctype html><meta name='viewport' content='width=device-width'><meta charset='utf-8'><title>LAN connection test</title><h1>LAN connection test</h1><p id='state'>Testing this local connection...</p><p>请在 Safari 切回原来的 Harness 标签页，并保持此标签页打开。 Switch back to the original Harness tab in Safari and keep this tab open.</p><button onclick='window.opener?.focus()'>Return to Harness</button><script>
   const params=new URLSearchParams(location.hash.slice(1)),origin=params.get('origin'),nonce=params.get('nonce');history.replaceState(null,'',location.pathname);
   if(origin!=='https://igent.cc'||!nonce||!window.opener){document.querySelector('#state').textContent='No opener window.';}else{
    addEventListener('message',async event=>{if(event.source!==window.opener||event.origin!==origin||event.data?.nonce!==nonce||event.data.type!=='iah-helper-probe'||!['GET','POST'].includes(event.data.method)||typeof event.data.requestId!=='string')return;
     const method=event.data.method,requestId=event.data.requestId,receivedAt=new Date().toISOString();try{const response=await fetch(method==='GET'?'/v1/identity':'/v1/probe',{method,headers:method==='POST'?{'content-type':'application/json'}:{},body:method==='POST'?JSON.stringify({probe:true,nonce}):undefined,cache:'no-store'});const result=await response.json();window.opener.postMessage({type:'iah-helper-result',nonce,requestId,method,helperReceivedAt:receivedAt,helperRespondedAt:new Date().toISOString(),status:response.status,result,helperVisibility:document.visibilityState},origin);document.querySelector('#state').textContent='Test received. Return to Harness.';}catch(error){window.opener.postMessage({type:'iah-helper-result',nonce,requestId,method,helperReceivedAt:receivedAt,helperRespondedAt:new Date().toISOString(),error:error.message,helperVisibility:document.visibilityState},origin);}
    });window.opener.postMessage({type:'iah-helper-ready',nonce},origin);
   }</script>""".encode()
   self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(page)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(page);return

  if self.path!='/iah-probe' or self.headers.get('Upgrade','').lower()!='websocket':return self.json(404,{'error':'not_found'})
  if self.headers.get('Origin') not in self.server.origins:return self.json(403,{'error':'origin_not_allowed'})
  key=self.headers.get('Sec-WebSocket-Key','');accept=base64.b64encode(hashlib.sha1((key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode();self.send_response(101);self.send_header('Upgrade','websocket');self.send_header('Connection','Upgrade');self.send_header('Sec-WebSocket-Accept',accept);self.end_headers();self.connection.settimeout(6)
  try:
   header=self.rfile.read(2)
   if len(header)!=2 or header[0]!=129 or not header[1]&128:return
   length=header[1]&127
   if length>125:return
   mask=self.rfile.read(4);raw=self.rfile.read(length)
   if len(mask)!=4 or len(raw)!=length:return
   message=bytes(v^mask[i%4] for i,v in enumerate(raw));self.wfile.write(bytes([129,len(message)])+message);self.wfile.flush()
  except Exception:pass
  self.close_connection=True
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=18947);parser.add_argument('--origin',action='append',default=['https://igent.cc']);args=parser.parse_args();server=ThreadingHTTPServer(('0.0.0.0',args.port),Handler);server.origins=set(args.origin);print(json.dumps({'listeningPort':args.port,'origins':sorted(server.origins),'phoneInputSent':False}),flush=True);server.serve_forever()
