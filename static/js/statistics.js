(function () {
  const listEl = document.getElementById("stats-list");
  const emptyEl = document.getElementById("stats-empty");

  function itemLabel(item) {
    const parts = [];
    if (item.color) parts.push(item.color);
    if (item.category) parts.push(item.category);
    return parts.join(" ") || item.category || "Item";
  }

  function buildRow(item) {
    const li = document.createElement("li");
    li.className = "stats-row";

    const thumb = document.createElement("div");
    thumb.className = "stats-thumb";
    if (item.image_url) {
      const img = document.createElement("img");
      img.src = item.image_url;
      img.alt = item.category || "";
      thumb.appendChild(img);
    } else {
      const fallback = document.createElement("span");
      fallback.className = "thumb-fallback";
      fallback.textContent = item.category || "?";
      thumb.appendChild(fallback);
    }

    const info = document.createElement("div");
    info.className = "stats-info";

    const name = document.createElement("div");
    name.className = "stats-name";
    name.textContent = itemLabel(item);

    const meta = document.createElement("div");
    meta.className = "stats-meta";
    const badge = document.createElement("span");
    badge.className =
      "status-badge " + (item.is_dirty ? "status-dirty" : "status-clean");
    badge.textContent = item.is_dirty ? "Dirty" : "Clean";
    meta.appendChild(badge);
    if (item.tags) {
      meta.appendChild(document.createTextNode(" · " + item.tags));
    }

    info.appendChild(name);
    info.appendChild(meta);

    const wears = document.createElement("div");
    wears.className = "stats-wears";

    const count = document.createElement("div");
    count.className = "stats-wears-count";
    count.textContent = String(item.wear_count);

    const label = document.createElement("div");
    label.className = "stats-wears-label";
    label.textContent = item.wear_count === 1 ? "wear" : "wears";

    wears.appendChild(count);
    wears.appendChild(label);

    li.appendChild(thumb);
    li.appendChild(info);
    li.appendChild(wears);

    return li;
  }

  async function loadStats() {
    listEl.innerHTML = "";
    emptyEl.hidden = true;

    const result = await Wardrobe.api("/api/statistics");
    if (!result.ok) return;

    const items = result.data;
    if (!items.length) {
      emptyEl.hidden = false;
      return;
    }

    items.forEach(function (item) {
      listEl.appendChild(buildRow(item));
    });
  }

  Wardrobe.initNav();
  loadStats();
})();
