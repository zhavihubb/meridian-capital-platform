/* ============================================================
   MERIDIAN CAPITAL PARTNERS — CORE APPLICATION ENGINE
   ------------------------------------------------------------
   Static, client-side platform engine. Persists to localStorage.
   Exposes a single global: EV
   Sections:
     EV.util      — helpers (ids, money, dates, IBAN, account no.)
     EV.catalog   — products, portfolios, loans, categories
     EV.crypto    — deposit wallet addresses
     EV.mail      — email outbox
     EV.store     — state persistence (users, tx, messages, ...)
     EV.auth      — register / login / logout / session
     EV.receipt   — transaction receipt generation
     EV.chat      — support chat widget
   ============================================================ */
(function (global) {
  "use strict";

  var EV = global.EV || {};

  /* ==========================================================
     EV.util — helpers
     ========================================================== */
  var util = {
    uid: function (prefix) {
      return (prefix || "id") + "-" + Date.now().toString(36) + "-" +
        Math.random().toString(36).slice(2, 8);
    },
    rand: function (min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; },
    pad: function (n, len) { n = String(n); while (n.length < len) n = "0" + n; return n; },

    /* Account number: MC-<year>-<8 digits> */
    genAccountNumber: function () {
      var y = new Date().getFullYear();
      return "MC-" + y + "-" + util.pad(util.rand(0, 99999999), 8);
    },
    /* Member id: MC-CL-<5 digits> */
    genMemberId: function () {
      return "MC-CL-" + util.pad(util.rand(0, 99999), 5);
    },
    /* Referral code: MC-<6 chars> */
    genReferralCode: function () {
      var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", s = "";
      for (var i = 0; i < 6; i++) s += chars.charAt(util.rand(0, chars.length - 1));
      return "MC-" + s;
    },
    /* UK IBAN generator (GB) */
    genIBAN: function (country) {
      var cc = country || "GB";
      var bban = "";
      for (var i = 0; i < 14; i++) bban += util.rand(0, 9);
      return cc + util.pad(util.rand(0, 99), 2) + bban;
    },
    /* UK sort code */
    genSortCode: function () {
      return util.pad(util.rand(0, 99), 2) + "-" + util.pad(util.rand(0, 99), 2) + "-" + util.pad(util.rand(0, 99), 2);
    },
    /* UK account number (8 digits) */
    genBankAccount: function () {
      return util.pad(util.rand(0, 99999999), 8);
    },

    fmtMoney: function (amount, symbol) {
      symbol = symbol || "£";
      var n = Number(amount || 0);
      var neg = n < 0; n = Math.abs(n);
      var s = n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return (neg ? "-" : "") + symbol + s;
    },
    fmtNum: function (n) {
      return Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    },
    fmtDate: function (ts) {
      var d = ts ? new Date(ts) : new Date();
      return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    },
    fmtDateTime: function (ts) {
      var d = ts ? new Date(ts) : new Date();
      return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    },
    timeAgo: function (ts) {
      var s = Math.floor((Date.now() - ts) / 1000);
      if (s < 60) return "just now";
      var m = Math.floor(s / 60); if (m < 60) return m + "m ago";
      var h = Math.floor(m / 60); if (h < 24) return h + "h ago";
      var d = Math.floor(h / 24); if (d < 30) return d + "d ago";
      return util.fmtDate(ts);
    },
    esc: function (s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    },
    copy: function (text) {
      try {
        if (navigator.clipboard) { navigator.clipboard.writeText(text); return true; }
        var ta = document.createElement("textarea");
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); document.body.removeChild(ta); return true;
      } catch (e) { return false; }
    }
  };
  EV.util = util;

  /* ==========================================================
     EV.catalog — products, portfolios, loans
     ========================================================== */
  var CATEGORIES = [
    { id: "stocks", icon: "\uD83D\uDCC8", name: "Stocks", desc: "FTSE 100, FTSE 250, UK & global companies", tags: ["FTSE 100", "FTSE 250"] },
    { id: "etfs", icon: "\uD83D\uDCCA", name: "ETFs & Funds", desc: "S&P 500, MSCI World, FTSE Eurofirst 100, sector funds", tags: ["S&P 500", "MSCI World"] },
    { id: "bonds", icon: "\uD83D\uDCB6", name: "Fixed Income", desc: "UK gilts, corporate bonds, index-linked gilts", tags: ["Gilt", "Corporate"] },
    { id: "property", icon: "\uD83C\uDFE0", name: "Real Estate", desc: "UK property funds, REITs, residential exposure", tags: ["REIT", "Property"] },
    { id: "esg", icon: "\uD83C\uDF31", name: "Sustainable / ESG", desc: "Green bonds, renewable energy funds", tags: ["ESG", "Green"] },
    { id: "private", icon: "\uD83D\uDE80", name: "Private Markets", desc: "Private equity, venture capital, infrastructure", tags: ["PE", "VC"] },
    { id: "commodities", icon: "\uD83D\uDEE2\uFE0F", name: "Commodities", desc: "Gold, energy, agricultural commodities", tags: ["Gold", "Energy"] },
    { id: "crypto", icon: "\uD83E\uDE99", name: "Cryptoassets", desc: "Bitcoin, Ethereum and eligible cryptoassets", tags: ["BTC", "ETH"] },
    { id: "retirement", icon: "\uD83C\uDFD6\uFE0F", name: "Retirement", desc: "SIPP, workplace pensions, long-term savings", tags: ["SIPP", "Pension"] },
    { id: "cash", icon: "\uD83D\uDCB5", name: "Cash & Savings", desc: "Cash ISA, Premium Bonds, regulated savings", tags: ["Cash ISA", "Premium Bonds"] },
    { id: "loans", icon: "\uD83C\uDFE6", name: "Loans & Financing", desc: "Personal, mortgage, auto, business, student & consolidation loans", tags: ["Mortgage", "Personal"] }
  ];

  var PRODUCTS = [
    /* Stocks */
    { id: "ftse100", cat: "stocks", icon: "\uD83D\uDCC8", name: "FTSE 100 Index Fund", desc: "\uD83C\uDDEC\uD83C\uDDE7 UK's benchmark index", risk: "Medium", min: 100, price: 5420.00, unit: "\u00A3" },
    { id: "ftse250", cat: "stocks", icon: "\uD83D\uDCC8", name: "FTSE 250 ETF", desc: "\uD83C\uDDEC\uD83C\uDDE7 UK mid-cap index", risk: "Medium", min: 100, price: 28.50, unit: "\u00A3" },
    { id: "ukeu-eq", cat: "stocks", icon: "\uD83D\uDCC8", name: "UK & European Equities", desc: "\uD83C\uDDEC\uD83C\uDDE7 Pan-European stocks", risk: "Medium", min: 100, price: 156.80, unit: "\u00A3" },
    { id: "us-stocks", cat: "stocks", icon: "\uD83D\uDCC8", name: "US Stocks", desc: "\uD83C\uDDFA\uD83C\uDDF8 S&P 500 exposure", risk: "Medium", min: 250, price: 425.00, unit: "\u00A3" },
    /* ETFs */
    { id: "eurofirst100", cat: "etfs", icon: "\uD83D\uDCCA", name: "FTSE Eurofirst 100 ETF", desc: "Top 100 European companies", risk: "Medium", min: 100, price: 45.20, unit: "\u00A3", fee: "0.15%" },
    { id: "msci-world", cat: "etfs", icon: "\uD83D\uDCCA", name: "MSCI World ETF", desc: "Global developed markets", risk: "Medium", min: 100, price: 78.40, unit: "\u00A3", fee: "0.22%" },
    { id: "sp500-etf", cat: "etfs", icon: "\uD83D\uDCCA", name: "S&P 500 ETF", desc: "US large-cap index", risk: "Medium", min: 100, price: 425.00, unit: "\u00A3", fee: "0.07%" },
    { id: "uk-sectors", cat: "etfs", icon: "\uD83D\uDCCA", name: "UK Sector Funds", desc: "Tech, healthcare, finance", risk: "Medium", min: 100, price: 112.30, unit: "\u00A3", fee: "0.35%" },
    /* Bonds */
    { id: "gilt10y", cat: "bonds", icon: "\uD83D\uDCB6", name: "UK Gilt 10Y", desc: "\uD83C\uDDEC\uD83C\uDDE7 UK government bond", risk: "Low", min: 1000, price: 102.30, unit: "\u00A3" },
    { id: "gilt2035", cat: "bonds", icon: "\uD83D\uDCB6", name: "Gilt 2035", desc: "\uD83C\uDDEC\uD83C\uDDE7 UK government bond", risk: "Low", min: 1000, price: 98.50, unit: "\u00A3" },
    { id: "index-gilt", cat: "bonds", icon: "\uD83D\uDCB6", name: "Index-Linked Gilt", desc: "\uD83C\uDDEC\uD83C\uDDE7 Inflation-linked gilt", risk: "Low", min: 1000, price: 100.00, unit: "\u00A3" },
    { id: "corp-bonds", cat: "bonds", icon: "\uD83D\uDCB6", name: "Corporate Bonds", desc: "UK investment grade", risk: "Low", min: 500, price: 101.20, unit: "\u00A3" },
    /* Property */
    { id: "uk-reit", cat: "property", icon: "\uD83C\uDFE0", name: "UK REIT Fund", desc: "UK property funds", risk: "Medium", min: 1000, price: 850.00, unit: "\u00A3" },
    { id: "reit-port", cat: "property", icon: "\uD83C\uDFE0", name: "REIT Portfolio", desc: "UK commercial property", risk: "Medium", min: 500, price: 145.60, unit: "\u00A3" },
    { id: "res-prop", cat: "property", icon: "\uD83C\uDFE0", name: "Residential Property Fund", desc: "UK residential", risk: "Medium", min: 1000, price: 320.00, unit: "\u00A3" },
    /* ESG */
    { id: "green-bond", cat: "esg", icon: "\uD83C\uDF31", name: "Green Bond Fund", desc: "Renewable energy projects", risk: "Low", min: 500, price: 105.00, unit: "\u00A3" },
    { id: "esg-global", cat: "esg", icon: "\uD83C\uDF31", name: "ESG Global Fund", desc: "Sustainable global equities", risk: "Medium", min: 100, price: 89.50, unit: "\u00A3" },
    /* Private */
    { id: "pe-fund", cat: "private", icon: "\uD83D\uDE80", name: "Private Equity Fund", desc: "UK mid-market PE", risk: "High", min: 10000, price: 1000.00, unit: "\u00A3" },
    { id: "vc-fund", cat: "private", icon: "\uD83D\uDE80", name: "Venture Capital", desc: "UK tech startups", risk: "High", min: 10000, price: 750.00, unit: "\u00A3" },
    /* Commodities */
    { id: "gold", cat: "commodities", icon: "\uD83D\uDEE2\uFE0F", name: "Gold ETC", desc: "Physical gold exposure", risk: "Medium", min: 100, price: 185.40, unit: "\u00A3" },
    { id: "energy", cat: "commodities", icon: "\uD83D\uDEE2\uFE0F", name: "Energy Fund", desc: "Oil & gas exposure", risk: "Medium", min: 100, price: 52.30, unit: "\u00A3" },
    /* Crypto */
    { id: "btc", cat: "crypto", icon: "\uD83E\uDE99", name: "Bitcoin", desc: "BTC \u2014 Store of value", risk: "High", min: 10, price: 67500, unit: "\u00A3" },
    { id: "eth", cat: "crypto", icon: "\uD83E\uDE99", name: "Ethereum", desc: "ETH \u2014 Smart contracts", risk: "High", min: 10, price: 3450, unit: "\u00A3" },
    /* Retirement */
    { id: "sipp", cat: "retirement", icon: "\uD83C\uDFD6\uFE0F", name: "SIPP Retirement Fund", desc: "\uD83C\uDDEC\uD83C\uDDE7 UK self-invested personal pension", risk: "Low", min: 100, price: 500.00, unit: "\u00A3" },
    { id: "workplace-pension", cat: "retirement", icon: "\uD83C\uDFD6\uFE0F", name: "Workplace Pension", desc: "\uD83C\uDDEC\uD83C\uDDE7 UK pension scheme", risk: "Low", min: 100, price: 450.00, unit: "\u00A3" },
    /* Cash */
    { id: "cash-isa", cat: "cash", icon: "\uD83D\uDCB5", name: "Cash ISA", desc: "\uD83C\uDDEC\uD83C\uDDE7 UK tax-free savings", risk: "Low", min: 10, price: 1.00, unit: "\u00A3" },
    { id: "premium-bonds", cat: "cash", icon: "\uD83D\uDCB5", name: "Premium Bonds", desc: "\uD83C\uDDEC\uD83C\uDDE7 NS&I savings", risk: "Low", min: 10, price: 1.00, unit: "\u00A3" }
  ];

  var PORTFOLIOS = [
    { id: "uk-conservative", flag: "\uD83C\uDDEC\uD83C\uDDE7", name: "UK Conservative", region: "United Kingdom", risk: "Low", ret: 3.2, vol: 2.1, min: 5000, fee: 0.45, liq: "T+2", horizon: "1\u20133 yrs",
      desc: "A capital-preservation portfolio built around UK gilts, Cash ISA, Premium Bonds and high-grade sterling fixed income. Ideal for risk-averse savers seeking steady returns above inflation.",
      alloc: [["Gilt Bonds", 45], ["Cash ISA / Premium Bonds", 25], ["Money Market", 20], ["Blue Chips", 10]] },
    { id: "uk-balanced", flag: "\uD83C\uDDEC\uD83C\uDDE7", name: "UK Balanced", region: "United Kingdom", risk: "Medium", ret: 6.5, vol: 8.4, min: 10000, fee: 0.85, liq: "T+3", horizon: "5\u20137 yrs",
      desc: "A diversified blend of FTSE 100 equities, UK & European ETFs, REIT property and gilts. Designed for investors seeking growth with moderate downside protection over a 5\u20137 year horizon.",
      alloc: [["FTSE 100 Equities", 35], ["UK & EU ETFs", 25], ["REIT Real Estate", 20], ["Gilt Bonds", 15], ["Cash", 5]] },
    { id: "uk-growth", flag: "\uD83C\uDDEC\uD83C\uDDE7", name: "UK Growth", region: "United Kingdom", risk: "High", ret: 9.8, vol: 15.2, min: 25000, fee: 1.25, liq: "T+5", horizon: "7\u201310+ yrs",
      desc: "An aggressive growth portfolio overweight in UK and European tech, luxury, and green-energy equities, complemented by private equity and sustainable funds. For investors with a 7\u201310+ year horizon.",
      alloc: [["Growth Equities", 40], ["Private Equity", 20], ["ESG Funds", 20], ["Innovation ETFs", 15], ["Cash", 5]] },
    { id: "sterling-income", flag: "\uD83C\uDDEC\uD83C\uDDE7", name: "Sterling Income", region: "United Kingdom", risk: "Low", ret: 3.5, vol: 2.6, min: 5000, fee: 0.45, liq: "T+2", horizon: "1\u20133 yrs",
      desc: "Capital preservation anchored in UK gilts, Treasury bills and sterling investment-grade credit. Designed for UK savers prioritising stability and regular coupon income.",
      alloc: [["Gilt Bonds", 50], ["Treasury Bills", 20], ["UK Corp Bonds", 20], ["Blue Chips", 10]] },
    { id: "uk-midcap", flag: "\uD83C\uDDEC\uD83C\uDDE7", name: "UK Mid-Cap Balanced", region: "United Kingdom", risk: "Medium", ret: 6.8, vol: 9.1, min: 10000, fee: 0.85, liq: "T+3", horizon: "5\u20137 yrs",
      desc: "A balanced mix of FTSE 250 equities, UK & European ETFs, UK real estate funds and gilts. Suited for investors wanting growth potential with controlled risk over a medium-term horizon.",
      alloc: [["FTSE 250", 35], ["UK & EU ETFs", 25], ["RE Funds", 20], ["Gilt Bonds", 15], ["Cash", 5]] },
    { id: "uk-smallcap", flag: "\uD83C\uDDEC\uD83C\uDDE7", name: "UK Small-Cap Growth", region: "United Kingdom", risk: "High", ret: 10.2, vol: 16.0, min: 25000, fee: 1.25, liq: "T+5", horizon: "7\u201310+ yrs",
      desc: "A high-growth strategy focused on UK mid-caps, luxury, industrial automation, and fintech, combined with European innovation ETFs and sustainable infrastructure funds.",
      alloc: [["Growth Equities", 40], ["Private Equity", 20], ["Sustainable Infra", 20], ["Innovation ETFs", 15], ["Cash", 5]] },
    { id: "european-growth", flag: "\uD83C\uDDEA\uD83C\uDDFA", name: "European Growth", region: "Europe", risk: "Medium-High", ret: 8.4, vol: 12.3, min: 15000, fee: 1.05, liq: "T+4", horizon: "5\u201310 yrs",
      desc: "A pan-European growth strategy spanning the continent's strongest economies \u2014 the UK, Germany, France, Spain and the Netherlands. Combines FTSE Eurofirst 100 equities, European government bonds, green-transition infrastructure, and innovation ETFs.",
      alloc: [["FTSE Eurofirst 100", 35], ["EU Innovation ETFs", 25], ["Green Infrastructure", 20], ["EU Gov Bonds", 15], ["Cash", 5]] },
    { id: "global-growth", flag: "\uD83C\uDF0E", name: "Global Growth", region: "Worldwide", risk: "High", ret: 11.5, vol: 18.7, min: 25000, fee: 1.45, liq: "T+5", horizon: "7\u201310+ yrs",
      desc: "Our flagship global strategy with exposure across North America, Europe, Asia-Pacific and emerging markets. Blends MSCI World equities, emerging-market growth, global tech leaders, commodities, and a satellite allocation to digital assets.",
      alloc: [["MSCI World", 35], ["Emerging Markets", 20], ["Global Tech", 20], ["Commodities", 15], ["Digital Assets", 5], ["Cash", 5]] }
  ];

  var LOANS = [
    { id: "personal", icon: "\uD83D\uDCB3", name: "Personal Loan", range: "\u00A31,000\u2013\u00A350,000", rate: "5.9%\u201312.5% APR", tags: ["Unsecured", "12\u201384 mo"] },
    { id: "mortgage", icon: "\uD83C\uDFE0", name: "Mortgage Loan", range: "\u00A350,000\u2013\u00A31,000,000", rate: "3.2%\u20135.8% APR", tags: ["Low Rate", "Up to 30yr"] },
    { id: "auto", icon: "\uD83D\uDE97", name: "Auto Loan", range: "\u00A35,000\u2013\u00A380,000", rate: "4.5%\u20139.2% APR", tags: ["New & Used", "12\u201372 mo"] },
    { id: "business", icon: "\uD83C\uDFE2", name: "Business Loan", range: "\u00A310,000\u2013\u00A3500,000", rate: "6.5%\u201314% APR", tags: ["SME", "Working Capital"] },
    { id: "student", icon: "\uD83C\uDF93", name: "Student Loan", range: "\u00A32,000\u2013\u00A340,000", rate: "3.9%\u20137.5% APR", tags: ["Deferred", "5\u201315 yr"] },
    { id: "consolidation", icon: "\uD83D\uDCE6", name: "Debt Consolidation", range: "\u00A33,000\u2013\u00A375,000", rate: "5.5%\u201313% APR", tags: ["Single Payment", "12\u201396 mo"] },
    { id: "home-equity", icon: "\uD83C\uDFE1", name: "Home Equity Loan", range: "\u00A310,000\u2013\u00A3300,000", rate: "4.8%\u20138.5% APR", tags: ["Secured", "5\u201325 yr"] },
    { id: "bridge", icon: "\uD83C\uDF09", name: "Bridge Loan", range: "\u00A325,000\u2013\u00A3500,000", rate: "8%\u201315% APR", tags: ["Short-term", "6\u201318 mo"] },
    { id: "equipment", icon: "\uD83D\uDD27", name: "Equipment Financing", range: "\u00A35,000\u2013\u00A3250,000", rate: "5.5%\u201311% APR", tags: ["Machinery", "12\u201384 mo"] },
    { id: "credit-line", icon: "\uD83D\uDD04", name: "Credit Line / Revolving", range: "\u00A32,000\u2013\u00A360,000", rate: "7%\u201316% APR", tags: ["Flexible", "Revolving"] },
    { id: "green-energy", icon: "\uD83C\uDF31", name: "Green Energy Loan", range: "\u00A33,000\u2013\u00A3100,000", rate: "3.5%\u20137% APR", tags: ["Eco", "Solar/Heat Pump"] },
    { id: "medical", icon: "\u2695\uFE0F", name: "Medical Loan", range: "\u00A31,000\u2013\u00A350,000", rate: "6%\u201312% APR", tags: ["Healthcare", "12\u201372 mo"] }
  ];

  EV.catalog = {
    categories: CATEGORIES,
    products: PRODUCTS,
    portfolios: PORTFOLIOS,
    loans: LOANS,
    byCategory: function (catId) {
      return PRODUCTS.filter(function (p) { return p.cat === catId; });
    },
    product: function (id) {
      for (var i = 0; i < PRODUCTS.length; i++) if (PRODUCTS[i].id === id) return PRODUCTS[i];
      return null;
    },
    portfolio: function (id) {
      for (var i = 0; i < PORTFOLIOS.length; i++) if (PORTFOLIOS[i].id === id) return PORTFOLIOS[i];
      return null;
    }
  };

  /* ==========================================================
     EV.crypto — deposit wallet addresses
     ========================================================== */
  EV.crypto = {
    W_BTC: "bc1q" + "efuk" + "9x7k2m4p8q1r5t3v6w0y2z4a6b8c0d2e4f",
    W_ETH: "0x" + "MCUK" + "7a3f9c2b5e8d1a4f6c0b3e7d9a2f5c8b1e4d7a0f",
    W_USDT: "T" + "MCUK" + "Qk7m2p9x4r6t1v3w5y8z0a2b4c6d8e0f",
    W_GBP: "GB" + "29" + "MCUK" + "601613" + "31926819",
    label: function (code) {
      return { BTC: "Bitcoin (BTC)", ETH: "Ethereum (ETH)", USDT: "Tether (USDT)", GBP: "Sterling (GBP)" }[code] || code;
    }
  };

  /* ==========================================================
     EV.mail — email outbox (simulated)
     ========================================================== */
  EV.mail = {
    send: function (to, subject, body) {
      var out = EV.store.get("outbox", []);
      out.unshift({ id: util.uid("mail"), to: to, subject: subject, body: body, ts: Date.now() });
      EV.store.set("outbox", out.slice(0, 200));
      return true;
    }
  };

  /* ==========================================================
     EV.store — persistence
     ========================================================== */
  var NS = "meridian_capital_";
  EV.store = {
    get: function (key, fallback) {
      try {
        var raw = localStorage.getItem(NS + key);
        return raw == null ? (fallback === undefined ? null : fallback) : JSON.parse(raw);
      } catch (e) { return fallback === undefined ? null : fallback; }
    },
    set: function (key, val) {
      try { localStorage.setItem(NS + key, JSON.stringify(val)); return true; }
      catch (e) { return false; }
    },
    remove: function (key) { try { localStorage.removeItem(NS + key); } catch (e) {} },
    /* users */
    users: function () { return EV.store.get("users", []); },
    saveUsers: function (u) { EV.store.set("users", u); },
    findUser: function (email) {
      email = String(email || "").toLowerCase();
      var us = EV.store.users();
      for (var i = 0; i < us.length; i++) if (us[i].email.toLowerCase() === email) return us[i];
      return null;
    },
    updateUser: function (user) {
      var us = EV.store.users();
      for (var i = 0; i < us.length; i++) if (us[i].id === user.id) { us[i] = user; break; }
      EV.store.saveUsers(us);
    },
    /* transactions */
    tx: function () { return EV.store.get("transactions", []); },
    addTx: function (t) {
      var all = EV.store.tx();
      t.id = t.id || util.uid("tx");
      t.ts = t.ts || Date.now();
      all.unshift(t);
      EV.store.set("transactions", all);
      return t;
    },
    userTx: function (userId) {
      return EV.store.tx().filter(function (t) { return t.userId === userId; });
    },
    /* notifications */
    notifs: function () { return EV.store.get("notifications", []); },
    addNotif: function (n) {
      var all = EV.store.notifs();
      n.id = n.id || util.uid("ntf");
      n.ts = n.ts || Date.now();
      n.read = false;
      all.unshift(n);
      EV.store.set("notifications", all);
      return n;
    },
    userNotifs: function (userId) {
      return EV.store.notifs().filter(function (n) { return n.userId === userId || n.userId === "all"; });
    },
    /* messages */
    messages: function () { return EV.store.get("messages", []); },
    addMessage: function (m) {
      var all = EV.store.messages();
      m.id = m.id || util.uid("msg");
      m.ts = m.ts || Date.now();
      all.push(m);
      EV.store.set("messages", all);
      return m;
    },
    userMessages: function (userId) {
      return EV.store.messages().filter(function (m) { return m.userId === userId; });
    },
    /* loans */
    loans: function () { return EV.store.get("loans", []); },
    addLoan: function (l) {
      var all = EV.store.loans();
      l.id = l.id || util.uid("loan");
      l.ts = l.ts || Date.now();
      l.status = l.status || "pending";
      all.unshift(l);
      EV.store.set("loans", all);
      return l;
    },
    userLoans: function (userId) {
      return EV.store.loans().filter(function (l) { return l.userId === userId; });
    }
  };

  /* ==========================================================
     EV.auth — registration / login / session
     ========================================================== */
  var ADMIN = { email: "admin@meridiancapital.co.uk", password: "admin123", name: "Administrator", role: "admin" };

  EV.auth = {
    ADMIN: ADMIN,
    current: function () {
      var id = EV.store.get("session", null);
      if (!id) return null;
      if (id === "admin") return { id: "admin", email: ADMIN.email, name: ADMIN.name, role: "admin" };
      var us = EV.store.users();
      for (var i = 0; i < us.length; i++) if (us[i].id === id) return us[i];
      return null;
    },
    isAdmin: function () { var u = EV.auth.current(); return !!u && u.role === "admin"; },
    register: function (data) {
      if (!data.email || !data.password) return { ok: false, error: "Email and password are required." };
      if (data.password.length < 6) return { ok: false, error: "Password must be at least 6 characters." };
      if (EV.store.findUser(data.email)) return { ok: false, error: "An account with this email already exists." };
      var user = {
        id: util.uid("usr"),
        name: data.name || "New Member",
        email: data.email.toLowerCase(),
        phone: data.phone || "",
        password: data.password,
        country: data.country || "GB",
        currency: data.currency || "GBP",
        symbol: data.symbol || "\u00A3",
        balance: 150,               /* £150 welcome bonus */
        bonus: 150,
        accountNumber: util.genAccountNumber(),
        memberId: util.genMemberId(),
        referralCode: util.genReferralCode(),
        referredBy: data.referredBy || null,
        bank: {
          iban: util.genIBAN("GB"),
          bic: "GBPVFRPP",
          sortCode: util.genSortCode(),
          accountNumber: util.genBankAccount(),
          holder: data.name || "New Member"
        },
        kyc: "pending",
        status: "active",
        createdAt: Date.now()
      };
      var us = EV.store.users();
      us.push(user);
      EV.store.saveUsers(us);

      /* welcome bonus transaction */
      EV.store.addTx({ userId: user.id, type: "bonus", amount: 150, currency: "GBP", status: "completed", note: "Welcome bonus" });
      EV.store.addNotif({ userId: user.id, title: "Welcome to Meridian Capital Partners", body: "Your \u00A3150 welcome bonus has been credited to your account." });
      EV.mail.send(user.email, "Welcome to Meridian Capital Partners", "Hi " + user.name + ", your account is open and your \u00A3150 welcome bonus has been credited.");

      /* referral reward */
      if (data.referredBy) {
        var ref = null, all = EV.store.users();
        for (var i = 0; i < all.length; i++) if (all[i].referralCode === data.referredBy) ref = all[i];
        if (ref) {
          ref.balance += 50;
          EV.store.updateUser(ref);
          EV.store.addTx({ userId: ref.id, type: "referral", amount: 50, currency: "GBP", status: "completed", note: "Referral reward \u2014 " + user.name });
          EV.store.addNotif({ userId: ref.id, title: "Referral reward", body: "You earned \u00A350 for referring " + user.name + "." });
        }
      }
      EV.store.set("session", user.id);
      return { ok: true, user: user };
    },
    login: function (email, password) {
      email = String(email || "").toLowerCase();
      if (email === ADMIN.email && password === ADMIN.password) {
        EV.store.set("session", "admin");
        return { ok: true, user: { id: "admin", email: ADMIN.email, name: ADMIN.name, role: "admin" } };
      }
      var u = EV.store.findUser(email);
      if (!u) return { ok: false, error: "No account found for this email." };
      if (u.password !== password) return { ok: false, error: "Incorrect password. Please try again." };
      EV.store.set("session", u.id);
      return { ok: true, user: u };
    },
    logout: function () { EV.store.remove("session"); },
    requireUser: function () {
      var u = EV.auth.current();
      if (!u) { window.location.href = "login.html"; return null; }
      return u;
    },
    requireAdmin: function () {
      var u = EV.auth.current();
      if (!u || u.role !== "admin") { window.location.href = "admin/login.html"; return null; }
      return u;
    }
  };

  /* ==========================================================
     EV.receipt — transaction receipt data
     ========================================================== */
  EV.generateReceiptData = function (tx, user) {
    return {
      institution: "MERIDIAN CAPITAL PARTNERS",
      reference: "MCUK-" + (tx.id || util.uid("rcpt")).toUpperCase().slice(-10),
      date: util.fmtDateTime(tx.ts),
      type: tx.type,
      amount: util.fmtMoney(tx.amount, "\u00A3"),
      currency: tx.currency || "GBP",
      status: tx.status || "completed",
      note: tx.note || "",
      account: user ? user.accountNumber : "\u2014",
      member: user ? user.memberId : "\u2014",
      holder: user ? user.name : "\u2014",
      iban: user && user.bank ? user.bank.iban : "\u2014",
      bic: user && user.bank ? user.bank.bic : "\u2014"
    };
  };

  /* ==========================================================
     EV.loanFee — loan arrangement fee
     ========================================================== */
  EV.loanFee = { rate: 0.05, calc: function (amount) { return Number(amount || 0) * 0.05; } };

  /* ==========================================================
     EV.chat — support chat widget
     ========================================================== */
  var CHAT_REPLIES = [
    "Thanks for reaching out! A member of our London support team will be with you shortly.",
    "You can open an account in minutes and claim your \u00A3150 welcome bonus \u2014 just click \u201CCreate Account\u201D.",
    "Deposits via Faster Payments typically settle within 1\u20132 business days. Card and crypto deposits are credited the same day.",
    "Client funds are held in segregated accounts at tier-1 UK banks, separate from company operating funds.",
    "We support 10 languages \u2014 use the language selector in the header to switch.",
    "For loan enquiries, our team reviews applications within 24\u201348 hours for personal and auto loans."
  ];
  EV.toggleChat = function () {
    var box = document.getElementById("chatBox");
    if (box) box.classList.toggle("open");
  };
  EV.sendChat = function () {
    var input = document.getElementById("chatInput");
    var msgs = document.getElementById("chatMessages");
    if (!input || !msgs || !input.value.trim()) return;
    var text = input.value.trim();
    var userMsg = document.createElement("div");
    userMsg.className = "chat-msg user";
    userMsg.textContent = text;
    msgs.appendChild(userMsg);
    input.value = "";
    msgs.scrollTop = msgs.scrollHeight;
    setTimeout(function () {
      var bot = document.createElement("div");
      bot.className = "chat-msg bot";
      bot.textContent = CHAT_REPLIES[util.rand(0, CHAT_REPLIES.length - 1)];
      msgs.appendChild(bot);
      msgs.scrollTop = msgs.scrollHeight;
    }, 700);
  };

  /* ==========================================================
     EV.sync — cross-tab persistence hook
     ========================================================== */
  EV.sync = {
    init: function () {
      window.addEventListener("storage", function (e) {
        if (e.key && e.key.indexOf(NS) === 0) {
          if (typeof EV.onSync === "function") EV.onSync(e.key);
        }
      });
    }
  };

  global.EV = EV;
})(window);
