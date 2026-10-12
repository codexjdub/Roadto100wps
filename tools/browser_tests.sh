#!/usr/bin/env bash
# Runs tests/browser.html in headless Chrome and prints each result. Exits 1 if any test fails.
# Usage: bash tools/browser_tests.sh        (set CHROME=/path/to/chrome if it isn't found)
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="${CHROME:-}"
if [ -z "$CHROME" ]; then
  for c in google-chrome google-chrome-stable chromium chromium-browser "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
    if command -v "$c" >/dev/null 2>&1; then CHROME="$c"; break; fi
  done
fi
if [ -z "$CHROME" ]; then
  echo "Chrome not found. Set CHROME=/path/to/chrome." >&2
  exit 2
fi

PORT="${PORT:-8765}"
# Python's standard server queues only 5 connections. Chrome opens more than that at once on a
# cold start, and the dropped requests leave the app half loaded, so queue more.
python3 -c 'import http.server as h, sys
class Server(h.ThreadingHTTPServer): request_queue_size = 64
Server(("127.0.0.1", int(sys.argv[1])), h.SimpleHTTPRequestHandler).serve_forever()' "$PORT" >/dev/null 2>&1 &
SERVER=$!
disown "$SERVER" # so stopping it at the end doesn't print a "Terminated" notice
PROFILE="$(mktemp -d)" # a fresh profile each run, so nothing is served from an old cache
trap 'kill "$SERVER" 2>/dev/null || true; rm -rf "$PROFILE"' EXIT
sleep 1

# Virtual time lets the page's timers run as fast as possible, so the run takes seconds.
"$CHROME" --headless=new --disable-gpu --no-sandbox --no-first-run --no-default-browser-check \
  --user-data-dir="$PROFILE" --virtual-time-budget=600000 \
  --dump-dom "http://127.0.0.1:$PORT/tests/browser.html" 2>/dev/null > "$PROFILE/result.html"

python3 - "$PROFILE/result.html" <<'EOF'
import html, re, sys
page = open(sys.argv[1], encoding="utf-8").read()
for item in re.findall(r"<li>(.*?)</li>", page, re.S):
    print(" ".join(html.unescape(re.sub(r"<[^>]+>", " ", item)).split()))
m = re.search(r'<p id="summary" data-status="(\w+)">([^<]*)', page)
print(m.group(2) if m else "No summary: the test page didn't finish.")
sys.exit(0 if m and m.group(1) == "pass" else 1)
EOF
