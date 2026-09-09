#!/bin/sh
# Pull updates, then run the wardrobe Flask app in the foreground.

APP_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
python_bin="$APP_DIR/.venv/bin/python"

if [ ! -x "$python_bin" ]; then
  echo "Missing virtualenv at $APP_DIR/.venv"
  echo "Run ./install-autostart.sh on the Pi first."
  exit 1
fi

"$APP_DIR/update-app.sh" || true

exec "$python_bin" "$APP_DIR/run.py"
