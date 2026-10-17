#!/usr/bin/env python3
"""Isolated old-Safari UI fixture; never part of production assets.

Binds loopback only. Injects a fixture-only UA and removes replaceAll before
loading the real index/bootstrap. No phone, serial, model or remote API is used.
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from functools import partial

ROOT = Path(__file__).resolve().parents[2] / 'apps' / 'web'
PRELUDE = '''<script>
Object.defineProperty(navigator,'userAgent',{value:'Mozilla/5.0 (iPhone; CPU iPhone OS 12_5 like Mac OS X) AppleWebKit/605.1.15 Version/12.0 Mobile/15E148 Safari/604.1'});
String.prototype.replaceAll=undefined;
localStorage.setItem('iah.locale','zh-Hans');
</script>'''

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if urlsplit(self.path).path in ('/', '/main', '/skills', '/flash'):
            content = (ROOT / 'index.html').read_text().replace('<script src="./bootstrap.js"></script>', PRELUDE + '<script src="./bootstrap.js"></script>')
            payload = content.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        else:
            super().do_GET()

if __name__ == '__main__':
    with ThreadingHTTPServer(('127.0.0.1',18832),partial(Handler,directory=str(ROOT))) as server:
        print('Mock-only legacy startup fixture: http://127.0.0.1:18832/',flush=True)
        try: server.serve_forever()
        except KeyboardInterrupt: pass
