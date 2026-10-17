#!/usr/bin/env python3
"""Metadata-only probe. No proxy, credentials, images, or hardware control."""
import argparse, json, os, secrets, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
ROOT = Path(__file__).resolve().parent
LOCK = threading.Lock()
ALLOWED = {'run', 'test', 'event', 'at', 'wall', 'visibility', 'elapsed', 'bytes', 'frames', 'chunks', 'records', 'status', 'ok', 'reason', 'mediaTime', 'width', 'height', 'source', 'hidden', 'secure', 'screenAPI', 'recorderAPI', 'hasKey', 'protocol', 'stream', 'clientId'}

def log(row):
    with LOCK, (ROOT / 'events.local.jsonl').open('a') as f:
        f.write(json.dumps({'server_wall': time.time(), 'server_mono': time.monotonic(), **row}, ensure_ascii=False) + '\n')

class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def log_message(self, *args): pass
    def common(self, status, mime, length=None):
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Cache-Control', 'no-store, no-transform')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        if length is not None: self.send_header('Content-Length', str(length))
        self.end_headers()
    def reply(self, status, data):
        raw = json.dumps(data).encode(); self.common(status, 'application/json', len(raw)); self.wfile.write(raw)
    def route(self):
        path = urlsplit(self.path).path
        prefix = '/' + self.server.token + '/'
        return path[len(prefix):] if path.startswith(prefix) else None
    def do_GET(self):
        route = self.route()
        if route is None: return self.reply(404, {'error': 'not found'})
        files = {'': 'index.html', 'index.html': 'index.html', 'probe.js': 'probe.js', 'protocol.mjs': 'protocol.mjs'}
        if route not in files: return self.reply(404, {'error': 'not found'})
        data = (ROOT / files[route]).read_bytes()
        self.common(200, 'text/html; charset=utf-8' if files[route].endswith('.html') else 'text/javascript; charset=utf-8', len(data)); self.wfile.write(data)
    def do_POST(self):
        route = self.route()
        if route not in ('metadata', 'mock'): return self.reply(404, {'error': 'not found'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 8192: return self.reply(413, {'error': 'body limit'})
            value = json.loads(self.rfile.read(length))
            if not isinstance(value, dict): raise ValueError('object required')
        except (ValueError, json.JSONDecodeError): return self.reply(400, {'error': 'invalid metadata'})
        if route == 'metadata':
            row = {k: v for k, v in value.items() if k in ALLOWED and isinstance(v, (str, int, float, bool, type(None)))}
            row = {k: v[:160] if isinstance(v, str) else v for k, v in row.items()}
            log(row); return self.reply(200, {'ok': True})
        try:
            delay = max(0, min(float(value.get('delay', 0)), 120))
            interval = max(0, min(float(value.get('interval', 1)), 30))
            count = max(1, min(int(value.get('count', 6)), 40))
        except (ValueError, TypeError): return self.reply(400, {'error': 'bad timing'})
        kind = value.get('kind', 'json')
        run, test = str(value.get('run', ''))[:80], str(value.get('test', ''))[:80]
        log({'event': 'server-request', 'run': run, 'test': test, 'kind': kind, 'delay': delay})
        try:
            # Delayed JSON sends no response headers until complete, mirroring a slow provider.
            if kind == 'json':
                time.sleep(delay)
                return self.reply(200, {'choices': [{'message': {'role': 'assistant', 'content': '模拟回复完成'}}], 'done': True})
            self.send_response(200)
            self.send_header('Content-Type', 'application/x-ndjson' if kind == 'ndjson' else 'text/event-stream')
            self.send_header('Cache-Control', 'no-store, no-transform')
            self.send_header('X-Accel-Buffering', 'no')
            self.send_header('Transfer-Encoding', 'chunked'); self.end_headers()
            def write(raw):
                self.wfile.write(('%x\r\n' % len(raw)).encode() + raw + b'\r\n'); self.wfile.flush()
            def record(i, end=False):
                if kind == 'ndjson': return (json.dumps({'index': i, 'text': '片段', 'done': end}, ensure_ascii=False) + '\n').encode()
                if kind == 'anthropic':
                    name = 'message_stop' if end else 'content_block_delta'
                    val = {'type': name} if end else {'type': name, 'index': 0, 'delta': {'type': 'text_delta', 'text': '片段'}}
                    return ('event: ' + name + '\r\ndata: ' + json.dumps(val, ensure_ascii=False) + '\r\n\r\n').encode()
                return b'data: [DONE]\n\n' if end else ('data: ' + json.dumps({'choices': [{'delta': {'content': '片段'}}]}, ensure_ascii=False) + '\n\n').encode()
            # Initial comment sends headers promptly; an idle test then emits no bytes for delay.
            if kind != 'ndjson': write(b': probe-open\n\n')
            time.sleep(delay)
            for i in range(count):
                raw = record(i)
                if kind == 'fragment':
                    # Split multibyte UTF-8 and SSE boundaries intentionally.
                    for j in range(0, len(raw), 7): write(raw[j:j+7]); time.sleep(.002)
                else: write(raw)
                log({'event': 'server-chunk', 'run': run, 'test': test, 'index': i})
                if i < count - 1: time.sleep(interval)
            if kind == 'interrupt':
                self.close_connection = True
                self.connection.shutdown(2)
                return
            write(record(count, True)); self.wfile.write(b'0\r\n\r\n'); self.wfile.flush()
            log({'event': 'server-done', 'run': run, 'test': test})
        except (BrokenPipeError, ConnectionResetError, OSError):
            log({'event': 'server-disconnected', 'run': run, 'test': test})

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--port', type=int, default=18728); args = parser.parse_args()
    path = ROOT / 'probe-token.local.json'
    token = json.loads(path.read_text())['token'] if path.exists() else secrets.token_urlsafe(24)
    if not path.exists(): path.write_text(json.dumps({'token': token})); os.chmod(path, 0o600)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler); server.daemon_threads = True; server.token = token
    print(json.dumps({'port': args.port, 'state': 'ready'}), flush=True); server.serve_forever()
