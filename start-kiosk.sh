#!/bin/sh
# Wait for the wardrobe app, then open it in Firefox kiosk mode.
# Intended to run from the Pi desktop session after boot.

APP_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
URL="http://127.0.0.1:5000"
PROFILE_DIR="$APP_DIR/.firefox-kiosk"
LOCK_FILE="${XDG_RUNTIME_DIR:-/tmp}/wardrobe-kiosk.lock"
USER_JS="$APP_DIR/deploy/firefox-user.js"

if [ "$(uname -s)" != "Linux" ]; then
  echo "Run this on the Raspberry Pi."
  exit 1
fi

if [ "${WARDROBE_POST_UPDATE:-}" != 1 ] && command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    echo "Kiosk is already starting."
    exit 0
  fi
fi

if command -v firefox >/dev/null 2>&1; then
  BROWSER=firefox
elif command -v firefox-esr >/dev/null 2>&1; then
  BROWSER=firefox-esr
else
  echo "Firefox is not installed."
  exit 1
fi

python_bin="$APP_DIR/.venv/bin/python"
if [ ! -x "$python_bin" ]; then
  echo "Missing virtualenv at $APP_DIR/.venv"
  echo "Run ./install-autostart.sh on the Pi first."
  exit 1
fi

server_up() {
  python3 - "$URL" <<'PY'
import socket, sys, urllib.parse
url = urllib.parse.urlparse(sys.argv[1])
host = url.hostname or "127.0.0.1"
port = url.port or 80
try:
    with socket.create_connection((host, port), 1):
        raise SystemExit(0)
except OSError:
    raise SystemExit(1)
PY
}

if [ "${WARDROBE_POST_UPDATE:-}" != 1 ]; then
  "$APP_DIR/update-app.sh"
  update_status=$?
  if [ "$update_status" -eq 10 ]; then
    echo "Code updated; restarting wardrobe.service..."
    sudo -n systemctl restart wardrobe.service 2>/dev/null || true
  fi
  WARDROBE_POST_UPDATE=1 exec "$APP_DIR/start-kiosk.sh"
fi

if ! server_up; then
  if systemctl is-active --quiet wardrobe.service 2>/dev/null \
    || systemctl is-enabled --quiet wardrobe.service 2>/dev/null; then
    echo "Waiting for wardrobe.service..."
  else
    echo "Starting wardrobe server..."
    "$APP_DIR/start-server.sh" >/tmp/wardrobe-server.log 2>&1 &
  fi
fi

echo "Waiting for $URL ..."
i=0
while ! server_up; do
  i=$((i + 1))
  if [ "$i" -ge 120 ]; then
    echo "Server did not start on $URL"
    exit 1
  fi
  sleep 0.5
done

if [ "${XDG_SESSION_TYPE:-}" = "wayland" ]; then
  export MOZ_ENABLE_WAYLAND=1
fi

if command -v xset >/dev/null 2>&1 && [ -n "${DISPLAY:-}" ]; then
  xset s off 2>/dev/null || true
  xset s noblank 2>/dev/null || true
  xset -dpms 2>/dev/null || true
fi

mkdir -p "$PROFILE_DIR"
if [ -f "$USER_JS" ]; then
  cp "$USER_JS" "$PROFILE_DIR/user.js"
fi

cd "$APP_DIR"
while true; do
  "$BROWSER" --kiosk --no-remote --profile "$PROFILE_DIR" "$URL" || true
  sleep 2
done
