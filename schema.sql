-- ============================================================
-- Meridian Capital Partners — Cloudflare D1 schema
-- Direct port of the better-sqlite3 schema in server/server.js
-- Apply with:  npx wrangler d1 execute meridian-capital-db --file=./schema.sql --remote
-- ============================================================

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
  first_deposit_done INTEGER NOT NULL DEFAULT 0,
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
  icon TEXT DEFAULT '🔔',
  read INTEGER NOT NULL DEFAULT 0,
  created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  sender TEXT NOT NULL,
  body TEXT NOT NULL,
  attachment TEXT DEFAULT '',
  attachment_name TEXT DEFAULT '',
  attachment_type TEXT DEFAULT '',
  read INTEGER NOT NULL DEFAULT 0,
  created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS loan_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '\ud83c\udfe6',
  min_amount REAL NOT NULL DEFAULT 1000,
  max_amount REAL NOT NULL DEFAULT 50000,
  rate TEXT DEFAULT '',
  term_min INTEGER NOT NULL DEFAULT 12,
  term_max INTEGER NOT NULL DEFAULT 84,
  description TEXT DEFAULT '',
  fee_percent REAL NOT NULL DEFAULT 5,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS deposit_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '\ud83d\udcb3',
  category TEXT DEFAULT 'Bank',
  details TEXT DEFAULT '',
  instructions TEXT DEFAULT '',
  min_amount REAL NOT NULL DEFAULT 100,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL
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

CREATE TABLE IF NOT EXISTS investment_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  tagline TEXT DEFAULT '',
  icon TEXT DEFAULT '\ud83d\udcc8',
  min_amount REAL NOT NULL DEFAULT 0,
  max_amount REAL NOT NULL DEFAULT 0,
  roi_percent REAL NOT NULL DEFAULT 0,
  duration_days INTEGER NOT NULL DEFAULT 30,
  risk TEXT DEFAULT 'Medium',
  features TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  plan_id INTEGER NOT NULL REFERENCES investment_plans(id),
  plan_name TEXT NOT NULL,
  amount REAL NOT NULL,
  roi_percent REAL NOT NULL DEFAULT 0,
  duration_days INTEGER NOT NULL DEFAULT 30,
  expected_return REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at REAL NOT NULL,
  matures_at REAL DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS message_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'motivational',
  cta_label TEXT DEFAULT 'Open My Dashboard',
  category TEXT DEFAULT 'General',
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loan_user ON loans(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_user ON messages(user_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at DESC);
