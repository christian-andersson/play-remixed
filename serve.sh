#!/usr/bin/env bash
# Serves this folder over HTTP and opens the player in the default browser.
#
# The player loads data/remixes.json with fetch(), which browsers block for pages opened as local
# files (file://), so local testing needs a web server. This uses the first one it finds:
# Python 3, Python, PHP, Ruby, BusyBox, or Node (npx http-server, which may download the package).
#
# Usage: ./serve.sh [port] [--lan] [--no-open]
#   port       port to listen on (default 8000)
#   --lan      listen on all interfaces, so phones on the same network can connect
#   --no-open  do not open a browser
set -euo pipefail
cd "$(dirname "$0")"

port=8000 host=127.0.0.1 open_browser=1
for arg in "$@"; do
  case "$arg" in
    --lan) host=0.0.0.0 ;;
    --no-open) open_browser=0 ;;
    -h|--help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *[!0-9]*|'') echo "Unknown option: $arg (try --help)" >&2; exit 2 ;;
    *) port="$arg" ;;
  esac
done

if [ ! -f data/remixes.json ]; then
  echo "data/remixes.json is missing. Build it first: python3 build.py" >&2
  exit 1
fi

have() { command -v "$1" >/dev/null 2>&1; }

url="http://localhost:$port/"
echo "C64 Remix Radio: $url"
if [ "$host" = 0.0.0.0 ]; then
  ip=$( (ipconfig getifaddr en0 || ipconfig getifaddr en1 || hostname -I | awk '{print $1}') 2>/dev/null || true)
  [ -n "$ip" ] && echo "On your network:  http://$ip:$port/"
fi
echo "Press Ctrl+C to stop."

if [ "$open_browser" = 1 ]; then
  ( # wait (up to 10 s) until the server answers, so the browser does not open on an error page
    for _ in $(seq 1 50); do
      if have curl; then curl -s -o /dev/null "$url" && break; else sleep 2; break; fi
      sleep 0.2
    done
    if have open; then open "$url"
    elif have xdg-open; then xdg-open "$url"
    elif have wslview; then wslview "$url"
    else echo "Open $url in your browser."
    fi ) >/dev/null 2>&1 &
fi

if have python3; then exec python3 -m http.server "$port" --bind "$host"
elif have python && python -c 'import sys; sys.exit(sys.version_info[0] < 3)'; then exec python -m http.server "$port" --bind "$host"
elif have php; then exec php -S "$host:$port"
elif have ruby; then exec ruby -run -e httpd . -p "$port" -b "$host"
elif have busybox; then exec busybox httpd -f -p "$host:$port"
elif have npx; then exec npx --yes http-server -p "$port" -a "$host" -c-1
else
  echo "No web server found. Install Python 3 (https://www.python.org/) or see TESTING.md." >&2
  exit 1
fi
