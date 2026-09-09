#!/bin/sh
# Fetch the latest repo on the Pi. Never fails the caller: the app should
# still launch if git/network is unavailable.
# Exit 10 if HEAD moved (so the kiosk can restart the server).

APP_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$APP_DIR" || exit 0

if [ ! -d .git ]; then
  echo "Not a git checkout; skipping update."
  exit 0
fi

if command -v flock >/dev/null 2>&1; then
  mkdir -p .git
  exec 8>".git/update.lock"
  flock 8
fi

old="$(git rev-parse HEAD 2>/dev/null)" || old=""

export GIT_TERMINAL_PROMPT=0
export GIT_ASKPASS=true

fetch_ok=0
i=0
while [ "$i" -lt 6 ]; do
  if command -v timeout >/dev/null 2>&1; then
    if timeout 30 git fetch origin; then
      fetch_ok=1
      break
    fi
  elif git fetch origin; then
    fetch_ok=1
    break
  fi
  i=$((i + 1))
  echo "git fetch failed; retrying..."
  sleep 5
done

if [ "$fetch_ok" -ne 1 ]; then
  echo "git fetch failed; launching existing code."
  exit 0
fi

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" || branch="main"
upstream="$(git rev-parse --abbrev-ref '@{upstream}' 2>/dev/null)" || true
if [ -z "$upstream" ]; then
  if [ "$branch" = "HEAD" ] || [ -z "$branch" ]; then
    upstream="origin/main"
  else
    upstream="origin/$branch"
  fi
fi

if ! git reset --hard "$upstream"; then
  echo "git reset failed; launching existing code."
  exit 0
fi

if [ -x "$APP_DIR/.venv/bin/pip" ] && [ -f "$APP_DIR/requirements.txt" ]; then
  "$APP_DIR/.venv/bin/pip" install -q -r "$APP_DIR/requirements.txt" || true
fi

new="$(git rev-parse HEAD 2>/dev/null)" || new=""
if [ -n "$old" ] && [ -n "$new" ] && [ "$old" != "$new" ]; then
  echo "Updated $old -> $new"
  exit 10
fi

echo "Already up to date."
exit 0
