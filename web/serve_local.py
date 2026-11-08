"""Serve only the built local UI, with the original amiibo QR route."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import threading
from urllib.parse import urlsplit


class AppHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.mjs': 'text/javascript'}

    def __init__(self, *args, instance_token, **kwargs):
        self.instance_token = instance_token
        super().__init__(*args, **kwargs)

    def allowed_host(self):
        return self.headers.get('Host') == f'127.0.0.1:{self.server.server_port}'

    def send_head(self):
        original = self.path
        if not self.allowed_host():
            self.send_error(403, 'Unexpected Host')
            return None
        if urlsplit(original).path == '/.well-known/allmiibo-dateimanager':
            body = json.dumps({'application': 'allmiibo-dateimanager', 'version': '3.42.0',
                               'instance': hashlib.sha256(self.instance_token.encode('ascii')).hexdigest()}).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            return BytesIO(body)
        if re.fullmatch(r'/a/[0-9a-fA-F]{8}-[0-9a-fA-F]{8}/?', urlsplit(original).path):
            self.path = '/index.html'
        try:
            translated = self.translate_path(self.path)
            target = Path(translated)
            # Path() normalizes away a trailing slash; retain the base
            # handler's rejection of a slash appended to a regular file.
            if translated.endswith(('/', os.sep)) and not target.is_dir():
                return super().send_head()
            if target.is_dir() and urlsplit(self.path).path.endswith('/'):
                for name in ('index.html', 'index.htm'):
                    candidate = target / name
                    if candidate.is_file():
                        target = candidate
                        break
            if target.is_file():
                return self.send_static_head(target)
            # Retain the standard redirects/404 handling and our disabled
            # directory listing. No file is resolved outside translate_path.
            return super().send_head()
        finally:
            self.path = original

    def send_static_head(self, target):
        # Reproducible release archives deliberately share timestamps. File
        # mtime (even mtime+size) cannot validate changed HTML/JS after a switch.
        # A content ETag permits 304 only for the actual bytes being served;
        # date-only validators get the current representation instead.
        try:
            stream = target.open('rb')
        except OSError:
            self.send_error(404, 'File not found')
            return None
        try:
            digest = hashlib.sha256()
            for chunk in iter(lambda: stream.read(128 * 1024), b''):
                digest.update(chunk)
            etag = '"' + digest.hexdigest() + '"'
            info = os.fstat(stream.fileno())
            validators = ','.join(self.headers.get_all('If-None-Match', []))
            matches = any(value.strip() in ('*', etag, 'W/' + etag)
                          for value in validators.split(','))
            if matches:
                self.send_response(304)
                self.send_header('ETag', etag)
                self.end_headers()
                stream.close()
                return None
            stream.seek(0)
            self.send_response(200)
            self.send_header('Content-Type', self.guess_type(str(target)))
            self.send_header('Content-Length', str(info.st_size))
            self.send_header('Last-Modified', self.date_time_string(info.st_mtime))
            self.send_header('ETag', etag)
            self.end_headers()
            return stream
        except OSError:
            stream.close()
            self.send_error(404, 'File not found')
            return None

    def do_POST(self):
        # This endpoint can only stop this HTTPServer instance, never a PID.
        # The secret stays in the launcher's local state, not the public health response.
        origin = self.headers.get('Origin')
        expected_origin = f'http://127.0.0.1:{self.server.server_port}'
        supplied = self.headers.get('X-Allmiibo-Token', '')
        if (not self.allowed_host() or origin not in (None, expected_origin)
                or not secrets.compare_digest(supplied.encode('utf-8'), self.instance_token.encode('ascii'))):
            self.send_error(403, 'Shutdown request rejected')
            return
        if self.path != '/.well-known/allmiibo-dateimanager/shutdown':
            self.send_error(404, 'Not found')
            return
        if self.headers.get('Content-Length', '0') != '0' or self.headers.get('Transfer-Encoding'):
            self.send_error(400, 'Shutdown request must have no body')
            return
        body = b'{"stopping":true}'
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        self.wfile.flush()
        threading.Thread(target=self.server.shutdown, daemon=True).start()

    def list_directory(self, path):
        self.send_error(404, 'Not found')
        return None

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--directory', type=Path, required=True)
    parser.add_argument('--instance-token', default=None)
    args = parser.parse_args()
    directory = args.directory.resolve(strict=True)
    if not (directory / 'index.html').is_file() or not 1024 <= args.port <= 65535:
        parser.error('A built dist directory and a port from 1024 to 65535 are required')
    token = args.instance_token or secrets.token_hex(16)
    if not re.fullmatch(r'[a-f0-9]{32}', token):
        parser.error('The instance token must contain exactly 32 lowercase hexadecimal characters')
    with ThreadingHTTPServer(('127.0.0.1', args.port), partial(AppHandler, directory=str(directory), instance_token=token)) as server:
        print(f'Allmiibo Dateimanager 3.42.0: http://127.0.0.1:{args.port}/', flush=True)
        server.serve_forever()


if __name__ == '__main__':
    main()
