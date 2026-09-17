/* ============================================================
   MERIDIAN CAPITAL PARTNERS — API CLIENT
   Thin fetch wrapper around the Express backend. Stores the JWT
   in localStorage and exposes EV.api.* helpers used by the
   login / register / dashboard / admin pages.
   ============================================================ */
(function (global) {
  "use strict";
  var EV = global.EV || {};

  var TOKEN_KEY = "meridian_capital_token";
  var USER_KEY = "meridian_capital_user";

  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } }
  function setToken(t) { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (e) {} }
  function getCachedUser() { try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch (e) { return null; } }
  function setCachedUser(u) { try { if (u) localStorage.setItem(USER_KEY, JSON.stringify(u)); else localStorage.removeItem(USER_KEY); } catch (e) {} }

  function request(method, path, body) {
    var opts = { method: method, headers: {} };
    var token = getToken();
    if (token) opts.headers["Authorization"] = "Bearer " + token;
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    return fetch(path, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data && data.error ? data.error : ("Request failed (" + res.status + ")"));
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  var api = {
    token: getToken,
    setToken: setToken,
    cachedUser: getCachedUser,
    setCachedUser: setCachedUser,

    /* ---- auth ---- */
    signup: function (payload) {
      return request("POST", "/api/signup", payload).then(function (d) {
        if (d.token) { setToken(d.token); setCachedUser(d.user); }
        return d;
      });
    },
    login: function (email, password) {
      return request("POST", "/api/login", { email: email, password: password }).then(function (d) {
        if (d.token) { setToken(d.token); setCachedUser(d.user); }
        return d;
      });
    },
    logout: function () { setToken(""); setCachedUser(null); },
    me: function () {
      return request("GET", "/api/me").then(function (d) { setCachedUser(d.user); return d.user; });
    },
    forgotPassword: function (email) { return request("POST", "/api/forgot-password", { email: email }); },
    resetPassword: function (token, password) { return request("POST", "/api/reset-password", { token: token, password: password }); },
    changePassword: function (current, next) { return request("POST", "/api/change-password", { current: current, next: next }); },

    /* ---- user data ---- */
    wallets: function () { return request("GET", "/api/wallets"); },
    transactions: function () { return request("GET", "/api/transactions"); },
    deposit: function (payload) { return request("POST", "/api/deposits", payload); },
    withdraw: function (payload) { return request("POST", "/api/withdrawals", payload); },
    cancelTx: function (id) { return request("POST", "/api/transactions/" + id + "/cancel"); },
    loans: function () { return request("GET", "/api/loans"); },
    applyLoan: function (payload) { return request("POST", "/api/loans", payload); },
    referrals: function () { return request("GET", "/api/referrals"); },
    messages: function () { return request("GET", "/api/messages"); },
    sendMessage: function (body) { return request("POST", "/api/messages", { body: body }); },
    notifications: function () { return request("GET", "/api/notifications"); },
    broadcasts: function () { return request("GET", "/api/broadcasts"); },
    rules: function () { return request("GET", "/api/rules"); },
    lead: function (payload) { return request("POST", "/api/leads", payload); },

    /* ---- admin ---- */
    admin: {
      stats: function () { return request("GET", "/api/admin/stats"); },
      users: function (q) { return request("GET", "/api/admin/users" + (q ? "?q=" + encodeURIComponent(q) : "")); },
      setUserStatus: function (id, status) { return request("POST", "/api/admin/users/" + id + "/status", { status: status }); },
      setUserKyc: function (id, kyc) { return request("POST", "/api/admin/users/" + id + "/kyc", { kyc: kyc }); },
      transactions: function (filters) {
        var qs = [];
        if (filters && filters.status) qs.push("status=" + encodeURIComponent(filters.status));
        if (filters && filters.type) qs.push("type=" + encodeURIComponent(filters.type));
        return request("GET", "/api/admin/transactions" + (qs.length ? "?" + qs.join("&") : ""));
      },
      approveTx: function (id) { return request("POST", "/api/admin/transactions/" + id + "/approve"); },
      declineTx: function (id, reason) { return request("POST", "/api/admin/transactions/" + id + "/decline", { reason: reason }); },
      reverseTx: function (id, reason) { return request("POST", "/api/admin/transactions/" + id + "/reverse", { reason: reason }); },
      createTx: function (payload) { return request("POST", "/api/admin/transactions", payload); },
      loans: function () { return request("GET", "/api/admin/loans"); },
      approveLoan: function (id) { return request("POST", "/api/admin/loans/" + id + "/approve"); },
      declineLoan: function (id, reason) { return request("POST", "/api/admin/loans/" + id + "/decline", { reason: reason }); },
      wallets: function () { return request("GET", "/api/admin/wallets"); },
      addWallet: function (payload) { return request("POST", "/api/admin/wallets", payload); },
      updateWallet: function (id, payload) { return request("PUT", "/api/admin/wallets/" + id, payload); },
      deleteWallet: function (id) { return request("DELETE", "/api/admin/wallets/" + id); },
      chats: function () { return request("GET", "/api/admin/chats"); },
      chat: function (userId) { return request("GET", "/api/admin/chats/" + userId); },
      reply: function (userId, body) { return request("POST", "/api/admin/chats/" + userId + "/reply", { body: body }); },
      broadcast: function (subject, body) { return request("POST", "/api/admin/broadcasts", { subject: subject, body: body }); },
      broadcasts: function () { return request("GET", "/api/admin/broadcasts"); },
      alerts: function () { return request("GET", "/api/admin/alerts"); },
      outbox: function () { return request("GET", "/api/admin/outbox"); },
      settings: function () { return request("GET", "/api/admin/settings"); },
      saveSettings: function (payload) { return request("POST", "/api/admin/settings", payload); },
      testEmail: function () { return request("POST", "/api/admin/settings/test-email"); },
      sendRules: function () { return request("POST", "/api/admin/rules/send"); }
    }
  };

  EV.api = api;
  global.EV = EV;
})(window);
