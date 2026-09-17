/* ============================================================
   MERIDIAN CAPITAL PARTNERS — EXTRAS
   Market ticker, cookie consent, FAQ accordion, count-up stats,
   mobile nav, and small UI niceties.
   ============================================================ */
(function (global) {
  "use strict";

  var EVExtras = {};

  /* ---------- Market ticker ---------- */
  var TICKER = [
    { s: "FTSE 100", v: "8,214.35", c: "+0.62%", up: true },
    { s: "FTSE 250", v: "20,845.10", c: "+0.41%", up: true },
    { s: "GBP/EUR", v: "1.1720", c: "-0.18%", up: false },
    { s: "GBP/USD", v: "1.2685", c: "+0.24%", up: true },
    { s: "UK Gilt 10Y", v: "4.12%", c: "+0.03", up: true },
    { s: "Gold", v: "\u00A31,842/oz", c: "+0.55%", up: true },
    { s: "Brent Crude", v: "\u00A362.40", c: "-0.72%", up: false },
    { s: "BTC/GBP", v: "\u00A353,120", c: "+1.84%", up: true },
    { s: "ETH/GBP", v: "\u00A32,715", c: "+2.10%", up: true },
    { s: "S&P 500", v: "5,431.60", c: "+0.33%", up: true }
  ];

  function buildTicker() {
    var el = document.getElementById("marketTicker");
    if (!el) return;
    var html = "";
    for (var pass = 0; pass < 2; pass++) {
      TICKER.forEach(function (t) {
        html += '<span class="tk"><b>' + t.s + '</b> ' + t.v +
          ' <span class="' + (t.up ? "up" : "down") + '">' + t.c + '</span></span>';
      });
    }
    el.innerHTML = '<div class="track">' + html + '</div>';
  }

  /* ---------- Cookie consent ---------- */
  EVExtras.acceptCookies = function () {
    try { localStorage.setItem("meridian_capital_cookies", "accepted"); } catch (e) {}
    var c = document.getElementById("cookieConsent");
    if (c) c.classList.remove("show");
  };
  EVExtras.declineCookies = function () {
    try { localStorage.setItem("meridian_capital_cookies", "declined"); } catch (e) {}
    var c = document.getElementById("cookieConsent");
    if (c) c.classList.remove("show");
  };
  function initCookies() {
    var choice = null;
    try { choice = localStorage.getItem("meridian_capital_cookies"); } catch (e) {}
    if (!choice) {
      var c = document.getElementById("cookieConsent");
      if (c) setTimeout(function () { c.classList.add("show"); }, 1200);
    }
  }

  /* ---------- FAQ accordion ---------- */
  global.toggleFaq = function (btn) {
    var item = btn.closest(".faq-item");
    if (!item) return;
    item.classList.toggle("open");
  };

  /* ---------- Count-up stats ---------- */
  function initCountUp() {
    var els = document.querySelectorAll("[data-count]");
    if (!els.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        var target = parseFloat(el.getAttribute("data-count"));
        var prefix = el.getAttribute("data-prefix") || "";
        var suffix = el.getAttribute("data-suffix") || "";
        var dec = (el.getAttribute("data-dec") | 0);
        var start = 0, dur = 1400, t0 = null;
        function step(ts) {
          if (!t0) t0 = ts;
          var p = Math.min((ts - t0) / dur, 1);
          var val = start + (target - start) * (1 - Math.pow(1 - p, 3));
          el.textContent = prefix + val.toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + suffix;
          if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
        io.unobserve(el);
      });
    }, { threshold: 0.4 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Mobile nav ---------- */
  function initMobileNav() {
    var toggle = document.getElementById("navToggle");
    var drawer = document.getElementById("mobileNav");
    if (!toggle || !drawer) return;
    toggle.addEventListener("click", function () { drawer.classList.add("open"); });
    drawer.addEventListener("click", function (e) {
      if (e.target === drawer || e.target.classList.contains("close-x")) drawer.classList.remove("open");
    });
  }

  /* ---------- Init ---------- */
  EVExtras.init = function () {
    buildTicker();
    initCookies();
    initCountUp();
    initMobileNav();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", EVExtras.init);
  } else {
    EVExtras.init();
  }

  global.EVExtras = EVExtras;
})(window);
