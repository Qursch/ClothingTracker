#!/bin/sh
# Git-updatable root hook. install-autostart.sh allows this path via sudoers
# once; later boots/pulls run it with `sudo -n` and no keyboard.
# Idempotent: safe to run on every kiosk start and after every git update.

set -eu

if [ "$(uname -s)" != "Linux" ]; then
  echo "apply-machine.sh is for the Raspberry Pi."
  exit 0
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "apply-machine.sh must run as root." >&2
  exit 1
fi

DEPLOY_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
APP_DIR="$(CDPATH= cd -- "$DEPLOY_DIR/.." && pwd)"

if [ ! -f "$APP_DIR/run.py" ]; then
  echo "Could not find the wardrobe app in $APP_DIR" >&2
  exit 1
fi

if command -v flock >/dev/null 2>&1; then
  exec 8>/tmp/wardrobe-apply-machine.lock
  flock 8
fi

APP_USER="${SUDO_USER:-}"
if [ -z "$APP_USER" ] || [ "$APP_USER" = "root" ]; then
  APP_USER="$(stat -c '%U' "$APP_DIR" 2>/dev/null || true)"
fi
if [ -z "$APP_USER" ] || [ "$APP_USER" = "root" ]; then
  echo "Could not determine the wardrobe user." >&2
  exit 1
fi

APP_GROUP="$(id -gn "$APP_USER")"

chmod +x \
  "$APP_DIR/start-kiosk.sh" \
  "$APP_DIR/install-autostart.sh" \
  "$APP_DIR/start-server.sh" \
  "$APP_DIR/update-app.sh" \
  "$DEPLOY_DIR/apply-machine.sh" \
  "$DEPLOY_DIR/display-sleep.sh"

install_unit() {
  src="$1"
  dest="$2"
  sed \
    -e "s|@APP_USER@|$APP_USER|g" \
    -e "s|@APP_GROUP@|$APP_GROUP|g" \
    -e "s|@APP_DIR@|$APP_DIR|g" \
    "$src" > "$dest"
}

install_unit "$DEPLOY_DIR/wardrobe.service.in" \
  /etc/systemd/system/wardrobe.service
install_unit "$DEPLOY_DIR/wardrobe-display.service.in" \
  /etc/systemd/system/wardrobe-display.service
install_unit "$DEPLOY_DIR/wardrobe-display.timer.in" \
  /etc/systemd/system/wardrobe-display.timer

SUDOERS=/etc/sudoers.d/wardrobe
SUDOERS_TMP="${SUDOERS}.tmp"
printf '%s ALL=(root) NOPASSWD: /usr/bin/systemctl restart wardrobe.service, %s\n' \
  "$APP_USER" "$DEPLOY_DIR/apply-machine.sh" > "$SUDOERS_TMP"
chmod 440 "$SUDOERS_TMP"
mv "$SUDOERS_TMP" "$SUDOERS"
if command -v visudo >/dev/null 2>&1; then
  if ! visudo -c >/dev/null 2>&1; then
    echo "sudoers check failed; removing $SUDOERS" >&2
    rm -f "$SUDOERS"
    exit 1
  fi
fi

systemctl daemon-reload
systemctl enable wardrobe.service >/dev/null
systemctl enable wardrobe-display.timer >/dev/null

# Default: apply the current night/day backlight. install-autostart.sh
# passes --defer-display so a late-night first install does not black
# the panel before the user can reboot.
if [ "${1:-}" != "--defer-display" ]; then
  systemctl start wardrobe-display.timer >/dev/null || true
  systemctl start wardrobe-display.service >/dev/null || true
fi

echo "Applied machine config from $APP_DIR"
