import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

from flask import Blueprint, current_app, jsonify, request

from app.db import open_db

bp = Blueprint("settings", __name__, url_prefix="/api/settings")
weather_bp = Blueprint("weather", __name__, url_prefix="/api")


def _get_location_row(conn):
    return conn.execute(
        "SELECT latitude, longitude FROM settings WHERE id = 1"
    ).fetchone()


def _location_response(row) -> dict:
    configured = bool(row and row["latitude"] and row["longitude"])
    return {
        "latitude": row["latitude"] if row else None,
        "longitude": row["longitude"] if row else None,
        "configured": configured,
    }


RAIN_CODES = frozenset({51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82})
SNOW_CODES = frozenset({71, 73, 75, 77, 85, 86})
STORM_CODES = frozenset({95, 96, 99})
PRECIP_PROBABILITY_THRESHOLD = 40
# Local hours still relevant for "today's outfit" planning (through late evening).
DAY_END_HOUR = 22


def _wmo_to_condition(code: int) -> str:
    if code == 0:
        return "Clear"
    if code in (1, 2, 3):
        return "Cloudy"
    if code in (45, 48):
        return "Foggy"
    if code in RAIN_CODES:
        return "Rain"
    if code in SNOW_CODES:
        return "Snow"
    if code in STORM_CODES:
        return "Thunderstorm"
    return "Unknown"


def _format_hour_label(hour: int) -> str:
    suffix = "AM" if hour < 12 else "PM"
    display = hour % 12
    if display == 0:
        display = 12
    return f"{display}{suffix}"


def _group_hour_ranges(hours: list[int]) -> list[tuple[int, int]]:
    if not hours:
        return []
    ordered = sorted(set(hours))
    ranges = []
    start = prev = ordered[0]
    for hour in ordered[1:]:
        if hour == prev + 1:
            prev = hour
            continue
        ranges.append((start, prev))
        start = prev = hour
    ranges.append((start, prev))
    return ranges


def _format_hour_range(start: int, end: int) -> str:
    if start == end:
        return _format_hour_label(start)
    return f"{_format_hour_label(start)}-{_format_hour_label(end)}"


def _precip_kind_for_hour(code, likely: bool) -> str | None:
    if code in STORM_CODES:
        return "Thunderstorm"
    if code in SNOW_CODES:
        return "Snow"
    if code in RAIN_CODES or likely:
        return "Rain"
    return None


def _today_precip(hourly: dict | None, current_time: str | None) -> dict:
    """Precipitation windows for the rest of today (through evening)."""
    empty = {
        "expected": False,
        "kind": None,
        "windows": [],
        "summary": "No rain or snow expected today",
        "max_probability": 0,
    }
    if not hourly:
        return empty

    times = hourly.get("time") or []
    codes = hourly.get("weather_code") or []
    probs = hourly.get("precipitation_probability") or []
    if not times:
        return empty

    try:
        now = datetime.fromisoformat(current_time) if current_time else datetime.now()
    except ValueError:
        now = datetime.now()
    today = now.date()
    current_hour = now.hour

    precip_hours: list[tuple[int, str]] = []
    max_prob = 0

    for idx, stamp in enumerate(times):
        try:
            hour_dt = datetime.fromisoformat(stamp)
        except ValueError:
            continue
        if hour_dt.date() != today:
            continue
        hour = hour_dt.hour
        if hour < current_hour or hour > DAY_END_HOUR:
            continue

        code = codes[idx] if idx < len(codes) else None
        raw_prob = probs[idx] if idx < len(probs) else None
        prob = int(raw_prob) if raw_prob is not None else 0
        max_prob = max(max_prob, prob)
        kind = _precip_kind_for_hour(code, prob >= PRECIP_PROBABILITY_THRESHOLD)
        if kind:
            precip_hours.append((hour, kind))

    if not precip_hours:
        empty["max_probability"] = max_prob
        return empty

    kinds = {kind for _, kind in precip_hours}
    if "Thunderstorm" in kinds:
        primary = "Thunderstorm"
        hours = [hour for hour, kind in precip_hours if kind == "Thunderstorm"]
    elif "Snow" in kinds:
        primary = "Snow"
        hours = [hour for hour, kind in precip_hours if kind == "Snow"]
    else:
        primary = "Rain"
        hours = [hour for hour, _ in precip_hours]

    ranges = _group_hour_ranges(hours)
    windows = [
        {
            "from_hour": start,
            "to_hour": end,
            "label": _format_hour_range(start, end),
        }
        for start, end in ranges
    ]
    labels = [window["label"] for window in windows]
    if len(labels) == 1:
        when = labels[0]
        summary = (
            f"{primary} around {when}"
            if ranges[0][0] == ranges[0][1]
            else f"{primary} {when}"
        )
    else:
        summary = f"{primary} {', '.join(labels[:-1])} & {labels[-1]}"

    return {
        "expected": True,
        "kind": primary,
        "windows": windows,
        "summary": summary,
        "max_probability": max_prob,
    }


def _daily_high_low(daily: dict | None) -> tuple[float | None, float | None]:
    if not daily:
        return None, None
    highs = daily.get("temperature_2m_max") or []
    lows = daily.get("temperature_2m_min") or []
    high = highs[0] if highs else None
    low = lows[0] if lows else None
    return high, low


@bp.get("/location")
def get_location():
    conn = open_db(current_app.config["DATABASE"])
    try:
        row = _get_location_row(conn)
    finally:
        conn.close()

    return jsonify(_location_response(row))


@bp.put("/location")
def update_location():
    data = request.get_json(silent=True) or {}
    latitude = data.get("latitude")
    longitude = data.get("longitude")

    if latitude is None or longitude is None:
        return jsonify({"error": "latitude and longitude are required"}), 400

    lat_str = str(latitude).strip()
    lon_str = str(longitude).strip()
    try:
        lat_val = float(lat_str)
        lon_val = float(lon_str)
    except ValueError:
        return jsonify({"error": "latitude and longitude must be numbers"}), 400

    if not (-90 <= lat_val <= 90) or not (-180 <= lon_val <= 180):
        return jsonify({"error": "latitude or longitude out of range"}), 400

    conn = open_db(current_app.config["DATABASE"])
    try:
        conn.execute(
            "UPDATE settings SET latitude = ?, longitude = ? WHERE id = 1",
            (lat_str, lon_str),
        )
        conn.commit()
        row = _get_location_row(conn)
    finally:
        conn.close()

    return jsonify(_location_response(row))


@weather_bp.get("/weather")
def get_weather():
    conn = open_db(current_app.config["DATABASE"])
    try:
        row = _get_location_row(conn)
    finally:
        conn.close()

    location = _location_response(row)
    if not location["configured"]:
        return jsonify(
            {
                "configured": False,
                "message": "No location has been set. Update latitude and longitude in settings.",
            }
        ), 200

    params = urllib.parse.urlencode(
        {
            "latitude": location["latitude"],
            "longitude": location["longitude"],
            "current": "temperature_2m,weather_code",
            "hourly": "weather_code,precipitation_probability",
            "daily": "temperature_2m_max,temperature_2m_min",
            "forecast_days": "1",
            "temperature_unit": "fahrenheit",
            "timezone": "auto",
        }
    )
    url = f"https://api.open-meteo.com/v1/forecast?{params}"

    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            data = json.loads(resp.read())
    except urllib.error.URLError:
        return jsonify({"error": "Unable to fetch weather data"}), 502

    current = data.get("current", {})
    weather_code = current.get("weather_code", -1)
    high, low = _daily_high_low(data.get("daily"))
    precip = _today_precip(data.get("hourly"), current.get("time"))
    unit = data.get("current_units", {}).get("temperature_2m", "°F")

    return jsonify(
        {
            "configured": True,
            "temperature": current.get("temperature_2m"),
            "high": high,
            "low": low,
            "unit": unit,
            "condition": _wmo_to_condition(weather_code),
            "weather_code": weather_code,
            "precip": precip,
        }
    )
