(function () {
  const locationStatus = document.getElementById("location-status");
  const latitudeInput = document.getElementById("latitude");
  const longitudeInput = document.getElementById("longitude");
  const importFile = document.getElementById("import-file");
  const fileLabel = document.getElementById("file-label");
  const importBtn = document.getElementById("import-btn");
  const importResult = document.getElementById("import-result");

  let selectedFile = null;

  function renderLocation(data) {
    if (data.configured) {
      locationStatus.textContent =
        "Current: " + data.latitude + ", " + data.longitude;
      locationStatus.classList.add("configured");
      latitudeInput.value = data.latitude;
      longitudeInput.value = data.longitude;
    } else {
      locationStatus.textContent = "No location set yet";
      locationStatus.classList.remove("configured");
      latitudeInput.value = "";
      longitudeInput.value = "";
    }
  }

  async function loadLocation() {
    const result = await Wardrobe.api("/api/settings/location");
    if (!result.ok) {
      locationStatus.textContent = "Could not load location";
      return;
    }
    renderLocation(result.data);
  }

  async function saveLocation() {
    const latitude = latitudeInput.value.trim();
    const longitude = longitudeInput.value.trim();

    if (!latitude || !longitude) {
      Wardrobe.toast("Enter latitude and longitude");
      return;
    }

    const result = await Wardrobe.api("/api/settings/location", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude: latitude, longitude: longitude }),
    });
    if (!result.ok) return;

    renderLocation(result.data);
    Wardrobe.toast("Location saved");
  }

  importFile.addEventListener("change", function () {
    selectedFile = importFile.files[0] || null;
    if (selectedFile) {
      fileLabel.textContent = selectedFile.name;
      fileLabel.classList.add("has-file");
      importBtn.disabled = false;
    } else {
      fileLabel.textContent = "Choose JSON file…";
      fileLabel.classList.remove("has-file");
      importBtn.disabled = true;
    }
    importResult.hidden = true;
  });

  async function runImport() {
    if (!selectedFile) return;

    importBtn.disabled = true;
    importResult.hidden = true;

    const formData = new FormData();
    formData.append("file", selectedFile);

    const result = await Wardrobe.api("/api/items/import", {
      method: "POST",
      body: formData,
    });

    importBtn.disabled = false;
    if (!result.ok) return;

    const data = result.data;
    importResult.textContent =
      "Added " +
      data.added +
      " item" +
      (data.added === 1 ? "" : "s") +
      ", skipped " +
      data.skipped +
      " duplicate" +
      (data.skipped === 1 ? "" : "s") +
      ".";
    importResult.hidden = false;
    Wardrobe.toast("Import complete");
  }

  document.getElementById("save-location").addEventListener("click", saveLocation);
  importBtn.addEventListener("click", runImport);

  Wardrobe.initNav();
  loadLocation();
})();
