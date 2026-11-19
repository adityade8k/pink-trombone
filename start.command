#!/bin/zsh
set -eu
cd -- "${0:A:h}"
exec python3 - <<'PYTHON'
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import urlopen
import json, subprocess

class PageHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

url = "http://127.0.0.1:5319/"
try:
    server = ThreadingHTTPServer(("127.0.0.1", 5319), partial(PageHandler, directory=str(Path.cwd())))
except OSError:
    try:
        with urlopen(url + "chimera-version.json", timeout=2) as response:
            running = json.load(response)
        assert running == json.loads(Path("chimera-version.json").read_text())
    except Exception:
        raise SystemExit("Port 5319 is occupied by another app. Close that server and try again.")
    subprocess.run(["open", "-a", "Google Chrome", url], check=True)
    raise SystemExit(0)
print(f"Chimera + Arduino: {url}", flush=True)
print("Keep this window open while playing. Press Control-C to stop.", flush=True)
subprocess.run(["open", "-a", "Google Chrome", url], check=True)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
PYTHON
