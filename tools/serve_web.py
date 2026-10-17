#!/usr/bin/env python3
"""Local static preview with enough backlog for concurrent browser ES modules."""
import argparse
from urllib.parse import urlsplit
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

class PreviewServer(ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True

class Handler(SimpleHTTPRequestHandler):
    def send_head(self):
        original = self.path
        if urlsplit(self.path).path.rstrip('/') in {'/main', '/skills', '/flash', '/home', '/harness'}:
            self.path = '/'
        try:
            return super().send_head()
        finally:
            self.path = original

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8080)
    parser.add_argument('--host', default='127.0.0.1')
    args = parser.parse_args()
    directory = Path(__file__).resolve().parent.parent / 'build' / 'site'
    if not (directory / 'index.html').is_file():
        parser.error('Run npm run build before starting the preview.')
    with PreviewServer((args.host, args.port), partial(Handler, directory=str(directory))) as server:
        print(f'Local preview: http://{args.host}:{args.port}/', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass

if __name__ == '__main__':
    main()
