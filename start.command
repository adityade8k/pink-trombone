#!/bin/zsh
set -eu
cd -- "${0:A:h}"

exec python3 - <<'PY'
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess


class PageHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      ".html": "text/html; charset=utf-8"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


handler = partial(PageHandler, directory=str(Path.cwd()))
with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
    url = f"http://127.0.0.1:{server.server_port}/index.html"
    print(f"Pink Trombone: {url}", flush=True)
    print("Keep this window open while playing. Press Control-C to stop.", flush=True)
    subprocess.run(["open", "-a", "Google Chrome", url], check=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
PY
