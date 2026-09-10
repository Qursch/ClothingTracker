window.Wardrobe = {
  _toastTimer: null,
  _idleTimer: null,
  IDLE_TIMEOUT_MS: 5 * 60 * 1000,

  toast: function (message) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(function () {
      el.hidden = true;
    }, 2500);
  },

  isHomePage: function () {
    var path = window.location.pathname || "/";
    return path === "/" || path === "";
  },

  goHome: function () {
    if (this.isHomePage()) return;
    window.location.href = "/";
  },

  resetIdleTimer: function () {
    var self = this;
    if (this.isHomePage()) return;
    clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(function () {
      self.goHome();
    }, this.IDLE_TIMEOUT_MS);
  },

  initIdleTimeout: function () {
    if (this.isHomePage()) return;

    var self = this;
    var events = [
      "pointerdown",
      "pointermove",
      "touchstart",
      "touchmove",
      "keydown",
      "wheel",
      "scroll",
      "click",
    ];

    function onActivity() {
      self.resetIdleTimer();
    }

    events.forEach(function (name) {
      document.addEventListener(name, onActivity, { passive: true, capture: true });
    });

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) self.resetIdleTimer();
    });

    this.resetIdleTimer();
  },

  isFullscreen: function () {
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );
  },

  enterFullscreen: function () {
    if (this.isFullscreen()) return;
    var el = document.documentElement;
    var request =
      el.requestFullscreen ||
      el.webkitRequestFullscreen ||
      el.mozRequestFullScreen ||
      el.msRequestFullscreen;
    if (!request) return;

    function tryRequest(withOptions) {
      try {
        var result = withOptions
          ? request.call(el, { navigationUI: "hide" })
          : request.call(el);
        if (result && typeof result.catch === "function") {
          result.catch(function () {
            if (withOptions) tryRequest(false);
          });
        }
      } catch (err) {
        if (withOptions) tryRequest(false);
      }
    }

    tryRequest(true);
  },

  initFullscreen: function () {
    var self = this;
    this.enterFullscreen();

    var events = ["pointerdown", "touchstart", "click", "keydown"];
    function onGesture(event) {
      if (event && (event.key === "Escape" || event.key === "F11")) {
        event.preventDefault();
        setTimeout(function () {
          self.enterFullscreen();
        }, 0);
        return;
      }
      self.enterFullscreen();
    }
    events.forEach(function (name) {
      document.addEventListener(name, onGesture, { capture: true });
    });

    ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange"].forEach(
      function (name) {
        document.addEventListener(name, function () {
          if (!self.isFullscreen()) self.enterFullscreen();
        });
      }
    );
  },

  initNav: function () {
    var drawer = document.getElementById("nav-drawer");
    var btn = document.getElementById("menu-btn");
    var closeBtn = document.getElementById("nav-close");
    var backdrop = document.getElementById("nav-backdrop");
    if (!drawer || !btn) return;

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      drawer.hidden = false;
    });

    function closeNav() {
      drawer.hidden = true;
    }

    if (closeBtn) closeBtn.addEventListener("click", closeNav);
    if (backdrop) backdrop.addEventListener("click", closeNav);

    this.initFullscreen();
    this.initIdleTimeout();
  },

  initScrollButtons: function (scrollEl, options) {
    if (!scrollEl) return;
    options = options || {};
    var parent =
      options.parent || document.querySelector(".page-body") || document.body;
    var step = options.step || 200;
    var box = document.createElement("div");
    box.className =
      "scroll-stepper" + (options.extraClass ? " " + options.extraClass : "");
    box.innerHTML =
      '<button type="button" class="scroll-stepper-btn" data-dir="-1" aria-label="Scroll up">▲</button>' +
      '<button type="button" class="scroll-stepper-btn" data-dir="1" aria-label="Scroll down">▼</button>';
    parent.appendChild(box);

    function scrollByDir(dir) {
      scrollEl.scrollBy({ top: dir * step, behavior: "smooth" });
    }

    box.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-dir]");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      scrollByDir(Number(btn.getAttribute("data-dir")));
    });
  },

  api: async function (url, options) {
    try {
      var res = await fetch(url, options || {});
      var data = null;
      var contentType = res.headers.get("content-type") || "";
      if (contentType.indexOf("application/json") !== -1) {
        data = await res.json();
      }
      if (!res.ok) {
        var msg = (data && data.error) || "Something went wrong";
        this.toast(msg);
        return { ok: false, data: data, res: res };
      }
      return { ok: true, data: data, res: res };
    } catch (err) {
      this.toast("Could not reach server");
      return { ok: false, data: null, res: null };
    }
  },
};
