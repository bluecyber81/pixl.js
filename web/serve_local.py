"""Serve only the built local UI, with the original amiibo QR route."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
from urllib.parse import urlsplit


class AppHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        original = self.path
        if re.fullmatch(r'/a/[0-9a-fA-F]{8}-[0-9a-fA-F]{8}/?', urlsplit(original).path):
            self.path = '/index.html'
        try:
            return super().send_head()
        finally:
            self.path = original

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
    args = parser.parse_args()
    directory = args.directory.resolve(strict=True)
    if not (directory / 'index.html').is_file() or not 1024 <= args.port <= 65535:
        parser.error('A built dist directory and a port from 1024 to 65535 are required')
    with ThreadingHTTPServer(('127.0.0.1', args.port), partial(AppHandler, directory=str(directory))) as server:
        print(f'Allmiibo DE3.12: http://127.0.0.1:{args.port}/', flush=True)
        server.serve_forever()


if __name__ == '__main__':
    main()
