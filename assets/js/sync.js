/* ============================================================
   MERIDIAN CAPITAL PARTNERS — SYNC
   Cross-tab / cross-device persistence helpers built on top of
   EV.store. Keeps dashboards live when data changes in another
   tab, and provides a light "cloud" mirror via localStorage.
   ============================================================ */
(function (global) {
  "use strict";
  var EV = global.EV || {};

  var SYNC = {
    /* Mirror the whole state to a single snapshot key so a fresh
       tab can hydrate quickly. */
    snapshot: function () {
      var snap = {
        users: EV.store.users(),
        transactions: EV.store.tx(),
        notifications: EV.store.notifs(),
        messages: EV.store.messages(),
        loans: EV.store.loans(),
        outbox: EV.store.get("outbox", []),
        ts: Date.now()
      };
      EV.store.set("snapshot", snap);
      return snap;
    },
    hydrate: function () {
      var snap = EV.store.get("snapshot", null);
      if (!snap) return false;
      if (!EV.store.get("users", null)) EV.store.set("users", snap.users || []);
      if (!EV.store.get("transactions", null)) EV.store.set("transactions", snap.transactions || []);
      if (!EV.store.get("notifications", null)) EV.store.set("notifications", snap.notifications || []);
      if (!EV.store.get("messages", null)) EV.store.set("messages", snap.messages || []);
      if (!EV.store.get("loans", null)) EV.store.set("loans", snap.loans || []);
      return true;
    },
    /* Register a callback fired whenever another tab mutates state. */
    onChange: function (cb) {
      window.addEventListener("storage", function (e) {
        if (e.key && e.key.indexOf("meridian_capital_") === 0) cb(e.key);
      });
    },
    init: function () {
      SYNC.hydrate();
      SYNC.snapshot();
    }
  };

  EV.sync = EV.sync || {};
  EV.sync.SYNC = SYNC;
  EV.sync.snapshot = SYNC.snapshot;
  EV.sync.hydrate = SYNC.hydrate;
  EV.sync.onChange = SYNC.onChange;
  EV.sync.init = SYNC.init;

  global.EVSync = SYNC;
})(window);
