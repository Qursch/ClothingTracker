#!/bin/sh
# Set DSI/touchscreen backlight from the Pi's local clock.
#   auto  - follow the schedule below
#   on    - full brightness
#   off   - backlight off
# Safe to run repeatedly. No-ops if no backlight device exists.
#
# Default awake: 8:00am-10:00pm.
# Extra off windows (local time):
#   Tue/Thu  11:30am-3:00pm
#   Wed      7:30pm through Thu 8:00am
#   Fri      9:00am-12:30pm

set -eu

set_backlight() {
  mode="$1"
  if [ ! -d /sys/class/backlight ]; then
    return 0
  fi

  for dir in /sys/class/backlight/*; do
    [ -e "$dir/brightness" ] || continue

    if [ "$mode" = "off" ]; then
      if [ -e "$dir/bl_power" ]; then
        echo 4 > "$dir/bl_power" 2>/dev/null || true
      fi
      echo 0 > "$dir/brightness" 2>/dev/null || true
    else
      if [ -e "$dir/bl_power" ]; then
        echo 0 > "$dir/bl_power" 2>/dev/null || true
      fi
      if [ -e "$dir/max_brightness" ]; then
        cat "$dir/max_brightness" > "$dir/brightness" 2>/dev/null || true
      else
        echo 255 > "$dir/brightness" 2>/dev/null || true
      fi
    fi
  done
}

should_sleep() {
  python3 - <<'PY'
from datetime import datetime

now = datetime.now()
weekday = now.weekday()  # Mon=0 .. Sun=6
mins = now.hour * 60 + now.minute

def between(start_h, start_m, end_h, end_m):
    return (start_h * 60 + start_m) <= mins < (end_h * 60 + end_m)

sleep = False

# Every night 10:00pm-8:00am
if mins >= 22 * 60 or mins < 8 * 60:
    sleep = True

# Tuesday and Thursday 11:30am-3:00pm
if weekday in (1, 3) and between(11, 30, 15, 0):
    sleep = True

# Wednesday 7:30pm until Thursday 8:00am (overnight window covers Thu morning)
if weekday == 2 and mins >= 19 * 60 + 30:
    sleep = True

# Friday 9:00am-12:30pm
if weekday == 4 and between(9, 0, 12, 30):
    sleep = True

raise SystemExit(0 if sleep else 1)
PY
}

cmd="${1:-auto}"
case "$cmd" in
  on)
    set_backlight on
    ;;
  off)
    set_backlight off
    ;;
  auto)
    if should_sleep; then
      set_backlight off
    else
      set_backlight on
    fi
    ;;
  *)
    echo "Usage: $0 [auto|on|off]" >&2
    exit 1
    ;;
esac
