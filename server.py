#!/usr/bin/env python3
"""Local server for the University Hills Lunch Planner.

Serves the web/ app and data/ files, and exposes POST /api/refresh which
re-runs the scraper on demand (used by the Refresh Menu button in the app).
Standard library only -- no pip installs needed.
"""
import json
import os
import subprocess
import sys
import webbrowser
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
SITE_DIR = os.path.join(ROOT, "docs")
DATA_DIR = os.path.join(SITE_DIR, "data")
SCRAPER = os.path.join(ROOT, "scraper", "scrape_menu.py")

PORT = 8743

MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _serve_file(self, path):
        if not os.path.isfile(path):
            self.send_error(404, "Not found")
            return
        ext = os.path.splitext(path)[1]
        mime = MIME_TYPES.get(ext, "application/octet-stream")
        with open(path, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        if ext == ".json":
            self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/" or path == "":
            path = "/index.html"

        safe_path = os.path.normpath(path).lstrip("/")
        full_path = os.path.join(SITE_DIR, safe_path)
        if not full_path.startswith(SITE_DIR):
            self.send_error(403, "Forbidden")
            return
        self._serve_file(full_path)

    def do_POST(self):
        route = urlparse(self.path).path
        if route == "/api/refresh":
            self._handle_refresh()
        elif route == "/api/publish":
            self._handle_publish()
        else:
            self.send_error(404, "Not found")

    def _run(self, cmd, timeout=60):
        return subprocess.run(
            cmd, cwd=ROOT, capture_output=True, text=True, timeout=timeout
        )

    def _reply(self, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _handle_refresh(self):
        result = self._run([sys.executable, SCRAPER], timeout=180)
        ok = result.returncode == 0
        payload = {"ok": ok, "output": result.stdout.strip()}
        if not ok:
            payload["error"] = result.stderr.strip()[-500:]
        self._reply(payload)

    def _handle_publish(self):
        try:
            self._run(["git", "add", "-A"])
            status = self._run(["git", "status", "--porcelain"])
            if not status.stdout.strip():
                self._reply({"ok": True, "published": False, "message": "Nothing new to publish -- already up to date."})
                return

            commit = self._run(["git", "commit", "-m", "Update lunch menu data"])
            if commit.returncode != 0:
                self._reply({"ok": False, "error": commit.stderr.strip()[-500:] or commit.stdout.strip()[-500:]})
                return

            push = self._run(["git", "push"], timeout=120)
            if push.returncode != 0:
                self._reply({"ok": False, "error": push.stderr.strip()[-500:] or push.stdout.strip()[-500:]})
                return

            self._reply({"ok": True, "published": True, "message": "Published to the web!"})
        except subprocess.TimeoutExpired:
            self._reply({"ok": False, "error": "Timed out talking to GitHub."})


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://127.0.0.1:{PORT}/"
    print(f"University Hills Lunch Planner running at {url}")
    print("Press Ctrl+C to stop.")
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server.")
        server.shutdown()


if __name__ == "__main__":
    main()
