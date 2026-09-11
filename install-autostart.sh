#!/bin/sh
# One-time Raspberry Pi setup: start the app at boot, then open Firefox kiosk.
# Run this on the Pi from the repo directory (needs a keyboard or SSH once):
#   ./install-autostart.sh
# Then reboot.
#
# After this, git pulls run deploy/apply-machine.sh as root automatically.
# Future machine-config changes (display sleep, systemd units, sudoers) land
# via git and do not need another keyboard.

set -eu

if [ "$(uname -s)" != "Linux" ]; then
  echo "Run this on the Raspberry Pi, not on your Mac."
  exit 1
fi

APP_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
SCRIPT="$APP_DIR/install-autostart.sh"

if [ "$(id -u)" -ne 0 ]; then
  exec sudo "$SCRIPT"
fi

APP_USER="${SUDO_USER:-}"
if [ -z "$APP_USER" ] || [ "$APP_USER" = "root" ]; then
  echo "Run as a normal user with sudo, e.g. ./install-autostart.sh"
  exit 1
fi

APP_GROUP="$(id -gn "$APP_USER")"
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"

if [ ! -f "$APP_DIR/run.py" ] || [ ! -f "$APP_DIR/requirements.txt" ]; then
  echo "Could not find the wardrobe app in $APP_DIR"
  exit 1
fi

echo "Installing for user $APP_USER"
echo "App directory: $APP_DIR"

if ! command -v python3 >/dev/null 2>&1; then
  apt-get update
  apt-get install -y python3 python3-venv python3-pip
fi

if [ ! -x "$APP_DIR/.venv/bin/python" ]; then
  echo "Creating virtualenv..."
  sudo -u "$APP_USER" python3 -m venv "$APP_DIR/.venv"
fi

echo "Installing Python dependencies..."
sudo -u "$APP_USER" "$APP_DIR/.venv/bin/pip" install -r "$APP_DIR/requirements.txt"

chmod +x "$APP_DIR/start-kiosk.sh" "$APP_DIR/install-autostart.sh" \
  "$APP_DIR/start-server.sh" "$APP_DIR/update-app.sh" \
  "$APP_DIR/deploy/apply-machine.sh" "$APP_DIR/deploy/display-sleep.sh"

"$APP_DIR/deploy/apply-machine.sh" --defer-display
systemctl restart wardrobe.service

append_once() {
  file="$1"
  marker="$2"
  body="$3"
  mkdir -p "$(dirname "$file")"
  if [ -f "$file" ] && grep -Fq "$marker" "$file"; then
    return 0
  fi
  printf '\n%s\n%s\n' "$marker" "$body" >> "$file"
  chown "$APP_USER:$APP_GROUP" "$file" 2>/dev/null || true
  chown "$APP_USER:$APP_GROUP" "$(dirname "$file")" 2>/dev/null || true
}

# labwc (current Raspberry Pi OS desktop default)
LABWC_DIR="$APP_HOME/.config/labwc"
sudo -u "$APP_USER" mkdir -p "$LABWC_DIR"
append_once \
  "$LABWC_DIR/autostart" \
  "# clothingtracker-kiosk" \
  "$APP_DIR/start-kiosk.sh &"

# X11 / LXDE-pi
LX_SYS="/etc/xdg/lxsession/LXDE-pi/autostart"
LX_DIR="$APP_HOME/.config/lxsession/LXDE-pi"
LX_FILE="$LX_DIR/autostart"
if [ -f "$LX_SYS" ] || [ -d "$APP_HOME/.config/lxsession" ]; then
  sudo -u "$APP_USER" mkdir -p "$LX_DIR"
  if [ ! -f "$LX_FILE" ] && [ -f "$LX_SYS" ]; then
    cp "$LX_SYS" "$LX_FILE"
    chown "$APP_USER:$APP_GROUP" "$LX_FILE"
  fi
  append_once \
    "$LX_FILE" \
    "# clothingtracker-kiosk" \
    "@$APP_DIR/start-kiosk.sh"
  chown -R "$APP_USER:$APP_GROUP" "$APP_HOME/.config/lxsession"
fi

# Wayfire (older Bookworm Wayland)
WAYFIRE_INI="$APP_HOME/.config/wayfire.ini"
if [ -f "$WAYFIRE_INI" ]; then
  sudo -u "$APP_USER" python3 - "$WAYFIRE_INI" "$APP_DIR/start-kiosk.sh" <<'PY'
from pathlib import Path
import sys
ini = Path(sys.argv[1])
cmd = sys.argv[2]
text = ini.read_text()
if "clothingtracker" in text:
    raise SystemExit(0)
line = f"clothingtracker = {cmd}"
if "[autostart]" in text:
    text = text.replace("[autostart]", "[autostart]\n" + line, 1)
else:
    text += "\n[autostart]\n" + line + "\n"
ini.write_text(text)
PY
fi

if command -v raspi-config >/dev/null 2>&1; then
  echo "Enabling desktop auto-login and disabling screen blanking..."
  raspi-config nonint do_boot_behaviour B4 || true
  raspi-config nonint do_blanking 1 || true
else
  echo "raspi-config not found; enable desktop auto-login yourself if needed."
fi

echo
echo "Setup complete."
echo "Later git pulls will run deploy/apply-machine.sh without a keyboard."
echo "The DSI panel follows deploy/display-sleep.sh (default 8am-10pm, plus class-day windows)."
echo "Reboot the Pi. After login it will start the app, then Firefox fullscreen."
echo "  sudo reboot"
