(function () {
  const SLOTS = [
    "tops",
    "bottoms",
    "shoes",
    "jacket",
    "watch",
    "bracelet",
    "chain",
    "belt",
  ];

  const SLOT_LABELS = {
    tops: "Tops",
    bottoms: "Bottoms",
    shoes: "Shoes",
    jacket: "Jackets",
    watch: "Watches",
    bracelet: "Bracelets",
    chain: "Chains",
    belt: "Belts",
  };

  const NEVER_DIRTY = {
    chain: true,
    bracelet: true,
    watch: true,
    shoes: true,
    belt: true,
  };

  const SWIPE_THRESHOLD = 40;
  const TAP_THRESHOLD = 15;
  const TAP_MAX_MS = 400;

  const selection = {};
  SLOTS.forEach(function (slot) {
    selection[slot] = null;
  });

  let itemsByCategory = {};
  let savedOutfits = [];
  let savedOutfitId = null;
  let savedSnapshot = null;
  let lastOutfitIndex = -1;
  let activePickerSlot = null;

  const pickerOverlay = document.getElementById("picker-overlay");
  const pickerScroll = document.getElementById("picker-scroll");
  const pickerTitle = document.getElementById("picker-title");
  const nameModal = document.getElementById("name-modal");
  const nameInput = document.getElementById("outfit-name-input");
  const outfitNameBar = document.getElementById("outfit-name-bar");
  const outfitNameDisplay = document.getElementById("outfit-name-display");
  const includeDirtyInput = document.getElementById("include-dirty");

  function showToast(message) {
    Wardrobe.toast(message);
  }

  function includeDirtyClothes() {
    return !!(includeDirtyInput && includeDirtyInput.checked);
  }

  function categoryCanBeDirty(category) {
    return !!(category && !NEVER_DIRTY[category]);
  }

  function isItemDirty(item) {
    if (!item) return false;

    const categories = [];
    if (item.category) categories.push(item.category);
    if (item.slot && categories.indexOf(item.slot) < 0) categories.push(item.slot);

    if (categories.some(function (cat) { return NEVER_DIRTY[cat]; })) {
      return false;
    }

    for (let i = 0; i < categories.length; i++) {
      const live = findItem(categories[i], item.id);
      if (live) return !!live.is_dirty;
    }

    for (let i = 0; i < SLOTS.length; i++) {
      const selected = selection[SLOTS[i]];
      if (selected && selected.id === item.id) {
        return categoryCanBeDirty(SLOTS[i]) && !!selected.is_dirty;
      }
    }

    return !!item.is_dirty;
  }

  function getSwipeableItems(slot) {
    const items = itemsByCategory[slot] || [];
    if (includeDirtyClothes()) return items.slice();
    return items.filter(function (item) {
      return !isItemDirty(item);
    });
  }

  function outfitHasDirtyItem(outfit) {
    return (outfit.items || []).some(function (item) {
      return isItemDirty(item);
    });
  }

  function getSwipeableOutfits() {
    if (includeDirtyClothes()) return savedOutfits.slice();
    return savedOutfits.filter(function (outfit) {
      return !outfitHasDirtyItem(outfit);
    });
  }

  function getSnapshot() {
    const snap = {};
    SLOTS.forEach(function (slot) {
      snap[slot] = selection[slot] ? selection[slot].id : null;
    });
    return snap;
  }

  function snapshotsMatch(a, b) {
    if (!a || !b) return false;
    return SLOTS.every(function (slot) {
      return a[slot] === b[slot];
    });
  }

  function isOnSavedOutfit() {
    return !!(savedOutfitId && snapshotsMatch(getSnapshot(), savedSnapshot));
  }

  function getOutfitDisplayName() {
    if (!isOnSavedOutfit()) return "Custom";
    const outfit = savedOutfits.find(function (entry) {
      return entry.id === savedOutfitId;
    });
    return outfit ? outfit.name : "Custom";
  }

  function renderOutfitName() {
    const name = getOutfitDisplayName();
    outfitNameDisplay.textContent = name;
    outfitNameDisplay.classList.toggle("is-custom", name === "Custom");
  }

  function invalidateSavedIfChanged() {
    if (savedOutfitId && !snapshotsMatch(getSnapshot(), savedSnapshot)) {
      savedOutfitId = null;
      savedSnapshot = null;
      renderOutfitName();
    }
  }

  function findItem(category, itemId) {
    const cats = [];
    if (category) cats.push(category);
    Object.keys(itemsByCategory).forEach(function (cat) {
      if (cats.indexOf(cat) < 0) cats.push(cat);
    });
    for (let i = 0; i < cats.length; i++) {
      const items = itemsByCategory[cats[i]] || [];
      const found = items.find(function (item) {
        return item.id === itemId;
      });
      if (found) return found;
    }
    return undefined;
  }

  function itemDisplayName(item) {
    if (!item) return "";
    return item.name || item.color || item.category || "Unnamed Item";
  }

  function renderSlot(slot) {
    const el = document.querySelector('.slot[data-slot="' + slot + '"]');
    if (!el) return;

    const item = selection[slot];
    const img = el.querySelector("img");
    const wrap = el.querySelector(".slot-image-wrap");
    const empty = el.querySelector(".slot-empty");
    const label = el.querySelector(".slot-label");

    if (item && item.image_url) {
      img.src = item.image_url;
      img.alt = itemDisplayName(item);
      img.classList.add("visible");
      wrap.classList.add("has-image");
    } else {
      img.removeAttribute("src");
      img.classList.remove("visible");
      wrap.classList.remove("has-image");
    }

    if (empty) {
      empty.textContent = item ? "" : "None";
    }

    if (label) {
      label.textContent = item ? itemDisplayName(item) : "None";
    }

    el.classList.toggle(
      "dirty",
      !!(item && categoryCanBeDirty(slot) && isItemDirty(item))
    );
  }

  function renderAllSlots() {
    SLOTS.forEach(renderSlot);
  }

  function selectItem(slot, item) {
    selection[slot] = item;
    invalidateSavedIfChanged();
    renderSlot(slot);
  }

  function clearSlot(slot, animate) {
    selection[slot] = null;
    invalidateSavedIfChanged();
    renderSlot(slot);

    if (animate) {
      const el = document.querySelector('.slot[data-slot="' + slot + '"]');
      if (!el) return;
      el.classList.remove("swipe-left", "swipe-right", "swipe-down");
      void el.offsetWidth;
      el.classList.add("swipe-down");
    }
  }

  function cycleSlot(slot, direction) {
    const items = getSwipeableItems(slot);
    if (!items.length) {
      showToast(
        includeDirtyClothes()
          ? "No " + slot + "s in wardrobe"
          : "No clean " + slot + "s"
      );
      return;
    }

    let index = -1;
    if (selection[slot]) {
      index = items.findIndex(function (item) {
        return item.id === selection[slot].id;
      });
    }

    if (index < 0) {
      index = direction > 0 ? 0 : items.length - 1;
    } else {
      index = (index + direction + items.length) % items.length;
    }

    selectItem(slot, items[index]);

    const el = document.querySelector('.slot[data-slot="' + slot + '"]');
    el.classList.remove("swipe-left", "swipe-right", "swipe-down");
    void el.offsetWidth;
    el.classList.add(direction < 0 ? "swipe-left" : "swipe-right");
  }

  function openPicker(slot) {
    activePickerSlot = slot;
    pickerTitle.textContent = SLOT_LABELS[slot] || slot;
    renderPicker(slot);
    pickerOverlay.hidden = false;
  }

  function closePicker() {
    pickerOverlay.hidden = true;
    activePickerSlot = null;
  }

  function renderPicker(slot) {
    const items = getSwipeableItems(slot);
    const groups = {};

    items.forEach(function (item) {
      const key = item.color || "Other";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    const colors = Object.keys(groups).sort();
    pickerScroll.innerHTML = "";

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "picker-clear";
    clearBtn.textContent = "Clear selection";
    clearBtn.addEventListener("click", function () {
      clearSlot(slot);
      closePicker();
    });
    pickerScroll.appendChild(clearBtn);

    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "picker-group-title";
      empty.textContent = includeDirtyClothes()
        ? "No items in this category yet"
        : "No clean items in this category";
      pickerScroll.appendChild(empty);
      return;
    }

    colors.forEach(function (color) {
      const section = document.createElement("div");
      section.className = "picker-group";

      const title = document.createElement("div");
      title.className = "picker-group-title";
      title.textContent = color;
      section.appendChild(title);

      const grid = document.createElement("div");
      grid.className = "picker-grid";

      groups[color].forEach(function (item) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "picker-item";
        if (selection[slot] && selection[slot].id === item.id) {
          btn.classList.add("selected");
        }

        const thumb = document.createElement("div");
        thumb.className = "picker-item-thumb";

        if (item.image_url) {
          const img = document.createElement("img");
          img.src = item.image_url;
          img.alt = itemDisplayName(item);
          thumb.appendChild(img);
        } else {
          thumb.classList.add("empty-thumb");
          thumb.textContent = item.color || slot;
        }

        btn.appendChild(thumb);

        const caption = document.createElement("span");
        caption.className = "picker-item-name";
        caption.textContent = itemDisplayName(item);
        btn.appendChild(caption);

        if (isItemDirty(item)) {
          btn.classList.add("picker-item-dirty");
        }

        btn.addEventListener("click", function () {
          selectItem(slot, item);
          closePicker();
        });

        grid.appendChild(btn);
      });

      section.appendChild(grid);
      pickerScroll.appendChild(section);
    });
  }

  function attachTouchHandlers(slotEl) {
    const slot = slotEl.dataset.slot;
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let handledTouch = false;

    slotEl.addEventListener(
      "touchstart",
      function (e) {
        const t = e.changedTouches[0];
        startX = t.clientX;
        startY = t.clientY;
        startTime = Date.now();
        handledTouch = false;
      },
      { passive: true }
    );

    slotEl.addEventListener(
      "touchend",
      function (e) {
        const t = e.changedTouches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        const dist = Math.hypot(dx, dy);
        const dt = Date.now() - startTime;

        if (dist < TAP_THRESHOLD && dt < TAP_MAX_MS) {
          handledTouch = true;
          openPicker(slot);
          return;
        }

        if (
          Math.abs(dx) > Math.abs(dy) &&
          Math.abs(dx) > SWIPE_THRESHOLD
        ) {
          handledTouch = true;
          cycleSlot(slot, dx < 0 ? 1 : -1);
          return;
        }

        if (
          Math.abs(dy) > Math.abs(dx) &&
          dy > SWIPE_THRESHOLD
        ) {
          handledTouch = true;
          clearSlot(slot, true);
        }
      },
      { passive: true }
    );

    slotEl.addEventListener("click", function () {
      if (handledTouch) {
        handledTouch = false;
        return;
      }
      openPicker(slot);
    });
  }

  function attachOutfitNameHandlers() {
    let startX = 0;
    let startY = 0;

    outfitNameBar.addEventListener(
      "touchstart",
      function (e) {
        const t = e.changedTouches[0];
        startX = t.clientX;
        startY = t.clientY;
      },
      { passive: true }
    );

    outfitNameBar.addEventListener(
      "touchend",
      function (e) {
        const t = e.changedTouches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;

        if (
          Math.abs(dx) > Math.abs(dy) &&
          Math.abs(dx) > SWIPE_THRESHOLD
        ) {
          cycleOutfit(dx < 0 ? 1 : -1);
        }
      },
      { passive: true }
    );
  }

  function applyOutfit(outfit, options) {
    const opts = options || {};

    SLOTS.forEach(function (slot) {
      selection[slot] = null;
    });

    (outfit.items || []).forEach(function (item) {
      let slot = item.slot;
      if (slot === "shirt") slot = "tops";
      if (slot === "pants" || slot === "shorts") slot = "bottoms";
      if (!slot || SLOTS.indexOf(slot) < 0) return;
      const live = findItem(item.category || slot, item.id);
      selection[slot] = live || item;
    });

    savedOutfitId = outfit.id;
    savedSnapshot = getSnapshot();
    lastOutfitIndex = savedOutfits.findIndex(function (entry) {
      return entry.id === outfit.id;
    });

    renderAllSlots();
    renderOutfitName();

    if (opts.toast !== false) {
      showToast('Loaded "' + outfit.name + '"');
    }
  }

  function cycleOutfit(direction) {
    const outfits = getSwipeableOutfits();
    if (!outfits.length) {
      showToast(
        includeDirtyClothes()
          ? "No saved outfits"
          : "No clean saved outfits"
      );
      return;
    }

    let index = -1;
    if (isOnSavedOutfit()) {
      index = outfits.findIndex(function (entry) {
        return entry.id === savedOutfitId;
      });
    } else if (lastOutfitIndex >= 0 && savedOutfits[lastOutfitIndex]) {
      const lastId = savedOutfits[lastOutfitIndex].id;
      index = outfits.findIndex(function (entry) {
        return entry.id === lastId;
      });
    }

    if (index < 0) {
      index = direction > 0 ? 0 : outfits.length - 1;
    } else {
      index = (index + direction + outfits.length) % outfits.length;
    }

    applyOutfit(outfits[index], { toast: false });

    outfitNameBar.classList.remove("swipe-left", "swipe-right");
    void outfitNameBar.offsetWidth;
    outfitNameBar.classList.add(direction < 0 ? "swipe-left" : "swipe-right");
  }

  async function loadSavedOutfits() {
    const result = await Wardrobe.api("/api/outfits");
    if (!result.ok) return false;
    savedOutfits = result.data || [];
    return true;
  }

  function getSelectedItems() {
    const result = [];
    SLOTS.forEach(function (slot) {
      if (selection[slot]) {
        result.push({ item_id: selection[slot].id, slot: slot });
      }
    });
    return result;
  }

  function getSelectedItemIds() {
    return getSelectedItems().map(function (entry) {
      return entry.item_id;
    });
  }

  async function loadItems(skipDefaults) {
    const result = await Wardrobe.api("/api/items");
    if (!result.ok) return false;

    const items = result.data;
    itemsByCategory = {};

    items.forEach(function (item) {
      const cat = item.category;
      if (!cat) return;
      if (!itemsByCategory[cat]) itemsByCategory[cat] = [];
      itemsByCategory[cat].push(item);
    });

    if (!skipDefaults) {
      const defaultSlots = { tops: true, bottoms: true, shoes: true };
      SLOTS.forEach(function (slot) {
        if (!defaultSlots[slot]) return;
        const list = getSwipeableItems(slot);
        if (list.length && !selection[slot]) {
          selection[slot] = list[0];
        }
      });
    }

    renderAllSlots();
    renderOutfitName();
    return true;
  }

  async function loadOutfitById(outfitId) {
    let outfit = savedOutfits.find(function (entry) {
      return entry.id === outfitId;
    });

    if (!outfit) {
      const result = await Wardrobe.api(
        "/api/outfits/" + encodeURIComponent(outfitId)
      );
      if (!result.ok) return;
      outfit = result.data;
      savedOutfits = [outfit].concat(
        savedOutfits.filter(function (entry) {
          return entry.id !== outfit.id;
        })
      );
    }

    applyOutfit(outfit);
  }

  async function init() {
    const params = new URLSearchParams(window.location.search);
    const loadId = params.get("load");

    const loaded = await loadItems(!!loadId);
    if (!loaded) {
      showToast("Could not load wardrobe");
      return;
    }

    await loadSavedOutfits();

    if (loadId) {
      await loadOutfitById(loadId);
    } else {
      renderOutfitName();
    }
  }

  async function saveOutfit(name) {
    const items = getSelectedItems();
    if (!items.length) {
      showToast("Select at least one item");
      return;
    }

    const result = await Wardrobe.api("/api/outfits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name, items: items }),
    });
    if (!result.ok) return;

    const outfit = result.data;
    savedOutfits = [outfit].concat(
      savedOutfits.filter(function (entry) {
        return entry.id !== outfit.id;
      })
    );
    savedOutfitId = outfit.id;
    savedSnapshot = getSnapshot();
    lastOutfitIndex = 0;
    renderOutfitName();
    showToast('Saved "' + name + '"');
  }

  async function wearToday() {
    const itemIds = getSelectedItemIds();
    if (!itemIds.length) {
      showToast("Select at least one item");
      return;
    }

    let result;
    if (savedOutfitId && snapshotsMatch(getSnapshot(), savedSnapshot)) {
      result = await Wardrobe.api("/api/outfits/" + savedOutfitId + "/wear", {
        method: "POST",
      });
    } else {
      result = await Wardrobe.api("/api/outfits/wear/adhoc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_ids: itemIds }),
      });
    }

    if (!result.ok) return;

    itemIds.forEach(function (id) {
      SLOTS.forEach(function (slot) {
        if (
          selection[slot] &&
          selection[slot].id === id &&
          categoryCanBeDirty(slot)
        ) {
          selection[slot] = Object.assign({}, selection[slot], {
            is_dirty: true,
          });
        }
      });

      Object.keys(itemsByCategory).forEach(function (cat) {
        if (!categoryCanBeDirty(cat)) return;
        itemsByCategory[cat] = itemsByCategory[cat].map(function (item) {
          if (item.id !== id) return item;
          return Object.assign({}, item, { is_dirty: true });
        });
      });

      savedOutfits.forEach(function (outfit) {
        (outfit.items || []).forEach(function (item, idx) {
          if (item.id !== id) return;
          const cat = item.category || item.slot;
          if (!categoryCanBeDirty(cat)) return;
          outfit.items[idx] = Object.assign({}, item, { is_dirty: true });
        });
      });
    });
    renderAllSlots();
    showToast("Logged as worn today");
  }

  document.querySelectorAll(".slot").forEach(attachTouchHandlers);
  attachOutfitNameHandlers();

  includeDirtyInput.addEventListener("change", function () {
    if (activePickerSlot) {
      renderPicker(activePickerSlot);
    }
  });

  document.getElementById("picker-close").addEventListener("click", closePicker);

  document.getElementById("save-btn").addEventListener("click", function () {
    if (!getSelectedItems().length) {
      showToast("Select at least one item");
      return;
    }
    nameInput.value = "";
    nameModal.hidden = false;
    nameInput.focus();
  });

  document.getElementById("name-cancel").addEventListener("click", function () {
    nameModal.hidden = true;
  });

  document.getElementById("name-save").addEventListener("click", async function () {
    const name = nameInput.value.trim();
    if (!name) {
      showToast("Enter a name");
      return;
    }
    nameModal.hidden = true;
    await saveOutfit(name);
  });

  document.getElementById("wear-btn").addEventListener("click", wearToday);

  Wardrobe.initNav();
  init();
})();
