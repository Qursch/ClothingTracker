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

    this.initIdleTimeout();
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
