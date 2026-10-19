from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
import os
os.chdir(Path(__file__).resolve().parents[2])
class Handler(SimpleHTTPRequestHandler):
 def end_headers(self):
  self.send_header('Cache-Control','no-store');super().end_headers()
 def do_GET(self):
  if self.path.startswith('/apps/web/?fixture='):
   fixture=Path('tests/browser/main-flows.html').read_text();start=fixture.index('const bootstrap=()=>{')+len('const bootstrap=()=>{');end=fixture.index('\n};\nasync function loadApp',start)
   bootstrap=fixture[start:end]
   if 'fixture=refinement' in self.path:bootstrap=bootstrap.replace('primary-flow-repair:', 'interaction-refinement:')
   if 'fixture=connection-guidance' in self.path:bootstrap=bootstrap.replace('primary-flow-repair:', 'connection-guidance:')
   html=Path('apps/web/index.html').read_text().replace('<head>','<head><base href="/apps/web/"><script>'+bootstrap+'</script>')
   if 'fixture=refinement' in self.path:html=html.replace('<script src="./bootstrap.js"></script>', '<script type="module" src="/tests/browser/refinement-fixture.js"></script>')
   if 'fixture=mobile-viewport' in self.path:
    html=html.replace('<head>','<head><script>'+Path('tests/browser/viewport-fixture.js').read_text()+'</script>')
   self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(html.encode());return
  return super().do_GET()
 def do_POST(self):
  if self.path!='/qa-result':self.send_error(404);return
  raw=self.rfile.read(int(self.headers.get('Content-Length','0')))
  Path('build').mkdir(exist_ok=True)
  Path('build/main-flow-result.json').write_bytes(raw)
  self.send_response(200);self.end_headers();self.wfile.write(b'ok')
class Server(ThreadingHTTPServer):request_queue_size=128
Server(('127.0.0.1',18952),Handler).serve_forever()
