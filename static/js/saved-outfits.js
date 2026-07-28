(function () {
  const MAIN_LAYERS = ["shirt", "pants", "shoes"];

  let pendingDeleteId = null;

  const gridEl = document.getElementById("saved-grid");
  const emptyEl = document.getElementById("saved-empty");
  const deleteModal = document.getElementById("delete-modal");
  const deleteMessage = document.getElementById("delete-message");

  function itemBySlot(outfit, slot) {
    return (outfit.items || []).find(function (item) {
      return item.slot === slot;
    });
  }

  function buildThumbLayer(slot, item) {
    const layer = document.createElement("div");
    layer.className = "thumb-layer thumb-" + slot;

    if (item && item.image_url) {
      const img = document.createElement("img");
      img.src = item.image_url;
      img.alt = slot;
      layer.appendChild(img);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "thumb-placeholder";
      layer.appendChild(placeholder);
    }

    return layer;
  }

  function buildThumb(outfit) {
    const thumb = document.createElement("div");
    thumb.className = "outfit-thumb";

    MAIN_LAYERS.forEach(function (slot) {
      thumb.appendChild(buildThumbLayer(slot, itemBySlot(outfit, slot)));
    });

    return thumb;
  }

  function buildCard(outfit) {
    const card = document.createElement("div");
    card.className = "saved-card-wrap";

    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.className = "saved-card";
    loadBtn.appendChild(buildThumb(outfit));

    const name = document.createElement("div");
    name.className = "outfit-name";
    name.textContent = outfit.name;
    loadBtn.appendChild(name);

    loadBtn.addEventListener("click", function () {
      window.location.href =
        "/outfit-maker?load=" + encodeURIComponent(outfit.id);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "delete-btn";
    deleteBtn.setAttribute("aria-label", "Delete outfit");
    deleteBtn.textContent = "×";
    deleteBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      openDeleteConfirm(outfit);
    });

    card.appendChild(loadBtn);
    card.appendChild(deleteBtn);
    return card;
  }

  function openDeleteConfirm(outfit) {
    pendingDeleteId = outfit.id;
    deleteMessage.textContent =
      'Remove "' + outfit.name + '"? This cannot be undone.';
    deleteModal.hidden = false;
  }

  function closeDeleteConfirm() {
    pendingDeleteId = null;
    deleteModal.hidden = true;
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return;

    const id = pendingDeleteId;
    closeDeleteConfirm();

    const result = await Wardrobe.api("/api/outfits/" + id, {
      method: "DELETE",
    });
    if (!result.ok) return;

    Wardrobe.toast("Outfit deleted");
    loadOutfits();
  }

  async function loadOutfits() {
    gridEl.innerHTML = "";
    emptyEl.hidden = true;

    const result = await Wardrobe.api("/api/outfits");
    if (!result.ok) return;

    const outfits = result.data;
    if (!outfits.length) {
      emptyEl.hidden = false;
      return;
    }

    outfits.forEach(function (outfit) {
      gridEl.appendChild(buildCard(outfit));
    });
  }

  document.getElementById("delete-cancel").addEventListener("click", closeDeleteConfirm);
  document.getElementById("delete-confirm").addEventListener("click", confirmDelete);

  Wardrobe.initNav();
  loadOutfits();
})();
