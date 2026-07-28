(function () {
  const clockTime = document.getElementById("clock-time");
  const clockDate = document.getElementById("clock-date");
  const weatherEl = document.getElementById("weather");

  function updateClock() {
    const now = new Date();
    clockTime.textContent = now.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    clockDate.textContent = now.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }

  function formatTemp(value, unit) {
    if (value == null || Number.isNaN(Number(value))) return "—";
    return Math.round(Number(value)) + (unit || "°F");
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderWeather(data) {
    if (!data.configured) {
      weatherEl.innerHTML =
        '<span class="weather-message">Set your location in settings to see weather here</span>';
      return;
    }

    if (data.error) {
      weatherEl.innerHTML =
        '<span class="weather-message">Weather unavailable right now</span>';
      return;
    }

    const unit = data.unit || "°F";
    const current = formatTemp(data.temperature, unit);
    const high = formatTemp(data.high, unit);
    const low = formatTemp(data.low, unit);
    const condition = data.condition || "";
    const precip = data.precip || {};
    const precipExpected = !!precip.expected;
    const precipSummary = precip.summary || "No rain or snow expected today";
    const precipClass = precipExpected
      ? "weather-precip is-wet"
      : "weather-precip is-dry";

    weatherEl.innerHTML =
      '<div class="weather-card">' +
      '<div class="weather-now">' +
      '<div class="weather-temp">' +
      escapeHtml(current) +
      "</div>" +
      '<div class="weather-condition">' +
      escapeHtml(condition) +
      "</div>" +
      "</div>" +
      '<div class="weather-range" aria-label="Today high and low">' +
      '<div class="weather-range-item">' +
      '<span class="weather-range-label">High</span>' +
      '<span class="weather-range-value">' +
      escapeHtml(high) +
      "</span>" +
      "</div>" +
      '<div class="weather-range-divider" aria-hidden="true"></div>' +
      '<div class="weather-range-item">' +
      '<span class="weather-range-label">Low</span>' +
      '<span class="weather-range-value">' +
      escapeHtml(low) +
      "</span>" +
      "</div>" +
      "</div>" +
      '<div class="' +
      precipClass +
      '">' +
      escapeHtml(precipSummary) +
      "</div>" +
      "</div>";
  }

  async function loadWeather() {
    const result = await Wardrobe.api("/api/weather");
    if (!result.ok) {
      weatherEl.innerHTML =
        '<span class="weather-message">Weather unavailable right now</span>';
      return;
    }
    renderWeather(result.data);
  }

  Wardrobe.initNav();
  updateClock();
  setInterval(updateClock, 1000);
  loadWeather();
  setInterval(loadWeather, 30 * 60 * 1000);
})();
