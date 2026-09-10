#!/bin/sh
# Set DSI/touchscreen backlight from the local clock.
#   auto  - off 11pm-8am, on otherwise (Pi local time)
#   on    - full brightness
#   off   - backlight off
# Safe to run repeatedly. No-ops if no backlight device exists.

set -eu

NIGHT_START_HOUR=23
NIGHT_END_HOUR=8

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

is_night() {
  # GNU date on Raspberry Pi OS; %-H is 0–23 with no leading zero.
  hour=$(date +%-H 2>/dev/null || date +%H)
  hour=$(echo "$hour" | sed 's/^0*\([0-9][0-9]*\)$/\1/')
  [ -n "$hour" ] || hour=0
  [ "$hour" -ge "$NIGHT_START_HOUR" ] || [ "$hour" -lt "$NIGHT_END_HOUR" ]
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
    if is_night; then
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
