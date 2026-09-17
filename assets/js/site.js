/* ============================================================
   Meridian Capital Partners — public site config loader
   Fetches editable contact details from the backend (/api/site)
   and applies them to any element tagged with data-ev-contact.
   Falls back silently to the hard-coded markup if the API is
   unreachable (e.g. opening the HTML file directly).
   ============================================================ */
(function () {
  'use strict';

  var CACHE_KEY = 'meridian_capital_site';
  var DEFAULTS = {
    phone: '+44 20 7946 0958',
    email: 'hello@meridiancapital.co.uk',
    address: '1 Canada Square, Canary Wharf, London E14 5AB',
    hours: 'Mon\u2013Fri, 9:00 AM \u2013 5:30 PM'
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function apply(contact) {
    contact = contact || {};
    var nodes = document.querySelectorAll('[data-ev-contact]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var key = el.getAttribute('data-ev-contact');
      var val = contact[key];
      if (val == null || val === '') val = DEFAULTS[key] || '';
      var icon = el.getAttribute('data-ev-icon');
      el.innerHTML = (icon ? icon + ' ' : '') + esc(val);
      /* keep mailto/tel links in sync when the element is an <a> */
      if (el.tagName === 'A') {
        if (key === 'email') el.setAttribute('href', 'mailto:' + val);
        if (key === 'phone') el.setAttribute('href', 'tel:' + String(val).replace(/[^+\d]/g, ''));
      }
    }
    /* expose for other scripts */
    window.EV_SITE = { contact: contact };
  }

  /* Apply cached values immediately (no flash of stale data) */
  try {
    var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached && cached.contact) apply(cached.contact);
  } catch (e) {}

  /* Then refresh from the server */
  function load() {
    fetch('/api/site', { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.contact) return;
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) {}
        apply(data.contact);
      })
      .catch(function () { /* offline / file:// — keep defaults */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
