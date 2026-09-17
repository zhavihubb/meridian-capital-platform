'use strict';
/* ==========================================================
   Meridian Capital Partners — Platform Backend
   Express + SQLite + JWT + Socket.IO + Nodemailer
   UK-focused investment platform (GBP, FCA/FSCS references).
   ========================================================== */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { Server } = require('socket.io');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'data', 'platform.db');
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

/* ---------------- Configuration ---------------- */
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'meridian-capital-dev-secret-change-me-in-prod';
const SIGNUP_BONUS_GBP = 150;   /* welcome bonus in GBP */
const REFERRAL_BONUS_GBP = 50;  /* referral reward in GBP */
const LOAN_FEE_RATE = 0.05;     /* 5% arrangement fee */

const COUNTRY_CURRENCY = require('./countries');

/* Rates in countries.js are "units per 1 USD". Rebase them to "units per 1 GBP"
   so the platform's base currency is GBP (£). GBP_PER_USD = 0.79. */
const GBP_PER_USD = 0.79;
Object.keys(COUNTRY_CURRENCY).forEach(function (k) {
  const c = COUNTRY_CURRENCY[k];
  if (c && typeof c.rate === 'number') c.rate = +(c.rate / GBP_PER_USD).toFixed(6);
});

function currencyFor(countryCode) {
  const cc = String(countryCode || '').trim().toUpperCase();
  if (COUNTRY_CURRENCY[cc]) return COUNTRY_CURRENCY[cc];
  return { code: 'GBP', symbol: '\u00a3', rate: 1, name: 'British Pound', flag: '\ud83c\uddec\ud83c\udde7' };
}

/* ---------------- Database schema ---------------- */
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  country TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  currency_symbol TEXT NOT NULL,
  fx_rate REAL NOT NULL DEFAULT 1,
  balance REAL NOT NULL DEFAULT 0,
  bonus_received INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  phone TEXT DEFAULT '',
  account_number TEXT DEFAULT '',
  member_id TEXT DEFAULT '',
  referral_code TEXT DEFAULT '',
  referred_by TEXT DEFAULT '',
  kyc TEXT NOT NULL DEFAULT 'pending',
  sort_code TEXT DEFAULT '',
  iban TEXT DEFAULT '',
  bic TEXT DEFAULT '',
  bank_holder TEXT DEFAULT '',
  reset_token TEXT DEFAULT NULL,
  reset_expires REAL DEFAULT NULL,
  last_seen REAL DEFAULT NULL,
  created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  network TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USDT',
  address TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  amount REAL NOT NULL,
  reference TEXT NOT NULL,
  method TEXT DEFAULT '',
  wallet_address TEXT DEFAULT '',
  note TEXT DEFAULT '',
  admin_note TEXT DEFAULT '',
  balance_after REAL DEFAULT NULL,
  created_at REAL NOT NULL,
  processed_at REAL DEFAULT NULL,
  processed_by INTEGER DEFAULT NULL
);
CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  product TEXT NOT NULL,
  amount REAL NOT NULL,
  term INTEGER NOT NULL,
  purpose TEXT DEFAULT '',
  rate TEXT DEFAULT '',
  fee REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT DEFAULT '',
  created_at REAL NOT NULL,
  processed_at REAL DEFAULT NULL,
  processed_by INTEGER DEFAULT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  icon TEXT DEFAULT '\ud83d\udd14',
  read INTEGER NOT NULL DEFAULT 0,
  created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  sender TEXT NOT NULL,
  body TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS broadcasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS email_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'saved',
  error TEXT DEFAULT '',
  created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  user_id INTEGER DEFAULT NULL,
  message TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loan_user ON loans(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_user ON messages(user_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at DESC);
`);

/* ---------------- Seed ---------------- */
function seed() {
  const now = Date.now();
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@meridianncapital.com';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  if (!db.prepare("SELECT id FROM users WHERE role = 'admin'").get()) {
    db.prepare(`INSERT INTO users (full_name,email,password_hash,role,country,currency_code,currency_symbol,fx_rate,balance,account_number,member_id,referral_code,kyc,sort_code,iban,bic,bank_holder,created_at,last_seen)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run('Platform Administrator', adminEmail, bcrypt.hashSync(adminPass, 10), 'admin', 'GB', 'GBP', '\u00a3', 1, 0,
        'MC-ADMIN', 'MC-AD-00001', 'MC-ADMIN', 'verified', '00-00-00', 'GB00MCUK00000000000000', 'MCUKGB2L', 'Meridian Capital Partners', now, now);
  }
  if (db.prepare('SELECT COUNT(*) c FROM wallets').get().c === 0) {
    const ins = db.prepare('INSERT INTO wallets (network,currency,address,active,updated_at) VALUES (?,?,?,?,?)');
    ins.run('Bitcoin (BTC)', 'BTC', 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', 1, now);
    ins.run('Ethereum (ETH)', 'ETH', '0x71C7656EC7ab88b098defB751B7401B5f6d8976F', 1, now);
    ins.run('USDT (TRC20)', 'USDT', 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE', 1, now);
    ins.run('USDT (ERC20)', 'USDT', '0xdAC17F958D2ee523a2206206994597C13D831ec7', 1, now);
  }
  const s = (k, v) => {
    if (!db.prepare('SELECT key FROM settings WHERE key=?').get(k)) db.prepare('INSERT INTO settings (key,value) VALUES (?,?)').run(k, v);
  };
  s('smtp_host', ''); s('smtp_port', '587'); s('smtp_user', ''); s('smtp_pass', '');
  s('smtp_from', 'Meridian Capital Partners <no-reply@meridianncapital.com>');
  s('admin_notify_email', adminEmail);
  s('site_url', 'http://localhost:' + PORT);
  s('signup_bonus', String(SIGNUP_BONUS_GBP));
  s('referral_bonus', String(REFERRAL_BONUS_GBP));
  /* Editable public contact details (shown in topbar + contact section on every page) */
  s('contact_phone', '+44 20 7946 0958');
  s('contact_email', 'hello@meridianncapital.com');
  s('contact_address', '1 Canada Square, Canary Wharf, London E14 5AB');
  s('contact_hours', 'Mon\u2013Fri, 9:00 AM \u2013 5:30 PM');
}
seed();

/* ---------------- Backup engine (cross-redeploy persistence safety net) ---------------- */
const BACKUP_DIR = path.join(__dirname, 'data', 'backups');
fs.mkdirSync(BACKUP_DIR, { recursive: true });

function backupDb(label) {
  try {
    try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch (e) {}
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = 'platform-' + (label ? label + '-' : '') + stamp + '.db';
    fs.copyFileSync(DB_PATH, path.join(BACKUP_DIR, file));
    const old = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('platform-') && f.endsWith('.db')).sort();
    while (old.length > 10) fs.unlinkSync(path.join(BACKUP_DIR, old.shift()));
    console.log('  \u2714 Backup saved: data/backups/' + file);
    return file;
  } catch (e) {
    console.error('  \u2716 Backup failed:', e.message);
    return null;
  }
}
const backupTimer = setInterval(function () { backupDb('auto'); }, 6 * 60 * 60 * 1000);
backupTimer.unref();
backupDb('boot');

/* ---------------- Helpers ---------------- */
const nowMs = () => Date.now();
const genRef = (p) => p + '-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 7).toUpperCase();
const ONLINE_WINDOW = 70000;

function genAccountNumber() { return 'MC-' + new Date().getFullYear() + '-' + String(Math.floor(10000000 + Math.random() * 89999999)); }
function genMemberId() { return 'MC-CL-' + String(Math.floor(10000 + Math.random() * 89999)); }
function genReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return 'MC-' + s;
}
function genSortCode() { return String(Math.floor(10 + Math.random() * 89)) + '-' + String(Math.floor(10 + Math.random() * 89)) + '-' + String(Math.floor(10 + Math.random() * 89)); }
function genBankAccount() { return String(Math.floor(10000000 + Math.random() * 89999999)); }
function genIBAN(sortCode, acct) {
  const sc = String(sortCode).replace(/-/g, '');
  return 'GB' + String(Math.floor(10 + Math.random() * 89)) + 'MCUK' + sc + String(acct).padStart(8, '0');
}

function getSetting(key) {
  const r = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return r ? r.value : '';
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value));
}
function fmt(amount, symbol) {
  const n = Number(amount || 0);
  return symbol + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function relTime(ts) {
  if (!ts) return '\u2014';
  const d = Math.floor((nowMs() - ts) / 1000);
  if (d < 30) return 'just now';
  if (d < 60) return d + 's ago';
  if (d < 3600) return Math.floor(d / 60) + 'm ago';
  if (d < 86400) return Math.floor(d / 3600) + 'h ago';
  if (d < 604800) return Math.floor(d / 86400) + 'd ago';
  return new Date(ts).toLocaleDateString('en-GB');
}

/* ---------------- Email engine ---------------- */
async function sendMail(to, subject, html) {
  const host = getSetting('smtp_host');
  const from = getSetting('smtp_from') || 'Meridian Capital Partners <no-reply@meridianncapital.com>';
  const row = db.prepare('INSERT INTO email_outbox (to_email,subject,html,status,created_at) VALUES (?,?,?,?,?)')
    .run(to, subject, html, 'saved', nowMs());
  if (!host) return { id: row.lastInsertRowid, sent: false, reason: 'SMTP not configured \u2014 saved to outbox' };
  try {
    const transporter = nodemailer.createTransport({
      host: host,
      port: Number(getSetting('smtp_port') || 587),
      secure: Number(getSetting('smtp_port')) === 465,
      auth: getSetting('smtp_user') ? { user: getSetting('smtp_user'), pass: getSetting('smtp_pass') } : undefined
    });
    await transporter.sendMail({ from: from, to: to, subject: subject, html: html });
    db.prepare('UPDATE email_outbox SET status=? WHERE id=?').run('sent', row.lastInsertRowid);
    return { id: row.lastInsertRowid, sent: true };
  } catch (e) {
    db.prepare('UPDATE email_outbox SET status=?, error=? WHERE id=?').run('failed', String(e.message).slice(0, 400), row.lastInsertRowid);
    return { id: row.lastInsertRowid, sent: false, reason: e.message };
  }
}

/* Branded email wrapper matching the Meridian Capital Partners template design */
function emailTemplate(title, bodyHtml, ctaLabel, ctaUrl) {
  const btn = (ctaLabel && ctaUrl)
    ? '<div style="text-align:center;margin:32px 0;"><a href="' + ctaUrl + '" style="display:inline-block;background:#C9A227;color:#231a00;font-weight:700;padding:14px 34px;border-radius:999px;text-decoration:none;font-family:Arial,sans-serif;">' + ctaLabel + '</a></div>'
    : '';
  return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0A1F33;">' +
    '<div style="background:#0A1F33;padding:28px 12px;font-family:Arial,Helvetica,sans-serif;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#0A1F33;border-radius:14px;overflow:hidden;border:1px solid rgba(201,162,39,.35);">' +
    '<tr><td style="padding:26px 34px;border-bottom:1px solid rgba(255,255,255,.08);">' +
    '<table role="presentation"><tr>' +
    '<td style="width:44px;height:44px;background:linear-gradient(135deg,#0A1F33,#0E4C92);border-radius:10px;color:#E7CE6B;font-family:Georgia,serif;font-weight:700;font-size:18px;text-align:center;vertical-align:middle;">MC</td>' +
    '<td style="padding-left:12px;">' +
    '<div style="font-family:Georgia,serif;color:#ffffff;font-size:19px;font-weight:700;">Meridian Capital Partners</div>' +
    '<div style="color:#9db0c4;font-size:10px;letter-spacing:2.5px;text-transform:uppercase;">UK Investment Platform</div>' +
    '</td></tr></table></td></tr>' +
    '<tr><td style="padding:34px;color:#e8eef5;font-size:15px;line-height:1.7;">' +
    '<div style="font-family:Georgia,serif;color:#E7CE6B;font-size:22px;font-weight:700;margin-bottom:14px;">' + title + '</div>' +
    bodyHtml + btn +
    '<p style="color:#9db0c4;font-size:12.5px;margin-top:28px;">If you did not initiate this activity, please contact support immediately from your dashboard or reply to this email.</p>' +
    '</td></tr>' +
    '<tr><td style="padding:22px 34px;border-top:1px solid rgba(255,255,255,.08);color:#9db0c4;font-size:11.5px;line-height:1.6;">' +
    '\u00a9 ' + new Date().getFullYear() + ' Meridian Capital Partners. Registered in England &amp; Wales. Authorised and regulated by the Financial Conduct Authority (FCA).<br/>' +
    'Capital at risk. Investing involves risk, including possible loss of principal. Eligible deposits protected by the FSCS up to \u00a385,000.' +
    '</td></tr></table></div></body></html>';
}

/* ---------------- Notification engine ---------------- */
function notify(userId, title, body, icon, opts) {
  opts = opts || {};
  db.prepare('INSERT INTO notifications (user_id,title,body,icon,created_at) VALUES (?,?,?,?,?)')
    .run(userId, title, body, icon || '\ud83d\udd14', nowMs());
  io.to('user-' + userId).emit('notification', { title: title, body: body, icon: icon || '\ud83d\udd14', at: nowMs() });
  if (opts.email) {
    sendMail(opts.email, title, emailTemplate(title, '<p>' + body + '</p>', opts.ctaLabel || 'Open Dashboard', getSetting('site_url') + '/user/dashboard.html'));
  }
}

function adminAlert(kind, userId, message) {
  db.prepare('INSERT INTO admin_alerts (kind,user_id,message,created_at) VALUES (?,?,?,?)').run(kind, userId, message, nowMs());
  io.to('admins').emit('admin_alert', { kind: kind, message: message, at: nowMs() });
}

/* ---------------- Auth middleware ---------------- */
function tokenFrom(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  return req.query.token || '';
}
function auth(req, res, next) {
  try {
    const payload = jwt.verify(tokenFrom(req), JWT_SECRET);
    const u = db.prepare('SELECT id,role,status FROM users WHERE id=?').get(payload.sub);
    if (!u) return res.status(401).json({ error: 'Account not found' });
    if (u.status !== 'active') return res.status(403).json({ error: 'Account suspended. Contact support.' });
    req.user = u;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
}
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true }));

/* Block direct access to the server directory, then serve the static site. */
app.use(function (req, res, next) {
  if (req.path.indexOf('/server') === 0) return res.status(404).end();
  next();
});
app.use(express.static(path.join(__dirname, '..')));

/* ================= AUTH ROUTES ================= */

app.post('/api/leads', (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const interest = String(b.interest || '').trim();
  const message = String(b.message || '').trim().slice(0, 1000);
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
  db.prepare('INSERT INTO admin_alerts (kind,user_id,message,created_at) VALUES (?,?,?,?)')
    .run('lead', null, 'New enquiry from ' + name + ' (' + email + ') \u2014 ' + interest + (message ? ': ' + message.slice(0, 200) : ''), nowMs());
  const adminEmail = getSetting('admin_notify_email') || 'admin@meridianncapital.com';
  sendMail(adminEmail, 'New website enquiry \u2014 ' + name,
    emailTemplate('New Website Enquiry',
      '<p><b>' + name + '</b> (' + email + ') is interested in <b>' + interest + '</b>.</p>' +
      (message ? '<div style="background:rgba(255,255,255,.06);border-radius:10px;padding:16px;color:#E7CE6B;font-style:italic;">"' + message + '"</div>' : '') +
      '<p>Reach out to them from your admin dashboard.</p>',
      'Open Admin Dashboard', getSetting('site_url') + '/admin/dashboard.html'));
  res.json({ message: 'Thank you \u2014 our advisory team will reach out within one business day.' });
});

app.post('/api/signup', (req, res) => {
  const b = req.body || {};
  const full_name = String(b.full_name || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  const country = String(b.country || '').trim().toUpperCase();
  const phone = String(b.phone || '').trim();
  const ref = String(b.ref || b.referred_by || '').trim().toUpperCase();
  if (!full_name || !email || !password || !country) return res.status(400).json({ error: 'All fields are required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Invalid email address' });
  if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) return res.status(409).json({ error: 'An account with this email already exists' });

  const cur = currencyFor(country);
  const bonusGBP = Number(getSetting('signup_bonus') || SIGNUP_BONUS_GBP);
  const bonusAmt = +(bonusGBP * cur.rate).toFixed(2);

  const accountNumber = genAccountNumber();
  const memberId = genMemberId();
  const referralCode = genReferralCode();
  const sortCode = genSortCode();
  const bankAcct = genBankAccount();
  const iban = genIBAN(sortCode, bankAcct);
  const bic = 'MCUKGB2L';

  const info = db.prepare(`INSERT INTO users (full_name,email,password_hash,role,country,currency_code,currency_symbol,fx_rate,balance,bonus_received,phone,account_number,member_id,referral_code,referred_by,kyc,sort_code,iban,bic,bank_holder,created_at,last_seen)
                           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(full_name, email, bcrypt.hashSync(password, 10), 'user', country, cur.code, cur.symbol, cur.rate, bonusAmt, 1, phone,
      accountNumber, memberId, referralCode, ref, 'pending', sortCode, iban, bic, full_name, nowMs(), nowMs());
  const uid = info.lastInsertRowid;

  db.prepare(`INSERT INTO transactions (user_id,type,status,amount,reference,method,note,balance_after,created_at)
              VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(uid, 'bonus', 'approved', bonusAmt, genRef('BON'), 'system', 'Welcome bonus \u2014 \u00a3' + bonusGBP + ' credited on signup', bonusAmt, nowMs());

  /* Referral reward */
  if (ref) {
    const referrer = db.prepare("SELECT * FROM users WHERE referral_code=? AND role='user'").get(ref);
    if (referrer) {
      const refBonus = +(Number(getSetting('referral_bonus') || REFERRAL_BONUS_GBP) * referrer.fx_rate).toFixed(2);
      const newBal = +(referrer.balance + refBonus).toFixed(2);
      db.prepare('UPDATE users SET balance=? WHERE id=?').run(newBal, referrer.id);
      db.prepare(`INSERT INTO transactions (user_id,type,status,amount,reference,method,note,balance_after,created_at)
                  VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(referrer.id, 'referral', 'approved', refBonus, genRef('REF'), 'referral', 'Referral reward \u2014 ' + full_name + ' joined', newBal, nowMs());
      notify(referrer.id, 'Referral reward earned \ud83c\udf81', 'You earned ' + fmt(refBonus, referrer.currency_symbol) + ' because ' + full_name + ' joined with your code.', '\ud83c\udf81', { email: referrer.email });
    }
  }

  notify(uid, 'Welcome to Meridian Capital Partners \ud83c\udf89',
    'Your account is ready, ' + full_name.split(' ')[0] + '. We have credited a welcome bonus of ' + fmt(bonusAmt, cur.symbol) + ' to your balance.',
    '\ud83c\udf81', { email: email, ctaLabel: 'View My Dashboard' });
  adminAlert('signup', uid, 'New user registered: ' + full_name + ' (' + email + ') \u2014 ' + cur.flag + ' ' + cur.code);
  sendMail(email, 'Welcome to Meridian Capital Partners',
    emailTemplate('Welcome, ' + full_name.split(' ')[0] + ' \ud83d\udc4b',
      '<p>Your Meridian Capital Partners account is active and your ' + cur.code + ' dashboard is ready.</p>' +
      '<p style="background:rgba(201,162,39,.12);border-left:3px solid #C9A227;padding:14px 16px;border-radius:8px;color:#E7CE6B;">A welcome bonus of <b>' + fmt(bonusAmt, cur.symbol) + '</b> has been credited to your account instantly.</p>' +
      '<p>You can now fund your investment account, view live wallets and reach our support team 24/7 from your dashboard.</p>',
      'Open My Dashboard', getSetting('site_url') + '/user/dashboard.html'));

  const token = jwt.sign({ sub: uid }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token: token, user: publicUser(uid) });
});

app.post('/api/login', (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const password = String((req.body || {}).password || '');
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!u || !bcrypt.compareSync(password, u.password_hash)) return res.status(401).json({ error: 'Invalid email or password' });
  if (u.status !== 'active') return res.status(403).json({ error: 'Account suspended. Contact support.' });
  db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(nowMs(), u.id);
  notify(u.id, 'New sign-in detected \ud83d\udd10',
    'A successful login to your account was recorded on ' + new Date().toLocaleString('en-GB') + '. If this was not you, reset your password and contact support.',
    '\ud83d\udd10', { email: u.email });
  const token = jwt.sign({ sub: u.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token: token, user: publicUser(u.id) });
});

app.post('/api/forgot-password', (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  const genericMsg = 'If an account exists for this email, a reset link has been sent.';
  if (!u) return res.json({ message: genericMsg });
  const tok = crypto.randomBytes(24).toString('hex');
  db.prepare('UPDATE users SET reset_token=?, reset_expires=? WHERE id=?').run(tok, nowMs() + 30 * 60 * 1000, u.id);
  const url = getSetting('site_url') + '/reset.html?token=' + tok;
  sendMail(u.email, 'Reset your Meridian Capital Partners password',
    emailTemplate('Password Reset Requested',
      '<p>We received a request to reset the password for your account (' + u.email + ').</p>' +
      '<p>This secure link is valid for <b>30 minutes</b>:</p>' +
      '<p style="word-break:break-all;"><a href="' + url + '" style="color:#E7CE6B;">' + url + '</a></p>',
      'Reset My Password', url));
  notify(u.id, 'Password reset requested', 'A password reset was requested for your account. Check your email for the secure link (valid 30 minutes).', '\ud83d\udd11', { email: u.email });
  adminAlert('reset', u.id, 'Password reset requested for ' + u.email);
  res.json({ message: genericMsg });
});

app.post('/api/reset-password', (req, res) => {
  const token = String((req.body || {}).token || '');
  const password = String((req.body || {}).password || '');
  if (!token || password.length < 6) return res.status(400).json({ error: 'A valid link and a password of 6+ characters are required' });
  const u = db.prepare('SELECT * FROM users WHERE reset_token=?').get(token);
  if (!u || u.reset_expires < nowMs()) return res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new one.' });
  db.prepare('UPDATE users SET password_hash=?, reset_token=NULL, reset_expires=NULL WHERE id=?')
    .run(bcrypt.hashSync(password, 10), u.id);
  notify(u.id, 'Password changed successfully', 'Your login password was reset successfully. If you did not perform this action, contact support immediately.', '\u2705', { email: u.email });
  adminAlert('reset', u.id, 'Password reset completed for ' + u.email);
  res.json({ message: 'Password updated. You can now log in with your new password.' });
});

app.post('/api/change-password', auth, (req, res) => {
  const current = String((req.body || {}).current || '');
  const next = String((req.body || {}).next || '');
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!bcrypt.compareSync(current, u.password_hash)) return res.status(400).json({ error: 'Current password is incorrect' });
  if (next.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(next, 10), u.id);
  notify(u.id, 'Login details updated', 'Your password was changed from your dashboard settings. If this was not you, contact support immediately.', '\ud83d\udee1\ufe0f', { email: u.email });
  res.json({ message: 'Password updated successfully' });
});

/* ================= USER ROUTES ================= */

function publicUser(id) {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!u) return null;
  const unreadNotifs = db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read=0').get(id).c;
  const unreadMsgs = db.prepare("SELECT COUNT(*) c FROM messages WHERE user_id=? AND sender='support' AND read=0").get(id).c;
  const cur = currencyFor(u.country);
  return {
    id: u.id, name: u.full_name, full_name: u.full_name, email: u.email, role: u.role, country: u.country,
    currency: u.currency_code, currency_code: u.currency_code, symbol: u.currency_symbol, currency_symbol: u.currency_symbol,
    fx_rate: u.fx_rate, flag: cur.flag, currency_name: cur.name,
    balance: u.balance, phone: u.phone, status: u.status, kyc: u.kyc,
    accountNumber: u.account_number, memberId: u.member_id, referralCode: u.referral_code, referredBy: u.referred_by,
    bank: { holder: u.bank_holder, sortCode: u.sort_code, accountNumber: u.account_number, iban: u.iban, bic: u.bic },
    created_at: u.created_at, createdAt: u.created_at,
    online: !!(u.last_seen && (nowMs() - u.last_seen < ONLINE_WINDOW)), last_seen: u.last_seen,
    unread_notifications: unreadNotifs, unread_messages: unreadMsgs
  };
}

app.get('/api/me', auth, (req, res) => {
  db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(nowMs(), req.user.id);
  res.json({ user: publicUser(req.user.id) });
});

app.get('/api/wallets', (req, res) => {
  res.json({ wallets: db.prepare('SELECT id,network,currency,address,active FROM wallets WHERE active=1 ORDER BY id').all() });
});

app.get('/api/transactions', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 200').all(req.user.id);
  const sym = db.prepare('SELECT currency_symbol FROM users WHERE id=?').get(req.user.id).currency_symbol;
  res.json({ transactions: rows, symbol: sym });
});

/* Cancel a pending request (user-side). Withdrawals refund the held amount. */
app.post('/api/transactions/:id/cancel', auth, (req, res) => {
  const t = db.prepare('SELECT * FROM transactions WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!t) return res.status(404).json({ error: 'Transaction not found' });
  if (t.status !== 'pending') return res.status(400).json({ error: 'Only pending requests can be cancelled' });
  if (t.type !== 'withdrawal' && t.type !== 'deposit') return res.status(400).json({ error: 'This request cannot be cancelled' });
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  let balanceAfter = u.balance;
  const run = db.transaction(() => {
    if (t.type === 'withdrawal') balanceAfter = adjustBalance(u.id, t.amount); /* return held funds */
    db.prepare('UPDATE transactions SET status=?, admin_note=?, processed_at=? WHERE id=?')
      .run('cancelled', 'Cancelled by client', nowMs(), t.id);
  });
  run();
  notify(u.id, 'Request cancelled', 'Your ' + t.type + ' of ' + fmt(t.amount, u.currency_symbol) + ' (ref ' + t.reference + ') was cancelled at your request.' + (t.type === 'withdrawal' ? ' The held amount has been returned to your balance.' : ''), '\u21a9\ufe0f', { email: u.email });
  sendMail(u.email, 'Request cancelled',
    emailTemplate('Request Cancelled',
      '<p>Your ' + t.type + ' of <b>' + fmt(t.amount, u.currency_symbol) + '</b> (ref ' + t.reference + ') was cancelled at your request.</p>' +
      (t.type === 'withdrawal' ? '<p>The held amount has been returned to your available balance.</p>' : '') +
      '<p>Current balance: <b style="color:#E7CE6B;">' + fmt(balanceAfter, u.currency_symbol) + '</b></p>',
      'Open Dashboard', getSetting('site_url') + '/user/dashboard.html'));
  adminAlert('cancel', u.id, 'Client ' + u.full_name + ' cancelled their ' + t.type + ' of ' + fmt(t.amount, u.currency_symbol) + ' \u2014 ref ' + t.reference);
  res.json({ message: 'Request cancelled.', balance_after: balanceAfter });
});

app.post('/api/deposits', auth, (req, res) => {
  if (req.user.role === 'admin') return res.status(400).json({ error: 'Admin accounts do not make deposits' });
  const amt = Number((req.body || {}).amount);
  const method = String((req.body || {}).method || (req.body || {}).network || '').trim();
  const tx_proof = String((req.body || {}).tx_proof || '').slice(0, 500);
  if (!amt || amt <= 0) return res.status(400).json({ error: 'Enter a valid amount' });
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  const ref = genRef('DEP');
  db.prepare(`INSERT INTO transactions (user_id,type,status,amount,reference,method,note,created_at)
              VALUES (?,?,?,?,?,?,?,?)`)
    .run(u.id, 'deposit', 'pending', +amt.toFixed(2), ref, method, tx_proof, nowMs());
  notify(u.id, 'Deposit request submitted', 'Your deposit of ' + fmt(amt, u.currency_symbol) + ' via ' + method + ' is pending admin confirmation. Reference: ' + ref, '\ud83d\udce5', { email: u.email });
  adminAlert('deposit', u.id, 'New deposit request: ' + fmt(amt, u.currency_symbol) + ' (' + method + ') from ' + u.full_name + ' \u2014 ref ' + ref);
  sendMail(u.email, 'Deposit request received',
    emailTemplate('Deposit Request Received',
      '<p>We received your deposit request of <b>' + fmt(amt, u.currency_symbol) + '</b> via ' + method + '.</p>' +
      '<p>Reference: <b>' + ref + '</b>. Status: <b style="color:#E7CE6B;">Pending confirmation</b>. You will be notified the moment it is processed.</p>',
      'View Transaction', getSetting('site_url') + '/user/dashboard.html'));
  res.json({ message: 'Deposit request submitted. You will be notified once processed.', reference: ref });
});

app.post('/api/withdrawals', auth, (req, res) => {
  if (req.user.role === 'admin') return res.status(400).json({ error: 'Admin accounts do not make withdrawals' });
  const amt = Number((req.body || {}).amount);
  const method = String((req.body || {}).method || (req.body || {}).network || '').trim();
  const dest = String((req.body || {}).destination || (req.body || {}).wallet_address || '').trim();
  const note = String((req.body || {}).note || '').slice(0, 500);
  if (!amt || amt <= 0) return res.status(400).json({ error: 'Enter a valid amount' });
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (amt > u.balance) return res.status(400).json({ error: 'Insufficient balance. Available: ' + fmt(u.balance, u.currency_symbol) });
  if (dest.length < 6) return res.status(400).json({ error: 'Provide your payout destination details' });
  const newBal = +(u.balance - amt).toFixed(2);
  const ref = genRef('WDR');
  const run = db.transaction(() => {
    db.prepare('UPDATE users SET balance=? WHERE id=?').run(newBal, u.id);
    db.prepare(`INSERT INTO transactions (user_id,type,status,amount,reference,method,wallet_address,note,balance_after,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(u.id, 'withdrawal', 'pending', +amt.toFixed(2), ref, method, dest, note, newBal, nowMs());
  });
  run();
  notify(u.id, 'Withdrawal request submitted', 'Your withdrawal of ' + fmt(amt, u.currency_symbol) + ' to ' + method + ' is pending admin approval. The amount is held from your balance. Reference: ' + ref, '\ud83d\udce4', { email: u.email });
  adminAlert('withdrawal', u.id, 'New withdrawal request: ' + fmt(amt, u.currency_symbol) + ' \u2192 ' + method + ' from ' + u.full_name + ' \u2014 ref ' + ref);
  sendMail(u.email, 'Withdrawal request received',
    emailTemplate('Withdrawal Request Received',
      '<p>We received your withdrawal request of <b>' + fmt(amt, u.currency_symbol) + '</b> via ' + method + '.</p>' +
      '<p>The amount has been held from your balance pending approval. Reference: <b>' + ref + '</b>.</p>',
      'View Transaction', getSetting('site_url') + '/user/dashboard.html'));
  res.json({ message: 'Withdrawal request submitted. Funds are held pending approval.', reference: ref, new_balance: newBal });
});

/* ---- Loans ---- */
app.get('/api/loans', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM loans WHERE user_id=? ORDER BY created_at DESC').all(req.user.id);
  res.json({ loans: rows });
});

app.post('/api/loans', auth, (req, res) => {
  if (req.user.role === 'admin') return res.status(400).json({ error: 'Admin accounts do not apply for loans' });
  const b = req.body || {};
  const product = String(b.product || '').trim();
  const amount = Number(b.amount);
  const term = parseInt(b.term, 10) || 36;
  const purpose = String(b.purpose || '').slice(0, 300);
  const rate = String(b.rate || '').slice(0, 40);
  if (!product) return res.status(400).json({ error: 'Choose a loan product' });
  if (!amount || amount < 1000) return res.status(400).json({ error: 'Minimum loan amount is \u00a31,000' });
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  const fee = +(amount * LOAN_FEE_RATE).toFixed(2);
  const info = db.prepare(`INSERT INTO loans (user_id,product,amount,term,purpose,rate,fee,status,created_at)
                           VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(u.id, product, +amount.toFixed(2), term, purpose, rate, fee, 'pending', nowMs());
  notify(u.id, 'Loan application received', 'Your ' + fmt(amount, u.currency_symbol) + ' ' + product + ' application is under review. A 5% arrangement fee (' + fmt(fee, u.currency_symbol) + ') applies.', '\ud83c\udfe6', { email: u.email });
  adminAlert('loan', u.id, 'New loan application: ' + fmt(amount, u.currency_symbol) + ' \u2014 ' + product + ' from ' + u.full_name);
  res.json({ message: 'Loan application submitted. Our team will review it within 24\u201348 hours.', id: info.lastInsertRowid, fee: fee });
});

/* ---- Referrals ---- */
app.get('/api/referrals', auth, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  const referred = db.prepare("SELECT id,full_name,email,created_at FROM users WHERE referred_by=? AND role='user'").all(u.referral_code);
  const earn = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE user_id=? AND type='referral'").get(u.id).s;
  res.json({
    code: u.referral_code,
    link: getSetting('site_url') + '/register.html?ref=' + u.referral_code,
    count: referred.length,
    earnings: earn,
    referred: referred
  });
});

/* ---- Messages / support chat ---- */
app.get('/api/messages', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM messages WHERE user_id=? ORDER BY created_at ASC').all(req.user.id);
  db.prepare("UPDATE messages SET read=1 WHERE user_id=? AND sender='support'").run(req.user.id);
  res.json({ messages: rows });
});

app.post('/api/messages', auth, (req, res) => {
  const body = String((req.body || {}).body || '').trim();
  if (req.user.role === 'admin') return res.status(400).json({ error: 'Use the admin reply endpoint' });
  if (!body) return res.status(400).json({ error: 'Message cannot be empty' });
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  const info = db.prepare('INSERT INTO messages (user_id,sender,body,created_at) VALUES (?,?,?,?)')
    .run(u.id, 'user', body.slice(0, 2000), nowMs());
  const msg = db.prepare('SELECT * FROM messages WHERE id=?').get(info.lastInsertRowid);
  io.to('user-' + u.id).emit('chat_message', msg);
  io.to('admins').emit('support_message', { user_id: u.id, user_name: u.full_name, message: msg });
  adminAlert('support_message', u.id, '\ud83d\udcac ' + u.full_name + ': ' + body.slice(0, 120));
  res.json({ message: msg });
});

app.get('/api/notifications', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(req.user.id);
  db.prepare('UPDATE notifications SET read=1 WHERE user_id=?').run(req.user.id);
  res.json({ notifications: rows });
});

app.get('/api/broadcasts', auth, (req, res) => {
  res.json({ broadcasts: db.prepare('SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT 100').all() });
});

/* ================= Rules & Regulations ================= */
const RULES = {
  updated: 'January 2025',
  intro: 'These Rules & Regulations govern your use of the Meridian Capital Partners platform and your client account. By creating an account you confirm that you have read, understood and agreed to be bound by them. They form part of your relationship with Meridian Capital Partners and apply alongside any separate written agreements.',
  sections: [
    { title: '1. Account Opening & Eligibility', body: 'You must be at least 18 years old and legally capable of entering into binding contracts. You must provide accurate, complete and current information when registering, including your true country of residence, as this determines your account currency. One account per person \u2014 duplicate accounts are subject to suspension. Accounts opened under false identity or on behalf of undisclosed third parties will be closed and balances forfeited pending review.' },
    { title: '2. Account Security', body: 'You are solely responsible for keeping your login credentials confidential. Never share your password with anyone, including persons claiming to be Meridian Capital staff \u2014 we will never ask for your password. Enable unique, strong passwords and change them periodically from your dashboard. Notify support immediately if you suspect unauthorised access to your account.' },
    { title: '3. Deposits', body: 'Deposits are accepted by Faster Payments bank transfer, debit/credit card, or to the official crypto wallet addresses published on your dashboard Deposit page. Always copy addresses directly from the platform; addresses shared by any other channel (email, chat, social media) must be treated as untrusted. Always include your transaction reference when submitting a deposit request. Deposits are credited only after confirmation by our team.' },
    { title: '4. Withdrawals', body: 'Withdrawal requests are processed by our team after review. The requested amount is held from your available balance immediately upon submission and returned automatically if a request is declined. Payout details must belong to you \u2014 double-check every destination before submitting. Additional verification may be requested for large withdrawals.' },
    { title: '5. Welcome Bonus', body: 'New clients receive a welcome bonus credited to their account upon registration, shown in their registration currency. The bonus is a goodwill credit and may be subject to activity conditions before withdrawal; it may be reversed for accounts opened solely to farm bonuses, for duplicate accounts, or for abuse as determined by our team.' },
    { title: '6. Prohibited Conduct', body: 'You agree not to: use the platform for any unlawful purpose or in violation of any applicable law; attempt to gain unauthorised access to the platform, other accounts, or our systems; use automated tools, bots or scripts to interact with the platform; submit fraudulent or manipulated deposit proofs; harass, abuse or spam our support team; or misrepresent your identity or the origin of your funds.' },
    { title: '7. Communications', body: 'By registering you consent to receive account notifications, transaction updates, company broadcasts and service messages by email and within the platform. You may contact support at any time through the live chat in your dashboard. Support will never ask for your password or request funds to a personal account.' },
    { title: '8. Suspension & Termination', body: 'We may suspend or restrict an account where we reasonably suspect fraud, breach of these rules, security risk, or legal/regulatory obligation. Where an account is suspended for investigation, balances are frozen until the review concludes, not forfeited. You may close your account at any time by contacting support; pending transactions will be settled first.' },
    { title: '9. Risk Disclosure', body: 'All investment activity involves risk, including the possible loss of principal. Past performance is not indicative of future results. No communication from Meridian Capital Partners should be construed as a guarantee of returns. Never invest funds you cannot afford to lose, and consider seeking advice from a licensed professional in your jurisdiction.' },
    { title: '10. Changes to These Rules', body: 'We may update these Rules & Regulations from time to time. Material changes are announced to all clients by email and in-app broadcast before taking effect. Continued use of the platform after the effective date constitutes acceptance of the updated rules.' },
    { title: '11. Governing Law', body: 'These rules and your use of the platform are governed by the laws of England and Wales, without regard to conflict-of-law principles. Any dispute will first be addressed through good-faith negotiation via support.' },
    { title: '12. Contact & Complaints', body: 'Questions or complaints about these rules, your account, or the platform should be directed to our support team through the live chat in your dashboard or by email. We aim to acknowledge complaints within 24 hours and resolve them within 15 business days. Eligible complainants may refer unresolved complaints to the Financial Ombudsman Service.' }
  ]
};

app.get('/api/rules', (req, res) => { res.json({ rules: RULES }); });

app.post('/api/admin/rules/send', auth, adminOnly, (req, res) => {
  const users = db.prepare("SELECT * FROM users WHERE role='user' AND status='active'").all();
  const subject = 'Meridian Capital Partners \u2014 Rules & Regulations (updated ' + RULES.updated + ')';
  const html = RULES.sections.map(function (s) {
    return '<h3 style="font-family:Georgia,serif;color:#E7CE6B;font-size:16px;margin:24px 0 8px 0;">' + s.title + '</h3>' +
           '<p style="color:#e8eef5;">' + s.body + '</p>';
  }).join('');
  users.forEach(function (u) {
    notify(u.id, 'Rules & Regulations updated', 'We have sent the current Rules & Regulations to your email. Please take a moment to review them.', '\ud83d\udcdc', { email: u.email });
    sendMail(u.email, subject,
      emailTemplate('Rules & Regulations',
        '<p>' + RULES.intro + '</p>' + html +
        '<p style="color:#9db0c4;font-size:13px;">You can also read the rules at any time on our website Rules & Regulations page.</p>',
        'Open My Dashboard', getSetting('site_url') + '/user/dashboard.html'));
  });
  db.prepare('INSERT INTO broadcasts (subject,body,created_at) VALUES (?,?,?)')
    .run(subject, RULES.intro + ' Full document emailed to your registered address \u2014 also available on the Rules & Regulations page.', nowMs());
  adminAlert('rules', null, 'Rules & Regulations emailed to ' + users.length + ' users');
  res.json({ message: 'Rules & Regulations sent to ' + users.length + ' users', sent_to: users.length });
});

/* ================= ADMIN ROUTES ================= */

app.get('/api/admin/stats', auth, adminOnly, (req, res) => {
  const users = db.prepare("SELECT COUNT(*) c FROM users WHERE role='user'").get().c;
  const online = db.prepare("SELECT COUNT(*) c FROM users WHERE role='user' AND last_seen > ?").get(nowMs() - ONLINE_WINDOW).c;
  const totalBalances = db.prepare("SELECT COALESCE(SUM(balance),0) s FROM users WHERE role='user'").get().s;
  const pendingDeposits = db.prepare("SELECT COUNT(*) c FROM transactions WHERE type='deposit' AND status='pending'").get().c;
  const pendingWithdrawals = db.prepare("SELECT COUNT(*) c FROM transactions WHERE type='withdrawal' AND status='pending'").get().c;
  const pendingLoans = db.prepare("SELECT COUNT(*) c FROM loans WHERE status='pending'").get().c;
  const depositsApproved = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE type='deposit' AND status='approved'").get().s;
  const withdrawalsApproved = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE type='withdrawal' AND status='approved'").get().s;
  const openChats = db.prepare("SELECT COUNT(DISTINCT user_id) c FROM messages WHERE user_id IN (SELECT id FROM users WHERE role='user')").get().c;
  const unreadAlerts = db.prepare('SELECT COUNT(*) c FROM admin_alerts WHERE read=0').get().c;
  res.json({
    users: users, online: online, totalBalances: totalBalances,
    pendingDeposits: pendingDeposits, pendingWithdrawals: pendingWithdrawals, pendingLoans: pendingLoans,
    depositsApproved: depositsApproved, withdrawalsApproved: withdrawalsApproved,
    openChats: openChats, unreadAlerts: unreadAlerts,
    currencies: db.prepare("SELECT currency_code code, COUNT(*) c FROM users WHERE role='user' GROUP BY currency_code").all()
  });
});

app.get('/api/admin/users', auth, adminOnly, (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  let rows;
  if (q) {
    rows = db.prepare("SELECT * FROM users WHERE role='user' AND (LOWER(full_name) LIKE ? OR LOWER(email) LIKE ?) ORDER BY created_at DESC").all('%' + q + '%', '%' + q + '%');
  } else {
    rows = db.prepare("SELECT * FROM users WHERE role='user' ORDER BY created_at DESC").all();
  }
  const enriched = rows.map(function (u) {
    const pub = publicUser(u.id);
    pub.bonus_received = !!u.bonus_received;
    pub.tx_count = db.prepare('SELECT COUNT(*) c FROM transactions WHERE user_id=?').get(u.id).c;
    return pub;
  });
  res.json({ users: enriched });
});

app.post('/api/admin/users/:id/status', auth, adminOnly, (req, res) => {
  const target = db.prepare("SELECT * FROM users WHERE id=? AND role='user'").get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  const status = ((req.body || {}).status === 'suspended') ? 'suspended' : 'active';
  db.prepare('UPDATE users SET status=? WHERE id=?').run(status, target.id);
  notify(target.id, status === 'suspended' ? 'Account suspended' : 'Account reactivated',
    status === 'suspended' ? 'Your account has been suspended. Contact support for assistance.' : 'Good news \u2014 your account has been reactivated.',
    '\u26a0\ufe0f', { email: target.email });
  res.json({ message: 'User status updated', status: status });
});

app.post('/api/admin/users/:id/kyc', auth, adminOnly, (req, res) => {
  const target = db.prepare("SELECT * FROM users WHERE id=? AND role='user'").get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  const kyc = ((req.body || {}).kyc === 'verified') ? 'verified' : 'pending';
  db.prepare('UPDATE users SET kyc=? WHERE id=?').run(kyc, target.id);
  notify(target.id, kyc === 'verified' ? 'Identity verified \u2705' : 'Verification pending',
    kyc === 'verified' ? 'Your identity has been verified. Full account features are now unlocked.' : 'Your verification status has been reset to pending.',
    '\ud83e\uddd1', { email: target.email });
  res.json({ message: 'KYC updated', kyc: kyc });
});

app.get('/api/admin/transactions', auth, adminOnly, (req, res) => {
  let sql = "SELECT t.*, u.full_name, u.email, u.currency_symbol, u.currency_code FROM transactions t JOIN users u ON u.id = t.user_id WHERE u.role='user'";
  const params = [];
  if (req.query.status) { sql += ' AND t.status=?'; params.push(req.query.status); }
  if (req.query.type) { sql += ' AND t.type=?'; params.push(req.query.type); }
  sql += ' ORDER BY t.created_at DESC LIMIT 400';
  res.json({ transactions: db.prepare(sql).all.apply(db.prepare(sql), params) });
});

function adjustBalance(userId, delta) {
  const u = db.prepare('SELECT balance FROM users WHERE id=?').get(userId);
  const newBal = +(u.balance + delta).toFixed(2);
  db.prepare('UPDATE users SET balance=? WHERE id=?').run(newBal, userId);
  return newBal;
}

app.post('/api/admin/transactions/:id/approve', auth, adminOnly, (req, res) => {
  const t = db.prepare('SELECT t.*, u.email, u.currency_symbol FROM transactions t JOIN users u ON u.id=t.user_id WHERE t.id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Transaction not found' });
  if (t.status !== 'pending') return res.status(400).json({ error: 'Transaction already ' + t.status });
  let balanceAfter;
  if (t.type === 'deposit') {
    balanceAfter = adjustBalance(t.user_id, t.amount);
  } else if (t.type === 'withdrawal') {
    balanceAfter = db.prepare('SELECT balance FROM users WHERE id=?').get(t.user_id).balance;
  } else {
    return res.status(400).json({ error: 'Only deposit/withdrawal requests can be approved here' });
  }
  db.prepare('UPDATE transactions SET status=?, processed_at=?, processed_by=?, balance_after=? WHERE id=?')
    .run('approved', nowMs(), req.user.id, balanceAfter, t.id);
  const title = (t.type === 'deposit') ? 'Deposit approved \u2705' : 'Withdrawal approved \u2705';
  notify(t.user_id, title, 'Your ' + t.type + ' of ' + fmt(t.amount, t.currency_symbol) + ' (ref ' + t.reference + ') has been approved by our team.', t.type === 'deposit' ? '\ud83d\udce5' : '\ud83d\udce4', { email: t.email });
  sendMail(t.email, title,
    emailTemplate(title,
      '<p>Your ' + t.type + ' of <b>' + fmt(t.amount, t.currency_symbol) + '</b> via ' + t.method + ' has been approved.</p>' +
      '<p>Reference: <b>' + t.reference + '</b> \u00b7 New balance: <b style="color:#E7CE6B;">' + fmt(balanceAfter, t.currency_symbol) + '</b></p>',
      'Open Dashboard', getSetting('site_url') + '/user/dashboard.html'));
  res.json({ message: 'Approved', balance_after: balanceAfter });
});

app.post('/api/admin/transactions/:id/decline', auth, adminOnly, (req, res) => {
  const reason = String((req.body || {}).reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'A reason is required to decline' });
  const t = db.prepare('SELECT t.*, u.email, u.currency_symbol FROM transactions t JOIN users u ON u.id=t.user_id WHERE t.id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Transaction not found' });
  if (t.status !== 'pending') return res.status(400).json({ error: 'Transaction already ' + t.status });
  let balanceAfter = null;
  if (t.type === 'withdrawal') balanceAfter = adjustBalance(t.user_id, t.amount);
  db.prepare('UPDATE transactions SET status=?, admin_note=?, processed_at=?, processed_by=?, balance_after=? WHERE id=?')
    .run('declined', reason, nowMs(), req.user.id, balanceAfter, t.id);
  const label = (t.type === 'deposit') ? 'Deposit' : 'Withdrawal';
  notify(t.user_id, label + ' declined \u274c', 'Your ' + t.type + ' of ' + fmt(t.amount, t.currency_symbol) + ' (ref ' + t.reference + ') was declined. Reason: ' + reason, '\u26d4', { email: t.email });
  sendMail(t.email, label + ' request declined',
    emailTemplate('Request Declined',
      '<p>Your ' + t.type + ' of <b>' + fmt(t.amount, t.currency_symbol) + '</b> (ref ' + t.reference + ') was declined.</p>' +
      '<p>Reason from our team: <i>"' + reason + '"</i></p>' +
      (t.type === 'withdrawal' ? '<p>The held amount has been returned to your available balance.</p>' : ''),
      'Open Dashboard', getSetting('site_url') + '/user/dashboard.html'));
  res.json({ message: 'Declined with reason' });
});

app.post('/api/admin/transactions/:id/reverse', auth, adminOnly, (req, res) => {
  const reason = String((req.body || {}).reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'A reason is required to reverse the transaction' });
  const t = db.prepare('SELECT t.*, u.email, u.currency_symbol FROM transactions t JOIN users u ON u.id=t.user_id WHERE t.id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Transaction not found' });
  if (t.status !== 'approved') return res.status(400).json({ error: 'Only approved transactions can be reversed' });
  let balanceAfter;
  if (t.type === 'withdrawal') balanceAfter = adjustBalance(t.user_id, t.amount);
  else balanceAfter = adjustBalance(t.user_id, -t.amount);
  db.prepare('UPDATE transactions SET status=?, admin_note=?, processed_at=?, processed_by=?, balance_after=? WHERE id=?')
    .run('reversed', reason, nowMs(), req.user.id, balanceAfter, t.id);
  notify(t.user_id, 'Transaction reversed \u21a9\ufe0f', 'Your ' + t.type + ' of ' + fmt(t.amount, t.currency_symbol) + ' (ref ' + t.reference + ') was reversed. Reason: ' + reason, '\u21a9\ufe0f', { email: t.email });
  sendMail(t.email, 'Transaction reversed',
    emailTemplate('Transaction Reversed',
      '<p>Your ' + t.type + ' of <b>' + fmt(t.amount, t.currency_symbol) + '</b> (ref ' + t.reference + ') has been reversed by our team.</p>' +
      '<p>Reason: <i>"' + reason + '"</i></p>' +
      '<p>Current balance: <b style="color:#E7CE6B;">' + fmt(balanceAfter, t.currency_symbol) + '</b></p>',
      'Open Dashboard', getSetting('site_url') + '/user/dashboard.html'));
  res.json({ message: 'Reversed with reason', balance_after: balanceAfter });
});

app.post('/api/admin/transactions', auth, adminOnly, (req, res) => {
  const b = req.body || {};
  const user_id = Number(b.user_id);
  const type = String(b.type || '');
  const amt = Number(b.amount);
  const note = String(b.note || '').slice(0, 500);
  if (!user_id || !type || !amt || amt <= 0) return res.status(400).json({ error: 'User, type and a positive amount are required' });
  const u = db.prepare("SELECT * FROM users WHERE id=? AND role='user'").get(user_id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (['credit', 'debit', 'profit', 'bonus'].indexOf(type) === -1) return res.status(400).json({ error: 'Type must be credit, debit, profit or bonus' });
  const delta = (type === 'debit') ? -amt : amt;
  if (u.balance + delta < 0) return res.status(400).json({ error: 'Debit exceeds user balance' });
  const balanceAfter = adjustBalance(u.id, delta);
  const ref = genRef(type === 'profit' ? 'PRF' : (type === 'bonus' ? 'BON' : type.toUpperCase().slice(0, 3)));
  db.prepare(`INSERT INTO transactions (user_id,type,status,amount,reference,method,note,balance_after,created_at,processed_at,processed_by)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(u.id, type, 'approved', +amt.toFixed(2), ref, 'admin', note, balanceAfter, nowMs(), nowMs(), req.user.id);
  notify(u.id, 'Account updated by Meridian Capital Partners',
    (type === 'debit' ? 'A debit of ' : 'A credit of ') + fmt(amt, u.currency_symbol) + ' was applied to your account.' + (note ? ' Note: ' + note : '') + ' New balance: ' + fmt(balanceAfter, u.currency_symbol) + '.',
    '\ud83e\uddfe', { email: u.email });
  sendMail(u.email, 'Account transaction created',
    emailTemplate('New Transaction On Your Account',
      '<p>A <b>' + type + '</b> of <b>' + fmt(amt, u.currency_symbol) + '</b> was applied to your account' + (note ? ' \u2014 <i>' + note + '</i>' : '') + '.</p>' +
      '<p>New balance: <b style="color:#E7CE6B;">' + fmt(balanceAfter, u.currency_symbol) + '</b></p>',
      'Open Dashboard', getSetting('site_url') + '/user/dashboard.html'));
  res.json({ message: 'Transaction created', reference: ref, balance_after: balanceAfter });
});

/* ---- Admin: loans ---- */
app.get('/api/admin/loans', auth, adminOnly, (req, res) => {
  const rows = db.prepare("SELECT l.*, u.full_name, u.email, u.currency_symbol FROM loans l JOIN users u ON u.id=l.user_id WHERE u.role='user' ORDER BY l.created_at DESC LIMIT 400").all();
  res.json({ loans: rows });
});

app.post('/api/admin/loans/:id/approve', auth, adminOnly, (req, res) => {
  const l = db.prepare('SELECT l.*, u.email, u.currency_symbol FROM loans l JOIN users u ON u.id=l.user_id WHERE l.id=?').get(req.params.id);
  if (!l) return res.status(404).json({ error: 'Loan not found' });
  if (l.status !== 'pending') return res.status(400).json({ error: 'Loan already ' + l.status });
  db.prepare('UPDATE loans SET status=?, processed_at=?, processed_by=? WHERE id=?').run('approved', nowMs(), req.user.id, l.id);
  notify(l.user_id, 'Loan approved \u2705', 'Your ' + fmt(l.amount, l.currency_symbol) + ' ' + l.product + ' loan has been approved. Funds will be disbursed shortly.', '\ud83c\udfe6', { email: l.email });
  res.json({ message: 'Loan approved' });
});

app.post('/api/admin/loans/:id/decline', auth, adminOnly, (req, res) => {
  const reason = String((req.body || {}).reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'A reason is required to decline' });
  const l = db.prepare('SELECT l.*, u.email, u.currency_symbol FROM loans l JOIN users u ON u.id=l.user_id WHERE l.id=?').get(req.params.id);
  if (!l) return res.status(404).json({ error: 'Loan not found' });
  if (l.status !== 'pending') return res.status(400).json({ error: 'Loan already ' + l.status });
  db.prepare('UPDATE loans SET status=?, admin_note=?, processed_at=?, processed_by=? WHERE id=?').run('declined', reason, nowMs(), req.user.id, l.id);
  notify(l.user_id, 'Loan declined \u274c', 'Your ' + fmt(l.amount, l.currency_symbol) + ' ' + l.product + ' loan was declined. Reason: ' + reason, '\u26d4', { email: l.email });
  res.json({ message: 'Loan declined' });
});

/* ---- Admin: wallets editor ---- */
app.get('/api/admin/wallets', auth, adminOnly, (req, res) => {
  res.json({ wallets: db.prepare('SELECT * FROM wallets ORDER BY id').all() });
});
app.post('/api/admin/wallets', auth, adminOnly, (req, res) => {
  const network = String((req.body || {}).network || '').trim();
  const currency = String((req.body || {}).currency || 'USDT').trim();
  const address = String((req.body || {}).address || '').trim();
  if (!network || !address) return res.status(400).json({ error: 'Network and address are required' });
  const info = db.prepare('INSERT INTO wallets (network,currency,address,active,updated_at) VALUES (?,?,?,?,?)')
    .run(network, currency, address, 1, nowMs());
  res.json({ message: 'Wallet added', id: info.lastInsertRowid });
});
app.put('/api/admin/wallets/:id', auth, adminOnly, (req, res) => {
  const w = db.prepare('SELECT * FROM wallets WHERE id=?').get(req.params.id);
  if (!w) return res.status(404).json({ error: 'Wallet not found' });
  const b = req.body || {};
  db.prepare('UPDATE wallets SET network=?, currency=?, address=?, active=?, updated_at=? WHERE id=?')
    .run(b.network !== undefined ? String(b.network).trim() : w.network,
         b.currency !== undefined ? String(b.currency).trim() : w.currency,
         b.address !== undefined ? String(b.address).trim() : w.address,
         b.active !== undefined ? (b.active ? 1 : 0) : w.active,
         nowMs(), w.id);
  res.json({ message: 'Wallet updated' });
});
app.delete('/api/admin/wallets/:id', auth, adminOnly, (req, res) => {
  const w = db.prepare('SELECT * FROM wallets WHERE id=?').get(req.params.id);
  if (!w) return res.status(404).json({ error: 'Wallet not found' });
  db.prepare('DELETE FROM wallets WHERE id=?').run(w.id);
  res.json({ message: 'Wallet deleted' });
});

/* ---- Admin: live chat inbox ---- */
app.get('/api/admin/chats', auth, adminOnly, (req, res) => {
  const rows = db.prepare(`
    SELECT u.id user_id, u.full_name, u.email, u.country, u.currency_symbol, u.currency_code, u.last_seen, u.status,
           (SELECT body FROM messages m WHERE m.user_id = u.id ORDER BY m.created_at DESC LIMIT 1) last_message,
           (SELECT created_at FROM messages m WHERE m.user_id = u.id ORDER BY m.created_at DESC LIMIT 1) last_at,
           (SELECT COUNT(*) FROM messages m WHERE m.user_id = u.id AND m.sender='user' AND m.read=0) unread,
           (SELECT COUNT(*) FROM messages m WHERE m.user_id = u.id) total
    FROM users u WHERE u.role='user' AND EXISTS (SELECT 1 FROM messages m WHERE m.user_id = u.id)
    ORDER BY last_at DESC`).all();
  res.json({
    chats: rows.map(function (r) {
      r.online = !!(r.last_seen && (nowMs() - r.last_seen < ONLINE_WINDOW));
      r.last_seen_rel = relTime(r.last_seen || 0);
      return r;
    })
  });
});

app.get('/api/admin/chats/:userId', auth, adminOnly, (req, res) => {
  const u = db.prepare("SELECT * FROM users WHERE id=? AND role='user'").get(req.params.userId);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const msgs = db.prepare('SELECT * FROM messages WHERE user_id=? ORDER BY created_at ASC').all(u.id);
  db.prepare("UPDATE messages SET read=1 WHERE user_id=? AND sender='user'").run(u.id);
  res.json({ user: publicUser(u.id), messages: msgs });
});

app.post('/api/admin/chats/:userId/reply', auth, adminOnly, (req, res) => {
  const body = String((req.body || {}).body || '').trim();
  const u = db.prepare("SELECT * FROM users WHERE id=? AND role='user'").get(req.params.userId);
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (!body) return res.status(400).json({ error: 'Reply cannot be empty' });
  const info = db.prepare('INSERT INTO messages (user_id,sender,body,read,created_at) VALUES (?,?,?,1,?)')
    .run(u.id, 'support', body.slice(0, 2000), nowMs());
  const msg = db.prepare('SELECT * FROM messages WHERE id=?').get(info.lastInsertRowid);
  io.to('user-' + u.id).emit('chat_message', msg);
  notify(u.id, 'New reply from Customer Support', 'Support replied: "' + body.slice(0, 100) + (body.length > 100 ? '\u2026' : '') + '"', '\ud83d\udcac', { email: u.email });
  res.json({ message: msg });
});

/* ---- Admin: broadcasts ---- */
app.post('/api/admin/broadcasts', auth, adminOnly, (req, res) => {
  const subject = String((req.body || {}).subject || '').trim();
  const body = String((req.body || {}).body || '').trim();
  if (!subject || !body) return res.status(400).json({ error: 'Subject and message are required' });
  const info = db.prepare('INSERT INTO broadcasts (subject,body,created_at) VALUES (?,?,?)').run(subject, body, nowMs());
  const users = db.prepare("SELECT * FROM users WHERE role='user' AND status='active'").all();
  users.forEach(function (u) {
    notify(u.id, subject, body, '\ud83d\udce2', { email: u.email });
    sendMail(u.email, subject, emailTemplate(subject, '<p>' + body.replace(/\n/g, '<br/>') + '</p>', 'Open My Dashboard', getSetting('site_url') + '/user/dashboard.html'));
    io.to('user-' + u.id).emit('broadcast', { subject: subject, body: body });
  });
  adminAlert('broadcast', null, 'Broadcast sent to ' + users.length + ' users: "' + subject + '"');
  res.json({ message: 'Broadcast sent to ' + users.length + ' users', id: info.lastInsertRowid, sent_to: users.length });
});

app.get('/api/admin/broadcasts', auth, adminOnly, (req, res) => {
  res.json({ broadcasts: db.prepare('SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT 100').all() });
});

/* ---- Admin: alerts, outbox, settings ---- */
app.get('/api/admin/alerts', auth, adminOnly, (req, res) => {
  const rows = db.prepare('SELECT * FROM admin_alerts ORDER BY created_at DESC LIMIT 150').all();
  db.prepare('UPDATE admin_alerts SET read=1').run();
  res.json({ alerts: rows.map(function (r) { r.rel = relTime(r.created_at); return r; }) });
});

app.get('/api/admin/outbox', auth, adminOnly, (req, res) => {
  res.json({ emails: db.prepare('SELECT id,to_email,subject,status,error,created_at FROM email_outbox ORDER BY created_at DESC LIMIT 200').all() });
});

app.get('/api/admin/settings', auth, adminOnly, (req, res) => {
  res.json({ settings: {
    smtp_host: getSetting('smtp_host'), smtp_port: getSetting('smtp_port'),
    smtp_user: getSetting('smtp_user'), smtp_pass: getSetting('smtp_pass'),
    smtp_from: getSetting('smtp_from'), admin_notify_email: getSetting('admin_notify_email'),
    site_url: getSetting('site_url'), signup_bonus: getSetting('signup_bonus'),
    referral_bonus: getSetting('referral_bonus'),
    contact_phone: getSetting('contact_phone'), contact_email: getSetting('contact_email'),
    contact_address: getSetting('contact_address'), contact_hours: getSetting('contact_hours')
  }});
});

app.post('/api/admin/settings', auth, adminOnly, (req, res) => {
  const allowed = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'admin_notify_email', 'site_url', 'signup_bonus', 'referral_bonus',
    'contact_phone', 'contact_email', 'contact_address', 'contact_hours'];
  const b = req.body || {};
  allowed.forEach(function (k) { if (b[k] !== undefined) setSetting(k, b[k]); });
  res.json({ message: 'Settings saved' });
});

app.post('/api/admin/settings/test-email', auth, adminOnly, function (req, res) {
  const to = getSetting('admin_notify_email') || 'admin@meridianncapital.com';
  sendMail(to, 'SMTP test \u2014 Meridian Capital Partners',
    emailTemplate('SMTP Test', '<p>This is a test message from your Meridian Capital Partners admin dashboard. If you can read this, SMTP is working.</p>', null, null))
    .then(function (r) {
      res.json({ message: r.sent ? 'Test email sent \u2014 check your inbox' : 'Saved to outbox (SMTP not configured or failed): ' + (r.reason || ''), sent: r.sent });
    });
});

/* ---- Admin: one-click database backup download ---- */
app.get('/api/admin/backup', auth, adminOnly, (req, res) => {
  const file = backupDb('manual');
  if (!file) return res.status(500).json({ error: 'Backup failed \u2014 check server logs' });
  res.download(path.join(BACKUP_DIR, file), file, function (err) {
    if (err && !res.headersSent) res.status(500).json({ error: 'Download failed' });
  });
});

/* ---- Health ---- */
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'Meridian Capital Partners', time: nowMs() });
});

/* ---- Public site config (contact details, editable from admin) ---- */
app.get('/api/site', (req, res) => {
  res.json({
    contact: {
      phone: getSetting('contact_phone') || '+44 20 7946 0958',
      email: getSetting('contact_email') || 'hello@meridianncapital.com',
      address: getSetting('contact_address') || '1 Canada Square, Canary Wharf, London E14 5AB',
      hours: getSetting('contact_hours') || 'Mon\u2013Fri, 9:00 AM \u2013 5:30 PM'
    },
    signup_bonus: getSetting('signup_bonus'),
    referral_bonus: getSetting('referral_bonus')
  });
});

/* ================= Socket.IO ================= */
io.on('connection', function (socket) {
  let userId = null;
  let role = 'user';
  let ping = null;

  socket.on('auth', function (token) {
    try {
      const payload = jwt.verify(String(token || ''), JWT_SECRET);
      const u = db.prepare('SELECT id,role FROM users WHERE id=?').get(payload.sub);
      if (!u) return;
      userId = u.id;
      role = u.role;
      socket.join(role === 'admin' ? 'admins' : 'user-' + u.id);
      if (role === 'user') {
        db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(nowMs(), u.id);
        io.to('admins').emit('presence', { user_id: u.id, online: true });
        ping = setInterval(function () {
          db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(nowMs(), u.id);
          io.to('admins').emit('presence', { user_id: u.id, online: true });
        }, 25000);
      }
    } catch (e) { /* invalid token ignored */ }
  });

  socket.on('chat_send', function (data) {
    if (!userId || role !== 'user') return;
    const d = data || {};
    const body = String(d.body || '').trim();
    if (!body) return;
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(userId);
    const info = db.prepare('INSERT INTO messages (user_id,sender,body,created_at) VALUES (?,?,?,?)')
      .run(userId, 'user', body.slice(0, 2000), nowMs());
    const msg = db.prepare('SELECT * FROM messages WHERE id=?').get(info.lastInsertRowid);
    io.to('user-' + userId).emit('chat_message', msg);
    io.to('admins').emit('support_message', { user_id: userId, user_name: u.full_name, message: msg });
    adminAlert('support_message', userId, '\ud83d\udcac ' + u.full_name + ': ' + body.slice(0, 120));
  });

  socket.on('typing', function (data) {
    if (role === 'user') io.to('admins').emit('user_typing', { user_id: userId, typing: !!(data && data.typing) });
    if (role === 'admin' && data && data.user_id) io.to('user-' + data.user_id).emit('support_typing', {});
  });

  socket.on('disconnect', function () {
    if (ping) clearInterval(ping);
    if (userId && role === 'user') {
      db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(nowMs(), userId);
    }
  });
});

/* ================= Pages ================= */
app.get('/', function (req, res) { res.sendFile(path.join(__dirname, '..', 'index.html')); });
app.use(function (req, res, next) {
  if (req.path.indexOf('/api/') === 0) return res.status(404).json({ error: 'Not found' });
  next();
});

server.listen(PORT, function () {
  console.log('\n  Meridian Capital Partners platform running');
  console.log('  \u279c Website:      http://localhost:' + PORT);
  console.log('  \u279c User login:   http://localhost:' + PORT + '/login.html');
  console.log('  \u279c Admin:        http://localhost:' + PORT + '/admin/login.html');
  console.log('  \u279c Admin login:  ' + (process.env.ADMIN_EMAIL || 'admin@meridianncapital.com') + ' / ' + (process.env.ADMIN_PASSWORD || 'admin123') + '\n');
});
