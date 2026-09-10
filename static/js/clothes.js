(function () {
  const CATEGORIES = [
    "shirt",
    "tops",
    "pants",
    "shorts",
    "shoes",
    "jacket",
    "watch",
    "bracelet",
    "chain",
    "belt",
  ];

  const NEVER_DIRTY = {
    chain: true,
    bracelet: true,
    watch: true,
    shoes: true,
    belt: true,
  };

  function categoryCanBeDirty(category) {
    return !!(category && !NEVER_DIRTY[category]);
  }

  let activeCategory = CATEGORIES[0];
  let activeItem = null;

  const tabsEl = document.getElementById("category-tabs");
  const gridEl = document.getElementById("clothes-grid");
  const emptyEl = document.getElementById("clothes-empty");

  const detailOverlay = document.getElementById("detail-overlay");
  const detailTitle = document.getElementById("detail-title");
  const detailImage = document.getElementById("detail-image");
  const detailImageWrap = document.getElementById("detail-image-wrap");
  const detailCategory = document.getElementById("detail-category");
  const detailName = document.getElementById("detail-name");
  const detailSubcategory = document.getElementById("detail-subcategory");
  const detailColor = document.getElementById("detail-color");
  const detailTags = document.getElementById("detail-tags");
  const detailDirty = document.getElementById("detail-dirty");
  const detailDirtyToggle = detailDirty
    ? detailDirty.closest(".dirty-toggle")
    : null;

  const addOverlay = document.getElementById("add-overlay");
  const addCategory = document.getElementById("add-category");

  function itemDisplayName(item) {
    return item.name || item.color || item.category || "Item";
  }

  function buildTabs() {
    tabsEl.innerHTML = "";
    CATEGORIES.forEach(function (cat) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "category-tab" + (cat === activeCategory ? " active" : "");
      btn.textContent = cat;
      btn.addEventListener("click", function () {
        activeCategory = cat;
        buildTabs();
        loadGrid();
      });
      tabsEl.appendChild(btn);
    });
  }

  function buildAddCategorySelect() {
    addCategory.innerHTML = "";
    CATEGORIES.forEach(function (cat) {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
      addCategory.appendChild(opt);
    });
    addCategory.value = activeCategory;
  }

  function renderCard(item) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "clothes-card";
    btn.dataset.id = item.id;

    if (item.image_url) {
      const img = document.createElement("img");
      img.src = item.image_url;
      img.alt = itemDisplayName(item);
      btn.appendChild(img);
    } else {
      const placeholder = document.createElement("span");
      placeholder.className = "card-placeholder";
      placeholder.textContent = itemDisplayName(item);
      btn.appendChild(placeholder);
    }

    if (item.is_dirty && categoryCanBeDirty(item.category)) {
      const dot = document.createElement("span");
      dot.className = "dirty-dot";
      dot.setAttribute("aria-label", "Dirty");
      btn.appendChild(dot);
    }

    btn.addEventListener("click", function () {
      openDetail(item);
    });

    return btn;
  }

  async function loadGrid() {
    gridEl.innerHTML = "";
    emptyEl.hidden = true;

    const result = await Wardrobe.api(
      "/api/items?category=" + encodeURIComponent(activeCategory)
    );
    if (!result.ok) return;

    const items = result.data;
    if (!items.length) {
      emptyEl.hidden = false;
      return;
    }

    items.forEach(function (item) {
      gridEl.appendChild(renderCard(item));
    });
  }

  function openDetail(item) {
    activeItem = item;
    detailTitle.textContent = itemDisplayName(item);
    detailCategory.textContent = item.category || "";

    if (item.image_url) {
      detailImage.src = item.image_url;
      detailImage.classList.add("visible");
      detailImageWrap.classList.add("has-image");
    } else {
      detailImage.removeAttribute("src");
      detailImage.classList.remove("visible");
      detailImageWrap.classList.remove("has-image");
    }

    detailName.value = item.name || "";
    detailSubcategory.value = item.subcategory || "";
    detailColor.value = item.color || "";
    detailTags.value = item.tags || "";
    const canBeDirty = categoryCanBeDirty(item.category);
    detailDirty.checked = canBeDirty && !!item.is_dirty;
    if (detailDirtyToggle) {
      detailDirtyToggle.hidden = !canBeDirty;
    }
    detailOverlay.hidden = false;
  }

  function closeDetail() {
    detailOverlay.hidden = true;
    activeItem = null;
  }

  async function saveDetail() {
    if (!activeItem) return;

    const payload = {
      name: detailName.value.trim() || null,
      subcategory: detailSubcategory.value.trim() || null,
      color: detailColor.value.trim(),
      tags: detailTags.value.trim(),
    };
    if (categoryCanBeDirty(activeItem.category)) {
      payload.is_dirty = detailDirty.checked;
    }

    const result = await Wardrobe.api("/api/items/" + activeItem.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!result.ok) return;

    closeDetail();
    Wardrobe.toast("Saved");
    loadGrid();
  }

  function openAdd() {
    document.getElementById("add-image-url").value = "";
    document.getElementById("add-name").value = "";
    document.getElementById("add-subcategory").value = "";
    document.getElementById("add-color").value = "";
    document.getElementById("add-tags").value = "";
    addCategory.value = activeCategory;
    addOverlay.hidden = false;
  }

  function closeAdd() {
    addOverlay.hidden = true;
  }

  async function submitAdd() {
    const category = addCategory.value;
    const result = await Wardrobe.api("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: document.getElementById("add-image-url").value.trim() || null,
        category: category,
        name: document.getElementById("add-name").value.trim() || null,
        subcategory: document.getElementById("add-subcategory").value.trim() || null,
        color: document.getElementById("add-color").value.trim() || null,
        tags: document.getElementById("add-tags").value.trim(),
      }),
    });
    if (!result.ok) return;

    closeAdd();
    activeCategory = result.data.category || activeCategory;
    buildTabs();
    Wardrobe.toast("Item added");
    loadGrid();
  }

  async function laundryDay() {
    const result = await Wardrobe.api("/api/items/clean-all", { method: "POST" });
    if (!result.ok) return;

    const count = result.data.updated || 0;
    if (count === 0) {
      Wardrobe.toast("Nothing to wash — all clean!");
    } else {
      Wardrobe.toast(
        "Marked " + count + " item" + (count === 1 ? "" : "s") + " clean"
      );
    }
    loadGrid();
  }

  document.getElementById("laundry-btn").addEventListener("click", laundryDay);
  document.getElementById("fab-add").addEventListener("click", openAdd);
  document.getElementById("detail-close").addEventListener("click", closeDetail);
  document.getElementById("detail-save").addEventListener("click", saveDetail);
  document.getElementById("add-close").addEventListener("click", closeAdd);
  document.getElementById("add-submit").addEventListener("click", submitAdd);

  Wardrobe.initNav();
  buildTabs();
  buildAddCategorySelect();
  loadGrid();
})();
