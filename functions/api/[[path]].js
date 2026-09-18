/* ============================================================
   Meridian Capital Partners — Cloudflare Pages Function
   Catch-all API handler for /api/*  (port of server/server.js)
   Runtime: Cloudflare Workers (Web Crypto + D1). No Node APIs.
   ============================================================ */

import COUNTRY_CURRENCY from '../_lib/countries.js';
import { hashPassword, verifyPassword, signJwt, verifyJwt, randomHex } from '../_lib/crypto.js';

/* Rebase rates from "per USD" to "per GBP" (base currency = GBP) */
const GBP_PER_USD = 0.79;
Object.keys(COUNTRY_CURRENCY).forEach(function (k) {
  const c = COUNTRY_CURRENCY[k];
  if (c && typeof c.rate === 'number') c.rate = +(c.rate / GBP_PER_USD).toFixed(6);
});

const SIGNUP_BONUS_GBP = 150;
const REFERRAL_BONUS_GBP = 50;
const LOAN_FEE_RATE = 0.05;
const ONLINE_WINDOW = 70000;

/* ---------------- Small helpers ---------------- */
const nowMs = () => Date.now();
const genRef = (p) => p + '-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 7).toUpperCase();
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
function currencyFor(countryCode) {
  const cc = String(countryCode || '').trim().toUpperCase();
  if (COUNTRY_CURRENCY[cc]) return COUNTRY_CURRENCY[cc];
  return { code: 'GBP', symbol: '\u00a3', rate: 1, name: 'British Pound', flag: '\ud83c\uddec\ud83c\udde7' };
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
function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
function err(message, status) { return json({ error: message }, status || 400); }
function base64ToBytes(b64) {
  const bin = atob(String(b64 || ''));
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/* ---------------- D1 helpers ---------------- */
async function first(env, sql, ...args) {
  return env.DB.prepare(sql).bind(...args).first();
}
async function all(env, sql, ...args) {
  const r = await env.DB.prepare(sql).bind(...args).all();
  return (r && r.results) ? r.results : [];
}
async function run(env, sql, ...args) {
  const r = await env.DB.prepare(sql).bind(...args).run();
  return (r && r.meta) ? r.meta : {};
}
async function getSetting(env, key) {
  const r = await first(env, 'SELECT value FROM settings WHERE key=?', key);
  return r ? r.value : '';
}
async function setSetting(env, key, value) {
  await run(env, 'INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, String(value));
}
async function adjustBalance(env, userId, delta) {
  const u = await first(env, 'SELECT balance FROM users WHERE id=?', userId);
  const newBal = +((u ? u.balance : 0) + delta).toFixed(2);
  await run(env, 'UPDATE users SET balance=? WHERE id=?', newBal, userId);
  return newBal;
}

/* ---------------- Email engine (HTTP relay) ----------------
   SMTP is not available in Workers. We always persist to the outbox
   (visible in the admin dashboard) and, if a Resend API key is set in
   settings, deliver via Resend's free HTTP API. */
async function sendMail(env, to, subject, html) {
  const meta = await run(env,
    'INSERT INTO email_outbox (to_email,subject,html,status,created_at) VALUES (?,?,?,?,?)',
    to, subject, html, 'saved', nowMs());
  const id = meta.last_row_id;
  const apiKey = (await getSetting(env, 'resend_api_key')) || env.RESEND_API_KEY || '';
  const from = (await getSetting(env, 'smtp_from')) || env.MAIL_FROM || 'Meridian Capital Partners <no-reply@meridianncapital.com>';
  if (!apiKey) return { id, sent: false, reason: 'Email relay not configured \u2014 saved to outbox' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html })
    });
    if (!res.ok) {
      const t = await res.text();
      await run(env, 'UPDATE email_outbox SET status=?, error=? WHERE id=?', 'failed', String(t).slice(0, 400), id);
      return { id, sent: false, reason: t };
    }
    await run(env, 'UPDATE email_outbox SET status=? WHERE id=?', 'sent', id);
    return { id, sent: true };
  } catch (e) {
    await run(env, 'UPDATE email_outbox SET status=?, error=? WHERE id=?', 'failed', String(e.message).slice(0, 400), id);
    return { id, sent: false, reason: e.message };
  }
}

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

/* ---------------- Notification engine (DB only; no sockets) ---------------- */
async function notify(env, userId, title, body, icon, opts) {
  opts = opts || {};
  await run(env, 'INSERT INTO notifications (user_id,title,body,icon,created_at) VALUES (?,?,?,?,?)',
    userId, title, body, icon || '\ud83d\udd14', nowMs());
  if (opts.email) {
    const siteUrl = await getSetting(env, 'site_url');
    await sendMail(env, opts.email, title, emailTemplate(title, '<p>' + body + '</p>', opts.ctaLabel || 'Open Dashboard', siteUrl + '/user/dashboard.html'));
  }
}
async function adminAlert(env, kind, userId, message) {
  await run(env, 'INSERT INTO admin_alerts (kind,user_id,message,created_at) VALUES (?,?,?,?)', kind, userId, message, nowMs());
}

/* ---------------- Auth ---------------- */
function tokenFrom(request) {
  const h = request.headers.get('authorization') || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  const url = new URL(request.url);
  return url.searchParams.get('token') || '';
}
async function authUser(env, request) {
  const payload = await verifyJwt(tokenFrom(request), env.JWT_SECRET);
  if (!payload) return null;
  const u = await first(env, 'SELECT id,role,status FROM users WHERE id=?', payload.sub);
  if (!u) return null;
  if (u.status !== 'active') return { __suspended: true };
  return u;
}

/* ---------------- Seed (idempotent) ---------------- */
let seeded = false;
async function ensureSeed(env) {
  if (seeded) return;
  const adminEmail = env.ADMIN_EMAIL || 'admin@meridianncapital.com';
  const adminPass = env.ADMIN_PASSWORD || 'admin123';
  const existing = await first(env, "SELECT id FROM users WHERE role='admin'");
  if (!existing) {
    const hash = await hashPassword(adminPass);
    await run(env, `INSERT INTO users (full_name,email,password_hash,role,country,currency_code,currency_symbol,fx_rate,balance,account_number,member_id,referral_code,kyc,sort_code,iban,bic,bank_holder,created_at,last_seen)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      'Platform Administrator', adminEmail, hash, 'admin', 'GB', 'GBP', '\u00a3', 1, 0,
      'MC-ADMIN', 'MC-AD-00001', 'MC-ADMIN', 'verified', '00-00-00', 'GB00MCUK00000000000000', 'MCUKGB2L', 'Meridian Capital Partners', nowMs(), nowMs());
  }
  const wc = await first(env, 'SELECT COUNT(*) c FROM wallets');
  if (!wc || wc.c === 0) {
    const ins = [
      ['Bitcoin (BTC)', 'BTC', 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'],
      ['Ethereum (ETH)', 'ETH', '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'],
      ['USDT (TRC20)', 'USDT', 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE'],
      ['USDT (ERC20)', 'USDT', '0xdAC17F958D2ee523a2206206994597C13D831ec7']
    ];
    for (const w of ins) {
      await run(env, 'INSERT INTO wallets (network,currency,address,active,updated_at) VALUES (?,?,?,?,?)', w[0], w[1], w[2], 1, nowMs());
    }
  }
  const pc = await first(env, 'SELECT COUNT(*) c FROM investment_plans');
  if (!pc || pc.c === 0) {
    const plans = [
      ['Starter Growth', 'Low-risk entry point for first-time investors', '\ud83c\udf31', 100, 4999, 4.5, 30, 'Low',
        'Capital protection focus|Daily profit accrual|Withdraw anytime after maturity|Email & chat support', 1],
      ['Balanced Income', 'Steady monthly income from diversified assets', '\u2696\ufe0f', 5000, 24999, 7.5, 60, 'Medium',
        'Diversified UK & EU equities|Monthly profit payouts|Priority support|Free portfolio review', 2],
      ['Premium Growth', 'Accelerated growth for experienced investors', '\ud83d\ude80', 25000, 99999, 11.0, 90, 'Medium-High',
        'Growth equities & ETFs|Quarterly performance reports|Dedicated account manager|Reinvestment bonus', 3],
      ['Elite Portfolio', 'High-yield managed portfolio with private markets', '\ud83d\udc51', 100000, 499999, 15.5, 180, 'High',
        'Private equity & venture access|Bi-annual profit distribution|Personal wealth advisor|Concierge support', 4],
      ['Institutional', 'Bespoke mandate for institutional & HNW clients', '\ud83c\udfe6', 500000, 0, 20.0, 365, 'High',
        'Custom mandate & strategy|Dedicated portfolio team|Direct line to management|Tailored reporting', 5]
    ];
    for (const p of plans) {
      await run(env, `INSERT INTO investment_plans (name,tagline,icon,min_amount,max_amount,roi_percent,duration_days,risk,features,active,sort_order,created_at,updated_at)
                      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], 1, p[9], nowMs(), nowMs());
    }
  }
  const lpc = await first(env, 'SELECT COUNT(*) c FROM loan_products');
  if (!lpc || lpc.c === 0) {
    const loans = [
      ['Personal Loan', '\ud83d\udcb3', 1000, 50000, '5.9%\u201312.5% APR', 12, 84, 'Unsecured personal lending for any purpose.', 5, 1],
      ['Mortgage Loan', '\ud83c\udfe0', 50000, 1000000, '3.2%\u20135.8% APR', 60, 360, 'Residential and buy-to-let mortgages.', 5, 2],
      ['Auto Loan', '\ud83d\ude97', 5000, 80000, '4.5%\u20139.2% APR', 12, 72, 'New and used vehicle financing.', 5, 3],
      ['Business Loan', '\ud83c\udfe2', 10000, 500000, '6.5%\u201314% APR', 12, 120, 'SME working capital and expansion.', 5, 4],
      ['Student Loan', '\ud83c\udf93', 2000, 40000, '3.9%\u20137.5% APR', 60, 180, 'Deferred repayment education financing.', 5, 5],
      ['Debt Consolidation', '\ud83d\udce6', 3000, 75000, '5.5%\u201313% APR', 12, 96, 'Combine debts into one monthly payment.', 5, 6],
      ['Home Equity Loan', '\ud83c\udfe1', 10000, 300000, '4.8%\u20138.5% APR', 60, 300, 'Secured lending against your property.', 5, 7],
      ['Bridge Loan', '\ud83c\udf09', 25000, 500000, '8%\u201315% APR', 6, 18, 'Short-term property bridging finance.', 5, 8],
      ['Equipment Financing', '\ud83d\udd27', 5000, 250000, '5.5%\u201311% APR', 12, 84, 'Machinery and equipment purchase.', 5, 9],
      ['Credit Line / Revolving', '\ud83d\udcb0', 2000, 60000, '7%\u201316% APR', 6, 60, 'Flexible revolving credit facility.', 5, 10],
      ['Green Energy Loan', '\ud83c\udf31', 3000, 100000, '3.5%\u20137% APR', 12, 120, 'Solar, heat pump and eco upgrades.', 5, 11],
      ['Medical Loan', '\u2695\ufe0f', 1000, 50000, '6%\u201312% APR', 12, 72, 'Healthcare and treatment financing.', 5, 12]
    ];
    for (const l of loans) {
      await run(env, `INSERT INTO loan_products (name,icon,min_amount,max_amount,rate,term_min,term_max,description,fee_percent,active,sort_order,created_at,updated_at)
                      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        l[0], l[1], l[2], l[3], l[4], l[5], l[6], l[7], l[8], 1, l[9], nowMs(), nowMs());
    }
  }
  const dmc = await first(env, 'SELECT COUNT(*) c FROM deposit_methods');
  if (!dmc || dmc.c === 0) {
    const methods = [
      ['Faster Payments (UK Bank Transfer)', '\ud83c\uddec\ud83c\udde7', 'Bank', 'Sort Code / Account Number / IBAN', 'Send a UK Faster Payments transfer to the account details shown. Include your reference.', 100, 1],
      ['SEPA / International Bank Transfer', '\ud83c\udf0d', 'Bank', 'IBAN / BIC / SWIFT', 'Send an international wire to the IBAN shown. Allow 1\u20133 business days.', 100, 2],
      ['Debit / Credit Card', '\ud83d\udcb3', 'Card', 'Visa / Mastercard / Amex', 'Pay instantly by card. A 1.5% processing fee may apply.', 100, 3],
      ['Bitcoin (BTC)', '\u20bf', 'Crypto', 'On-chain BTC address', 'Send BTC to the address shown. Include your reference in the memo if supported.', 50, 4],
      ['Ethereum (ETH)', '\u039e', 'Crypto', 'ERC-20 address', 'Send ETH to the address shown. Only send ETH or ERC-20 tokens.', 50, 5],
      ['Tether (USDT \u2014 TRC20)', '\ud83d\udfe2', 'Crypto', 'TRON (TRC20) address', 'Send USDT on the TRON network. Do not send other tokens to this address.', 50, 6],
      ['Tether (USDT \u2014 ERC20)', '\ud83d\udfe3', 'Crypto', 'Ethereum (ERC20) address', 'Send USDT on the Ethereum network. Do not send other tokens to this address.', 50, 7],
      ['USDC (ERC20)', '\ud83d\udd35', 'Crypto', 'Ethereum (ERC20) address', 'Send USDC on the Ethereum network.', 50, 8],
      ['PayPal', '\ud83d\udc9a', 'Wallet', 'PayPal email', 'Send to our PayPal address and include your reference.', 100, 9],
      ['Wise (TransferWise)', '\ud83d\udfe9', 'Wallet', 'Wise account details', 'Send via Wise for low-cost international transfers.', 100, 10],
      ['Revolut', '\ud83d\udd0b', 'Wallet', 'Revolut tag / account', 'Send via Revolut and include your reference.', 100, 11],
      ['Skrill', '\ud83d\udcb8', 'Wallet', 'Skrill email', 'Send to our Skrill address.', 100, 12],
      ['Neteller', '\ud83d\udcb5', 'Wallet', 'Neteller account', 'Send to our Neteller account.', 100, 13],
      ['Paysafecard / Voucher', '\ud83c\udfab', 'Voucher', 'Voucher code', 'Purchase a voucher and submit the code.', 50, 14],
      ['Cash / In-Person Deposit', '\ud83d\udcb5', 'Cash', 'By arrangement', 'Contact support to arrange an in-person deposit.', 100, 15]
    ];
    for (const m of methods) {
      await run(env, `INSERT INTO deposit_methods (name,icon,category,details,instructions,min_amount,active,sort_order,created_at,updated_at)
                      VALUES (?,?,?,?,?,?,?,?,?,?)`,
        m[0], m[1], m[2], m[3], m[4], m[5], 1, m[6], nowMs(), nowMs());
    }
  }
  const mtc = await first(env, 'SELECT COUNT(*) c FROM message_templates');
  if (!mtc || mtc.c === 0) {
    const tpl = [
      ['\ud83c\udf81 Welcome & First Steps', 'Welcome to Meridian Capital Partners! We are delighted to have you with us. Your account is ready \u2014 fund it today and start building a portfolio designed around your goals. Our team is here 24/7 whenever you need a hand.', 'motivational', 'Open My Dashboard', 'Welcome', 1],
      ['\ud83d\udcc8 The Power of Consistency', 'Wealth is not built in a single day \u2014 it is built by showing up consistently. Small, regular investments compound into remarkable results over time. Stay the course, and let time do the heavy lifting for you.', 'motivational', 'View My Portfolio', 'Motivational', 2],
      ['\ud83c\udf1f Your Goals Are Within Reach', 'Every great achievement began with a single decision to start. You have already taken that step. Keep your eyes on your goals, review your plan regularly, and remember \u2014 progress, however small, is still progress.', 'motivational', 'Review My Plan', 'Motivational', 3],
      ['\ud83d\ude80 Unlock Your Next Investment', 'Ready to grow further? Explore our range of investment plans built for every ambition \u2014 from steady income to high-growth portfolios. Choose the plan that fits your goals and put your money to work today.', 'promotional', 'Explore Plans', 'Promotional', 4],
      ['\ud83d\udcb0 Refer a Friend, Earn \u00a350', 'Know someone who could benefit from Meridian Capital Partners? Invite them using your personal referral link and earn a \u00a350 reward for every friend who joins and is approved. There is no limit to how many you can refer.', 'promotional', 'Get My Referral Link', 'Promotional', 5],
      ['\ud83d\udd10 Keep Your Account Secure', 'Your security is our priority. Never share your password with anyone \u2014 not even someone claiming to be from Meridian Capital. We will never ask for your password or request funds to a personal account. Stay vigilant and report anything suspicious to support.', 'announcement', 'Review Security', 'Security', 6],
      ['\ud83d\udce3 New Deposit Methods Available', 'Great news \u2014 we have expanded our funding options. You can now deposit via bank transfer, card, crypto and a wide range of digital wallets. Choose whichever method suits you best and fund your account in minutes.', 'announcement', 'Make a Deposit', 'Announcement', 7],
      ['\ud83c\udfaf A Little Encouragement', 'Whatever your financial goal \u2014 a home, a holiday, a comfortable retirement \u2014 you are one step closer today than you were yesterday. Keep going. Your future self will thank you for the discipline you show now.', 'motivational', 'Open My Dashboard', 'Motivational', 8],
      ['\u2728 Exclusive Bonus Opportunity', 'As a valued client, we would like to reward your loyalty. Top up your account this month and take advantage of our exclusive bonus opportunity. Terms apply \u2014 contact support for full details.', 'promotional', 'Claim My Bonus', 'Promotional', 9],
      ['\ud83d\udca1 Smart Investing Tip', 'Diversification is one of the most powerful tools in investing. Spreading your capital across different asset classes can help reduce risk while keeping your growth potential intact. Explore our diversified plans today.', 'motivational', 'See Diversified Plans', 'Motivational', 10]
    ];
    for (const t of tpl) {
      await run(env, `INSERT INTO message_templates (title,body,kind,cta_label,category,active,sort_order,created_at,updated_at)
                      VALUES (?,?,?,?,?,?,?,?,?)`,
        t[0], t[1], t[2], t[3], t[4], 1, t[5], nowMs(), nowMs());
    }
  }
  const defaults = {
    smtp_host: '', smtp_port: '587', smtp_user: '', smtp_pass: '',
    smtp_from: 'Meridian Capital Partners <no-reply@meridianncapital.com>',
    admin_notify_email: adminEmail,
    site_url: 'https://meridianncapital.com',
    signup_bonus: String(SIGNUP_BONUS_GBP),
    referral_bonus: String(REFERRAL_BONUS_GBP),
    contact_name: 'Ewelina Qachar',
    contact_phone: '0120438957',
    contact_mobile: '0120438957',
    contact_email: 'hello@meridianncapital.com',
    contact_address: '356 Lever Edge Lane, Bolton, Greater Manchester, BL3 3BQ',
    contact_hours: 'Mon\u2013Fri, 9:00 AM \u2013 5:30 PM',
    loan_fee_percent: '5',
    crypto_first: '1',
    crypto_first_reason: 'For your first deposit we accept cryptocurrency only. Crypto deposits are settled on-chain, which means they cannot be reversed, charged back or debited without your private key \u2014 protecting you from the card fraud, account hacking and unauthorised debits that affect traditional bank and card payments. Once your first deposit is confirmed, every other funding method (bank transfer, card, wallets and more) unlocks automatically.',
    resend_api_key: ''
  };
  for (const k of Object.keys(defaults)) {
    const r = await first(env, 'SELECT key FROM settings WHERE key=?', k);
    if (!r) await run(env, 'INSERT INTO settings (key,value) VALUES (?,?)', k, defaults[k]);
  }
  seeded = true;
}

/* ---------------- publicUser ---------------- */
async function publicUser(env, id) {
  const u = await first(env, 'SELECT * FROM users WHERE id=?', id);
  if (!u) return null;
  const un = await first(env, 'SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read=0', id);
  const um = await first(env, "SELECT COUNT(*) c FROM messages WHERE user_id=? AND sender='support' AND read=0", id);
  const cur = currencyFor(u.country);
  return {
    id: u.id, name: u.full_name, full_name: u.full_name, email: u.email, role: u.role, country: u.country,
    currency: u.currency_code, currency_code: u.currency_code, symbol: u.currency_symbol, currency_symbol: u.currency_symbol,
    fx_rate: u.fx_rate, flag: cur.flag, currency_name: cur.name,
    balance: u.balance, phone: u.phone, status: u.status, kyc: u.kyc,
    accountNumber: u.account_number, memberId: u.member_id, referralCode: u.referral_code, referredBy: u.referred_by,
    bank: { holder: u.bank_holder, sortCode: u.sort_code, accountNumber: u.account_number, iban: u.iban, bic: u.bic },
    created_at: u.created_at, createdAt: u.created_at,
    first_deposit_done: u.first_deposit_done ? 1 : 0,
    firstDepositDone: u.first_deposit_done ? 1 : 0,
    online: !!(u.last_seen && (nowMs() - u.last_seen < ONLINE_WINDOW)), last_seen: u.last_seen,
    unread_notifications: un ? un.c : 0, unread_messages: um ? um.c : 0
  };
}

/* ---------------- Rules & Regulations ---------------- */
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

/* ============================================================
   Router
   ============================================================ */
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  let path = url.pathname.replace(/^\/api/, '');
  if (path === '') path = '/';

  try {
    await ensureSeed(env);
    return await route(env, request, method, path, url);
  } catch (e) {
    return json({ error: 'Server error: ' + (e && e.message ? e.message : 'unknown') }, 500);
  }
}

async function readBody(request) {
  try { return await request.json(); } catch (e) { return {}; }
}

async function route(env, request, method, path, url) {
  const seg = path.split('/').filter(Boolean); /* e.g. ['admin','users','5','status'] */

  /* ---------- Public ---------- */
  if (method === 'GET' && path === '/health') {
    return json({ ok: true, service: 'Meridian Capital Partners', time: nowMs() });
  }
  if (method === 'GET' && path === '/site') {
    return json({
      contact: {
        name: await getSetting(env, 'contact_name') || 'Ewelina Qachar',
        phone: await getSetting(env, 'contact_phone') || '0120438957',
        mobile: await getSetting(env, 'contact_mobile') || '0120438957',
        email: await getSetting(env, 'contact_email') || 'hello@meridianncapital.com',
        address: await getSetting(env, 'contact_address') || '356 Lever Edge Lane, Bolton, Greater Manchester, BL3 3BQ',
        hours: await getSetting(env, 'contact_hours') || 'Mon\u2013Fri, 9:00 AM \u2013 5:30 PM'
      },
      signup_bonus: await getSetting(env, 'signup_bonus'),
      referral_bonus: await getSetting(env, 'referral_bonus'),
      loan_fee_percent: await getSetting(env, 'loan_fee_percent') || '5',
      crypto_first: (await getSetting(env, 'crypto_first')) !== '0',
      crypto_first_reason: await getSetting(env, 'crypto_first_reason') || ''
    });
  }
  if (method === 'GET' && path === '/loan-products') {
    return json({ products: await all(env, 'SELECT * FROM loan_products WHERE active=1 ORDER BY sort_order, id') });
  }
  if (method === 'GET' && path === '/deposit-methods') {
    return json({ methods: await all(env, 'SELECT * FROM deposit_methods WHERE active=1 ORDER BY sort_order, id') });
  }
  if (method === 'GET' && path === '/rules') return json({ rules: RULES });
  if (method === 'GET' && path === '/plans') {
    return json({ plans: await all(env, 'SELECT * FROM investment_plans WHERE active=1 ORDER BY sort_order, id') });
  }
  if (method === 'GET' && path === '/wallets') {
    return json({ wallets: await all(env, 'SELECT id,network,currency,address,active FROM wallets WHERE active=1 ORDER BY id') });
  }

  if (method === 'POST' && path === '/leads') {
    const b = await readBody(request);
    const name = String(b.name || '').trim();
    const email = String(b.email || '').trim().toLowerCase();
    const interest = String(b.interest || '').trim();
    const message = String(b.message || '').trim().slice(0, 1000);
    if (!name || !email) return err('Name and email are required');
    await run(env, 'INSERT INTO admin_alerts (kind,user_id,message,created_at) VALUES (?,?,?,?)',
      'lead', null, 'New enquiry from ' + name + ' (' + email + ') \u2014 ' + interest + (message ? ': ' + message.slice(0, 200) : ''), nowMs());
    const adminEmail = await getSetting(env, 'admin_notify_email') || 'admin@meridianncapital.com';
    const siteUrl = await getSetting(env, 'site_url');
    await sendMail(env, adminEmail, 'New website enquiry \u2014 ' + name,
      emailTemplate('New Website Enquiry',
        '<p><b>' + name + '</b> (' + email + ') is interested in <b>' + interest + '</b>.</p>' +
        (message ? '<div style="background:rgba(255,255,255,.06);border-radius:10px;padding:16px;color:#E7CE6B;font-style:italic;">"' + message + '"</div>' : '') +
        '<p>Reach out to them from your admin dashboard.</p>',
        'Open Admin Dashboard', siteUrl + '/admin/dashboard.html'));
    return json({ message: 'Thank you \u2014 our advisory team will reach out within one business day.' });
  }

  if (method === 'POST' && path === '/signup') {
    const b = await readBody(request);
    const full_name = String(b.full_name || '').trim();
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    const country = String(b.country || '').trim().toUpperCase();
    const phone = String(b.phone || '').trim();
    const ref = String(b.ref || b.referred_by || '').trim().toUpperCase();
    if (!full_name || !email || !password || !country) return err('All fields are required');
    if (password.length < 6) return err('Password must be at least 6 characters');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err('Invalid email address');
    if (await first(env, 'SELECT id FROM users WHERE email=?', email)) return err('An account with this email already exists', 409);

    const cur = currencyFor(country);
    const bonusGBP = Number(await getSetting(env, 'signup_bonus') || SIGNUP_BONUS_GBP);
    const bonusAmt = +(bonusGBP * cur.rate).toFixed(2);
    const accountNumber = genAccountNumber();
    const memberId = genMemberId();
    const referralCode = genReferralCode();
    const sortCode = genSortCode();
    const bankAcct = genBankAccount();
    const iban = genIBAN(sortCode, bankAcct);
    const bic = 'MCUKGB2L';
    const hash = await hashPassword(password);

    const info = await run(env, `INSERT INTO users (full_name,email,password_hash,role,country,currency_code,currency_symbol,fx_rate,balance,bonus_received,phone,account_number,member_id,referral_code,referred_by,kyc,sort_code,iban,bic,bank_holder,created_at,last_seen)
                           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      full_name, email, hash, 'user', country, cur.code, cur.symbol, cur.rate, bonusAmt, 1, phone,
      accountNumber, memberId, referralCode, ref, 'pending', sortCode, iban, bic, full_name, nowMs(), nowMs());
    const uid = info.last_row_id;

    await run(env, `INSERT INTO transactions (user_id,type,status,amount,reference,method,note,balance_after,created_at)
              VALUES (?,?,?,?,?,?,?,?,?)`,
      uid, 'bonus', 'approved', bonusAmt, genRef('BON'), 'system', 'Welcome bonus \u2014 \u00a3' + bonusGBP + ' credited on signup', bonusAmt, nowMs());

    if (ref) {
      const referrer = await first(env, "SELECT * FROM users WHERE referral_code=? AND role='user'", ref);
      if (referrer) {
        const refBonus = +(Number(await getSetting(env, 'referral_bonus') || REFERRAL_BONUS_GBP) * referrer.fx_rate).toFixed(2);
        const newBal = +(referrer.balance + refBonus).toFixed(2);
        await run(env, 'UPDATE users SET balance=? WHERE id=?', newBal, referrer.id);
        await run(env, `INSERT INTO transactions (user_id,type,status,amount,reference,method,note,balance_after,created_at)
                  VALUES (?,?,?,?,?,?,?,?,?)`,
          referrer.id, 'referral', 'approved', refBonus, genRef('REF'), 'referral', 'Referral reward \u2014 ' + full_name + ' joined', newBal, nowMs());
        await notify(env, referrer.id, 'Referral reward earned \ud83c\udf81', 'You earned ' + fmt(refBonus, referrer.currency_symbol) + ' because ' + full_name + ' joined with your code.', '\ud83c\udf81', { email: referrer.email });
      }
    }

    await notify(env, uid, 'Welcome to Meridian Capital Partners \ud83c\udf89',
      'Your account is ready, ' + full_name.split(' ')[0] + '. We have credited a welcome bonus of ' + fmt(bonusAmt, cur.symbol) + ' to your balance.',
      '\ud83c\udf81', { email: email, ctaLabel: 'View My Dashboard' });
    await adminAlert(env, 'signup', uid, 'New user registered: ' + full_name + ' (' + email + ') \u2014 ' + cur.flag + ' ' + cur.code);
    const siteUrl = await getSetting(env, 'site_url');
    /* Notify admin by email of the new signup */
    const adminEmail = (await getSetting(env, 'admin_notify_email')) || env.ADMIN_EMAIL || 'admin@meridianncapital.com';
    await sendMail(env, adminEmail, 'New signup \u2014 ' + full_name,
      emailTemplate('New Client Registered \ud83c\udf89',
        '<p>A new client has just signed up on Meridian Capital Partners:</p>' +
        '<table style="width:100%;border-collapse:collapse;margin:10px 0;">' +
        '<tr><td style="padding:6px 0;color:#9db0c4;">Name</td><td style="padding:6px 0;color:#fff;"><b>' + full_name + '</b></td></tr>' +
        '<tr><td style="padding:6px 0;color:#9db0c4;">Email</td><td style="padding:6px 0;color:#fff;">' + email + '</td></tr>' +
        '<tr><td style="padding:6px 0;color:#9db0c4;">Country</td><td style="padding:6px 0;color:#fff;">' + cur.flag + ' ' + country + '</td></tr>' +
        '<tr><td style="padding:6px 0;color:#9db0c4;">Currency</td><td style="padding:6px 0;color:#fff;">' + cur.code + '</td></tr>' +
        '<tr><td style="padding:6px 0;color:#9db0c4;">Member ID</td><td style="padding:6px 0;color:#fff;">' + memberId + '</td></tr>' +
        '<tr><td style="padding:6px 0;color:#9db0c4;">Welcome bonus</td><td style="padding:6px 0;color:#E7CE6B;"><b>' + fmt(bonusAmt, cur.symbol) + '</b></td></tr>' +
        '</table>',
        'Open Admin Dashboard', siteUrl + '/admin/dashboard.html'));
    await sendMail(env, email, 'Welcome to Meridian Capital Partners',
      emailTemplate('Welcome, ' + full_name.split(' ')[0] + ' \ud83d\udc4b',
        '<p>Dear ' + full_name + ',</p>' +
        '<p>Your Meridian Capital Partners account has been created and your ' + cur.code + ' dashboard is ready. Here are your official account details:</p>' +
        '<div style="background:rgba(201,162,39,.12);border:1px solid rgba(201,162,39,.4);border-radius:12px;padding:20px;margin:18px 0;">' +
        '<div style="color:#E7CE6B;font-family:Georgia,serif;font-size:15px;font-weight:700;letter-spacing:1px;margin-bottom:12px;">YOUR OFFICIAL ACCOUNT DETAILS</div>' +
        '<table style="width:100%;border-collapse:collapse;">' +
        '<tr><td style="padding:6px 0;color:#9db0c4;">Account Name</td><td style="padding:6px 0;color:#fff;text-align:right;"><b>' + full_name + '</b></td></tr>' +
        '<tr><td style="padding:6px 0;color:#9db0c4;">Account Number</td><td style="padding:6px 0;color:#fff;text-align:right;"><b>' + accountNumber + '</b></td></tr>' +
        '<tr><td style="padding:6px 0;color:#9db0c4;">Client / Member ID</td><td style="padding:6px 0;color:#fff;text-align:right;"><b>' + memberId + '</b></td></tr>' +
        '<tr><td style="padding:6px 0;color:#9db0c4;">Sort Code</td><td style="padding:6px 0;color:#fff;text-align:right;"><b>' + sortCode + '</b></td></tr>' +
        '<tr><td style="padding:6px 0;color:#9db0c4;">IBAN</td><td style="padding:6px 0;color:#fff;text-align:right;"><b>' + iban + '</b></td></tr>' +
        '<tr><td style="padding:6px 0;color:#9db0c4;">BIC / SWIFT</td><td style="padding:6px 0;color:#fff;text-align:right;"><b>' + bic + '</b></td></tr>' +
        '</table></div>' +
        '<div style="background:linear-gradient(135deg,#0E4C92,#0A1F33);border-radius:12px;padding:20px;text-align:center;margin:18px 0;">' +
        '<div style="color:#E7CE6B;font-family:Georgia,serif;font-size:26px;font-weight:700;">' + fmt(bonusAmt, cur.symbol) + '</div>' +
        '<div style="color:#fff;font-size:13px;letter-spacing:2px;text-transform:uppercase;margin-top:4px;">Sign-up Bonus \u2014 Credited To Your Account</div>' +
        '</div>' +
        '<p>You can now fund your investment account, view live wallets and reach our support team 24/7 from your dashboard.</p>',
        'Open My Dashboard', siteUrl + '/user/dashboard.html'));

    const token = await signJwt({ sub: uid }, env.JWT_SECRET, 604800);
    return json({ token, user: await publicUser(env, uid) });
  }

  if (method === 'POST' && path === '/login') {
    const b = await readBody(request);
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    const u = await first(env, 'SELECT * FROM users WHERE email=?', email);
    if (!u || !(await verifyPassword(password, u.password_hash))) return err('Invalid email or password', 401);
    if (u.status !== 'active') return err('Account suspended. Contact support.', 403);
    await run(env, 'UPDATE users SET last_seen=? WHERE id=?', nowMs(), u.id);
    await notify(env, u.id, 'New sign-in detected \ud83d\udd10',
      'A successful login to your account was recorded on ' + new Date().toLocaleString('en-GB') + '. If this was not you, reset your password and contact support.',
      '\ud83d\udd10', { email: u.email });
    const token = await signJwt({ sub: u.id }, env.JWT_SECRET, 604800);
    return json({ token, user: await publicUser(env, u.id) });
  }

  if (method === 'POST' && path === '/forgot-password') {
    const b = await readBody(request);
    const email = String(b.email || '').trim().toLowerCase();
    const u = await first(env, 'SELECT * FROM users WHERE email=?', email);
    const genericMsg = 'If an account exists for this email, a reset link has been sent.';
    if (!u) return json({ message: genericMsg });
    const tok = randomHex(24);
    await run(env, 'UPDATE users SET reset_token=?, reset_expires=? WHERE id=?', tok, nowMs() + 30 * 60 * 1000, u.id);
    const siteUrl = await getSetting(env, 'site_url');
    const link = siteUrl + '/reset.html?token=' + tok;
    await sendMail(env, u.email, 'Reset your Meridian Capital Partners password',
      emailTemplate('Password Reset Requested',
        '<p>We received a request to reset the password for your account (' + u.email + ').</p>' +
        '<p>This secure link is valid for <b>30 minutes</b>:</p>' +
        '<p style="word-break:break-all;"><a href="' + link + '" style="color:#E7CE6B;">' + link + '</a></p>',
        'Reset My Password', link));
    await notify(env, u.id, 'Password reset requested', 'A password reset was requested for your account. Check your email for the secure link (valid 30 minutes).', '\ud83d\udd11', { email: u.email });
    await adminAlert(env, 'reset', u.id, 'Password reset requested for ' + u.email);
    return json({ message: genericMsg });
  }

  if (method === 'POST' && path === '/reset-password') {
    const b = await readBody(request);
    const token = String(b.token || '');
    const password = String(b.password || '');
    if (!token || password.length < 6) return err('A valid link and a password of 6+ characters are required');
    const u = await first(env, 'SELECT * FROM users WHERE reset_token=?', token);
    if (!u || u.reset_expires < nowMs()) return err('This reset link is invalid or has expired. Request a new one.');
    await run(env, 'UPDATE users SET password_hash=?, reset_token=NULL, reset_expires=NULL WHERE id=?', await hashPassword(password), u.id);
    await notify(env, u.id, 'Password changed successfully', 'Your login password was reset successfully. If you did not perform this action, contact support immediately.', '\u2705', { email: u.email });
    await adminAlert(env, 'reset', u.id, 'Password reset completed for ' + u.email);
    return json({ message: 'Password updated. You can now log in with your new password.' });
  }

  /* ---------- Authenticated user routes ---------- */
  const me = await authUser(env, request);
  if (me && me.__suspended) return err('Account suspended. Contact support.', 403);

  if (method === 'POST' && path === '/change-password') {
    if (!me) return err('Not authenticated', 401);
    const b = await readBody(request);
    const current = String(b.current || '');
    const next = String(b.next || '');
    const u = await first(env, 'SELECT * FROM users WHERE id=?', me.id);
    if (!(await verifyPassword(current, u.password_hash))) return err('Current password is incorrect');
    if (next.length < 6) return err('New password must be at least 6 characters');
    await run(env, 'UPDATE users SET password_hash=? WHERE id=?', await hashPassword(next), u.id);
    await notify(env, u.id, 'Login details updated', 'Your password was changed from your dashboard settings. If this was not you, contact support immediately.', '\ud83d\udee1\ufe0f', { email: u.email });
    return json({ message: 'Password updated successfully' });
  }

  if (method === 'GET' && path === '/me') {
    if (!me) return err('Not authenticated', 401);
    await run(env, 'UPDATE users SET last_seen=? WHERE id=?', nowMs(), me.id);
    return json({ user: await publicUser(env, me.id) });
  }

  if (method === 'GET' && path === '/transactions') {
    if (!me) return err('Not authenticated', 401);
    const rows = await all(env, 'SELECT * FROM transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 200', me.id);
    const u = await first(env, 'SELECT currency_symbol FROM users WHERE id=?', me.id);
    return json({ transactions: rows, symbol: u ? u.currency_symbol : '\u00a3' });
  }

  if (method === 'POST' && seg[0] === 'transactions' && seg[2] === 'cancel') {
    if (!me) return err('Not authenticated', 401);
    const id = seg[1];
    const t = await first(env, 'SELECT * FROM transactions WHERE id=? AND user_id=?', id, me.id);
    if (!t) return err('Transaction not found', 404);
    if (t.status !== 'pending') return err('Only pending requests can be cancelled');
    if (t.type !== 'withdrawal' && t.type !== 'deposit') return err('This request cannot be cancelled');
    const u = await first(env, 'SELECT * FROM users WHERE id=?', me.id);
    let balanceAfter = u.balance;
    if (t.type === 'withdrawal') balanceAfter = await adjustBalance(env, u.id, t.amount);
    await run(env, 'UPDATE transactions SET status=?, admin_note=?, processed_at=? WHERE id=?', 'cancelled', 'Cancelled by client', nowMs(), t.id);
    await notify(env, u.id, 'Request cancelled', 'Your ' + t.type + ' of ' + fmt(t.amount, u.currency_symbol) + ' (ref ' + t.reference + ') was cancelled at your request.' + (t.type === 'withdrawal' ? ' The held amount has been returned to your balance.' : ''), '\u21a9\ufe0f', { email: u.email });
    const siteUrl = await getSetting(env, 'site_url');
    await sendMail(env, u.email, 'Request cancelled',
      emailTemplate('Request Cancelled',
        '<p>Your ' + t.type + ' of <b>' + fmt(t.amount, u.currency_symbol) + '</b> (ref ' + t.reference + ') was cancelled at your request.</p>' +
        (t.type === 'withdrawal' ? '<p>The held amount has been returned to your available balance.</p>' : '') +
        '<p>Current balance: <b style="color:#E7CE6B;">' + fmt(balanceAfter, u.currency_symbol) + '</b></p>',
        'Open Dashboard', siteUrl + '/user/dashboard.html'));
    await adminAlert(env, 'cancel', u.id, 'Client ' + u.full_name + ' cancelled their ' + t.type + ' of ' + fmt(t.amount, u.currency_symbol) + ' \u2014 ref ' + t.reference);
    return json({ message: 'Request cancelled.', balance_after: balanceAfter });
  }

  if (method === 'POST' && path === '/deposits') {
    if (!me) return err('Not authenticated', 401);
    if (me.role === 'admin') return err('Admin accounts do not make deposits');
    const b = await readBody(request);
    const amt = Number(b.amount);
    const method_ = String(b.method || b.network || '').trim();
    const tx_proof = String(b.tx_proof || '').slice(0, 500);
    if (!amt || amt <= 0) return err('Enter a valid amount');
    const u = await first(env, 'SELECT * FROM users WHERE id=?', me.id);
    /* Crypto-first gate: until the first deposit is approved, only crypto is allowed */
    const cryptoFirst = (await getSetting(env, 'crypto_first')) !== '0';
    if (cryptoFirst && !u.first_deposit_done) {
      const isCrypto = /crypto|bitcoin|btc|ethereum|eth|usdt|usdc|tether|coin|on-chain|onchain/i.test(method_);
      if (!isCrypto) return err('Your first deposit must be made in cryptocurrency. Once it is confirmed, all other deposit methods unlock automatically.');
    }
    const ref = genRef('DEP');
    await run(env, `INSERT INTO transactions (user_id,type,status,amount,reference,method,note,created_at)
              VALUES (?,?,?,?,?,?,?,?)`, u.id, 'deposit', 'pending', +amt.toFixed(2), ref, method_, tx_proof, nowMs());
    await notify(env, u.id, 'Deposit request submitted', 'Your deposit of ' + fmt(amt, u.currency_symbol) + ' via ' + method_ + ' is pending admin confirmation. Reference: ' + ref, '\ud83d\udce5', { email: u.email });
    await adminAlert(env, 'deposit', u.id, 'New deposit request: ' + fmt(amt, u.currency_symbol) + ' (' + method_ + ') from ' + u.full_name + ' \u2014 ref ' + ref);
    const siteUrl = await getSetting(env, 'site_url');
    await sendMail(env, u.email, 'Deposit request received',
      emailTemplate('Deposit Request Received',
        '<p>We received your deposit request of <b>' + fmt(amt, u.currency_symbol) + '</b> via ' + method_ + '.</p>' +
        '<p>Reference: <b>' + ref + '</b>. Status: <b style="color:#E7CE6B;">Pending confirmation</b>. You will be notified the moment it is processed.</p>',
        'View Transaction', siteUrl + '/user/dashboard.html'));
    return json({ message: 'Deposit request submitted. You will be notified once processed.', reference: ref });
  }

  if (method === 'POST' && path === '/withdrawals') {
    if (!me) return err('Not authenticated', 401);
    if (me.role === 'admin') return err('Admin accounts do not make withdrawals');
    const b = await readBody(request);
    const amt = Number(b.amount);
    const method_ = String(b.method || b.network || '').trim();
    const dest = String(b.destination || b.wallet_address || '').trim();
    const note = String(b.note || '').slice(0, 500);
    if (!amt || amt <= 0) return err('Enter a valid amount');
    const u = await first(env, 'SELECT * FROM users WHERE id=?', me.id);
    if (amt > u.balance) return err('Insufficient balance. Available: ' + fmt(u.balance, u.currency_symbol));
    if (dest.length < 6) return err('Provide your payout destination details');
    const newBal = +(u.balance - amt).toFixed(2);
    const ref = genRef('WDR');
    await run(env, 'UPDATE users SET balance=? WHERE id=?', newBal, u.id);
    await run(env, `INSERT INTO transactions (user_id,type,status,amount,reference,method,wallet_address,note,balance_after,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?)`, u.id, 'withdrawal', 'pending', +amt.toFixed(2), ref, method_, dest, note, newBal, nowMs());
    await notify(env, u.id, 'Withdrawal request submitted', 'Your withdrawal of ' + fmt(amt, u.currency_symbol) + ' to ' + method_ + ' is pending admin approval. The amount is held from your balance. Reference: ' + ref, '\ud83d\udce4', { email: u.email });
    await adminAlert(env, 'withdrawal', u.id, 'New withdrawal request: ' + fmt(amt, u.currency_symbol) + ' \u2192 ' + method_ + ' from ' + u.full_name + ' \u2014 ref ' + ref);
    const siteUrl = await getSetting(env, 'site_url');
    await sendMail(env, u.email, 'Withdrawal request received',
      emailTemplate('Withdrawal Request Received',
        '<p>We received your withdrawal request of <b>' + fmt(amt, u.currency_symbol) + '</b> via ' + method_ + '.</p>' +
        '<p>The amount has been held from your balance pending approval. Reference: <b>' + ref + '</b>.</p>',
        'View Transaction', siteUrl + '/user/dashboard.html'));
    return json({ message: 'Withdrawal request submitted. Funds are held pending approval.', reference: ref, new_balance: newBal });
  }

  if (method === 'GET' && path === '/loans') {
    if (!me) return err('Not authenticated', 401);
    return json({ loans: await all(env, 'SELECT * FROM loans WHERE user_id=? ORDER BY created_at DESC', me.id) });
  }
  if (method === 'POST' && path === '/loans') {
    if (!me) return err('Not authenticated', 401);
    if (me.role === 'admin') return err('Admin accounts do not apply for loans');
    const b = await readBody(request);
    const product = String(b.product || '').trim();
    const amount = Number(b.amount);
    const term = parseInt(b.term, 10) || 36;
    const purpose = String(b.purpose || '').slice(0, 300);
    let rate = String(b.rate || '').slice(0, 40);
    if (!product) return err('Choose a loan product');
    /* Look up the product to validate limits and derive the fee */
    const lp = await first(env, 'SELECT * FROM loan_products WHERE name=? AND active=1', product);
    const feePct = lp ? Number(lp.fee_percent) : Number(await getSetting(env, 'loan_fee_percent') || 5);
    if (lp) {
      if (amount < lp.min_amount) return err('Minimum for ' + lp.name + ' is ' + fmt(lp.min_amount, '\u00a3'));
      if (lp.max_amount && amount > lp.max_amount) return err('Maximum for ' + lp.name + ' is ' + fmt(lp.max_amount, '\u00a3'));
      if (!rate) rate = lp.rate;
    } else if (!amount || amount < 1000) {
      return err('Minimum loan amount is \u00a31,000');
    }
    const u = await first(env, 'SELECT * FROM users WHERE id=?', me.id);
    const fee = +(amount * (feePct / 100)).toFixed(2);
    const info = await run(env, `INSERT INTO loans (user_id,product,amount,term,purpose,rate,fee,status,created_at)
                           VALUES (?,?,?,?,?,?,?,?,?)`, u.id, product, +amount.toFixed(2), term, purpose, rate, fee, 'pending', nowMs());
    await notify(env, u.id, 'Loan application received', 'Your ' + fmt(amount, u.currency_symbol) + ' ' + product + ' application is under review. A ' + feePct + '% assessment fee (' + fmt(fee, u.currency_symbol) + ') applies after approval.', '\ud83c\udfe6', { email: u.email });
    await adminAlert(env, 'loan', u.id, 'New loan application: ' + fmt(amount, u.currency_symbol) + ' \u2014 ' + product + ' from ' + u.full_name);
    return json({ message: 'Loan application submitted. Our team will review it within 24\u201348 hours.', id: info.last_row_id, fee, fee_percent: feePct });
  }

  /* ---------- Investment plans (user) ---------- */
  if (method === 'GET' && path === '/plans') {
    if (!me) return err('Not authenticated', 401);
    return json({ plans: await all(env, 'SELECT * FROM investment_plans WHERE active=1 ORDER BY sort_order, id') });
  }
  if (method === 'GET' && path === '/subscriptions') {
    if (!me) return err('Not authenticated', 401);
    return json({ subscriptions: await all(env, 'SELECT * FROM plan_subscriptions WHERE user_id=? ORDER BY created_at DESC', me.id) });
  }
  if (method === 'POST' && path === '/subscriptions') {
    if (!me) return err('Not authenticated', 401);
    if (me.role === 'admin') return err('Admin accounts cannot subscribe to plans');
    const b = await readBody(request);
    const planId = Number(b.plan_id);
    const amount = Number(b.amount);
    if (!planId || !amount || amount <= 0) return err('Plan and a positive amount are required');
    const plan = await first(env, 'SELECT * FROM investment_plans WHERE id=? AND active=1', planId);
    if (!plan) return err('Plan not found', 404);
    if (amount < plan.min_amount) return err('Minimum for ' + plan.name + ' is ' + fmt(plan.min_amount, '\u00a3'));
    if (plan.max_amount && amount > plan.max_amount) return err('Maximum for ' + plan.name + ' is ' + fmt(plan.max_amount, '\u00a3'));
    const u = await first(env, 'SELECT * FROM users WHERE id=?', me.id);
    if (u.balance < amount) return err('Insufficient balance. Available: ' + fmt(u.balance, u.currency_symbol));
    const expected = +(amount * (1 + plan.roi_percent / 100)).toFixed(2);
    const balanceAfter = await adjustBalance(env, u.id, -amount);
    const ref = genRef('INV');
    await run(env, `INSERT INTO transactions (user_id,type,status,amount,reference,method,note,balance_after,created_at,processed_at,processed_by)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      u.id, 'investment', 'approved', +amount.toFixed(2), ref, 'plan', 'Investment in ' + plan.name + ' plan', balanceAfter, nowMs(), nowMs(), null);
    const info = await run(env, `INSERT INTO plan_subscriptions (user_id,plan_id,plan_name,amount,roi_percent,duration_days,expected_return,status,created_at,matures_at)
                           VALUES (?,?,?,?,?,?,?,?,?,?)`,
      u.id, plan.id, plan.name, +amount.toFixed(2), plan.roi_percent, plan.duration_days, expected, 'active', nowMs(), nowMs() + plan.duration_days * 86400000);
    await notify(env, u.id, 'Investment plan activated \ud83d\udcc8',
      'Your ' + fmt(amount, u.currency_symbol) + ' investment in the ' + plan.name + ' plan is now active. Expected return: ' + fmt(expected, u.currency_symbol) + ' over ' + plan.duration_days + ' days.',
      '\ud83d\udcc8', { email: u.email });
    await adminAlert(env, 'investment', u.id, 'New investment: ' + fmt(amount, u.currency_symbol) + ' in ' + plan.name + ' from ' + u.full_name);
    return json({ message: 'Investment activated. Expected return ' + fmt(expected, u.currency_symbol) + ' over ' + plan.duration_days + ' days.', id: info.last_row_id, expected_return: expected });
  }

  if (method === 'GET' && path === '/referrals') {
    if (!me) return err('Not authenticated', 401);
    const u = await first(env, 'SELECT * FROM users WHERE id=?', me.id);
    const referred = await all(env, "SELECT id,full_name,email,created_at FROM users WHERE referred_by=? AND role='user'", u.referral_code);
    const earn = await first(env, "SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE user_id=? AND type='referral'", u.id);
    const siteUrl = await getSetting(env, 'site_url');
    return json({
      code: u.referral_code,
      link: siteUrl + '/register.html?ref=' + u.referral_code,
      count: referred.length,
      earnings: earn ? earn.s : 0,
      referred
    });
  }

  if (method === 'GET' && path === '/messages') {
    if (!me) return err('Not authenticated', 401);
    const rows = await all(env, "SELECT id,user_id,sender,body,attachment_name,attachment_type,read,created_at, CASE WHEN attachment IS NOT NULL AND attachment<>'' THEN 1 ELSE 0 END has_attachment FROM messages WHERE user_id=? ORDER BY created_at ASC", me.id);
    await run(env, "UPDATE messages SET read=1 WHERE user_id=? AND sender='support'", me.id);
    return json({ messages: rows });
  }
  if (method === 'POST' && path === '/messages') {
    if (!me) return err('Not authenticated', 401);
    const b = await readBody(request);
    const body = String(b.body || '').trim();
    if (me.role === 'admin') return err('Use the admin reply endpoint');
    /* Optional image attachment (base64 data URL or raw base64) */
    let attachment = null, attachment_name = null, attachment_type = null;
    if (b.attachment) {
      const raw = String(b.attachment);
      const m = raw.match(/^data:([^;]+);base64,(.*)$/);
      attachment_type = m ? m[1] : (String(b.attachment_type || 'image/png'));
      attachment = m ? m[2] : raw;
      attachment_name = String(b.attachment_name || 'attachment').slice(0, 120);
      /* Guard: keep attachments under ~4MB of base64 (~3MB binary) */
      if (attachment.length > 5.5 * 1024 * 1024) return err('Image is too large. Please use an image under 3MB.');
      if (!/^image\//.test(attachment_type)) return err('Only image attachments are supported');
    }
    if (!body && !attachment) return err('Message cannot be empty');
    const u = await first(env, 'SELECT * FROM users WHERE id=?', me.id);
    const info = await run(env, 'INSERT INTO messages (user_id,sender,body,attachment,attachment_name,attachment_type,created_at) VALUES (?,?,?,?,?,?,?)',
      u.id, 'user', body.slice(0, 2000), attachment, attachment_name, attachment_type, nowMs());
    const msg = await first(env, 'SELECT id,user_id,sender,body,attachment_name,attachment_type,read,created_at FROM messages WHERE id=?', info.last_row_id);
    await adminAlert(env, 'support_message', u.id, '\ud83d\udcac ' + u.full_name + ': ' + (body ? body.slice(0, 120) : '[image attachment]'));
    /* Notify admin by email as well */
    const adminEmail = (await getSetting(env, 'admin_notify_email')) || env.ADMIN_EMAIL || 'admin@meridianncapital.com';
    const siteUrl = await getSetting(env, 'site_url');
    await sendMail(env, adminEmail, 'New support message from ' + u.full_name,
      emailTemplate('New Support Message \ud83d\udcac',
        '<p><b>' + u.full_name + '</b> (' + u.email + ') sent a message to customer support:</p>' +
        (body ? '<p style="background:rgba(201,162,39,.12);border-left:3px solid #C9A227;padding:14px 16px;border-radius:8px;color:#E7CE6B;">' + body.slice(0, 500).replace(/</g, '&lt;') + '</p>' : '') +
        (attachment ? '<p>\ud83d\udcf7 <b>Image attached</b> \u2014 view and download it from the admin dashboard \u2192 Messages tab.</p>' : '') +
        '<p>Reply from the admin dashboard \u2192 Messages tab.</p>',
        'Open Admin Dashboard', siteUrl + '/admin/dashboard.html'));
    return json({ message: msg });
  }
  /* Fetch a single message attachment (owner or admin) */
  if (method === 'GET' && seg[0] === 'messages' && seg[2] === 'attachment') {
    if (!me) return err('Not authenticated', 401);
    const m = await first(env, 'SELECT * FROM messages WHERE id=?', seg[1]);
    if (!m || !m.attachment) return err('Attachment not found', 404);
    if (me.role !== 'admin' && m.user_id !== me.id) return err('Not authorised', 403);
    const bin = base64ToBytes(m.attachment);
    return new Response(bin, {
      headers: {
        'Content-Type': m.attachment_type || 'image/png',
        'Content-Disposition': 'inline; filename="' + (m.attachment_name || 'attachment') + '"',
        'Cache-Control': 'private, max-age=3600'
      }
    });
  }

  if (method === 'GET' && path === '/notifications') {
    if (!me) return err('Not authenticated', 401);
    const rows = await all(env, 'SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100', me.id);
    await run(env, 'UPDATE notifications SET read=1 WHERE user_id=?', me.id);
    return json({ notifications: rows });
  }

  if (method === 'GET' && path === '/broadcasts') {
    if (!me) return err('Not authenticated', 401);
    return json({ broadcasts: await all(env, 'SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT 100') });
  }

  /* ---------- Admin routes ---------- */
  if (seg[0] === 'admin') {
    if (!me) return err('Not authenticated', 401);
    if (me.role !== 'admin') return err('Admin only', 403);
    return await adminRoute(env, request, method, seg, url, me.id);
  }

  return err('Not found', 404);
}

/* ============================================================
   Admin router
   ============================================================ */
async function adminRoute(env, request, method, seg, url, adminId) {
  /* seg[0] === 'admin' */
  const sub = seg[1];

  if (method === 'GET' && sub === 'stats') {
    const users = await first(env, "SELECT COUNT(*) c FROM users WHERE role='user'");
    const online = await first(env, "SELECT COUNT(*) c FROM users WHERE role='user' AND last_seen > ?", nowMs() - ONLINE_WINDOW);
    const totalBalances = await first(env, "SELECT COALESCE(SUM(balance),0) s FROM users WHERE role='user'");
    const pendingDeposits = await first(env, "SELECT COUNT(*) c FROM transactions WHERE type='deposit' AND status='pending'");
    const pendingWithdrawals = await first(env, "SELECT COUNT(*) c FROM transactions WHERE type='withdrawal' AND status='pending'");
    const pendingLoans = await first(env, "SELECT COUNT(*) c FROM loans WHERE status='pending'");
    const depositsApproved = await first(env, "SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE type='deposit' AND status='approved'");
    const withdrawalsApproved = await first(env, "SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE type='withdrawal' AND status='approved'");
    const openChats = await first(env, "SELECT COUNT(DISTINCT user_id) c FROM messages WHERE user_id IN (SELECT id FROM users WHERE role='user')");
    const unreadAlerts = await first(env, 'SELECT COUNT(*) c FROM admin_alerts WHERE read=0');
    const currencies = await all(env, "SELECT currency_code code, COUNT(*) c FROM users WHERE role='user' GROUP BY currency_code");
    return json({
      users: users.c, online: online.c, totalBalances: totalBalances.s,
      pendingDeposits: pendingDeposits.c, pendingWithdrawals: pendingWithdrawals.c, pendingLoans: pendingLoans.c,
      depositsApproved: depositsApproved.s, withdrawalsApproved: withdrawalsApproved.s,
      openChats: openChats.c, unreadAlerts: unreadAlerts.c, currencies
    });
  }

  if (method === 'GET' && sub === 'users') {
    const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
    let rows;
    if (q) {
      rows = await all(env, "SELECT * FROM users WHERE role='user' AND (LOWER(full_name) LIKE ? OR LOWER(email) LIKE ?) ORDER BY created_at DESC", '%' + q + '%', '%' + q + '%');
    } else {
      rows = await all(env, "SELECT * FROM users WHERE role='user' ORDER BY created_at DESC");
    }
    const enriched = [];
    for (const u of rows) {
      const pub = await publicUser(env, u.id);
      pub.bonus_received = !!u.bonus_received;
      const tc = await first(env, 'SELECT COUNT(*) c FROM transactions WHERE user_id=?', u.id);
      pub.tx_count = tc.c;
      enriched.push(pub);
    }
    return json({ users: enriched });
  }

  if (method === 'POST' && sub === 'users' && seg[3] === 'status') {
    const target = await first(env, "SELECT * FROM users WHERE id=? AND role='user'", seg[2]);
    if (!target) return err('User not found', 404);
    const b = await readBody(request);
    const status = (b.status === 'suspended') ? 'suspended' : 'active';
    await run(env, 'UPDATE users SET status=? WHERE id=?', status, target.id);
    await notify(env, target.id, status === 'suspended' ? 'Account suspended' : 'Account reactivated',
      status === 'suspended' ? 'Your account has been suspended. Contact support for assistance.' : 'Good news \u2014 your account has been reactivated.',
      '\u26a0\ufe0f', { email: target.email });
    return json({ message: 'User status updated', status });
  }

  if (method === 'POST' && sub === 'users' && seg[3] === 'kyc') {
    const target = await first(env, "SELECT * FROM users WHERE id=? AND role='user'", seg[2]);
    if (!target) return err('User not found', 404);
    const b = await readBody(request);
    const kyc = (b.kyc === 'verified') ? 'verified' : 'pending';
    await run(env, 'UPDATE users SET kyc=? WHERE id=?', kyc, target.id);
    await notify(env, target.id, kyc === 'verified' ? 'Identity verified \u2705' : 'Verification pending',
      kyc === 'verified' ? 'Your identity has been verified. Full account features are now unlocked.' : 'Your verification status has been reset to pending.',
      '\ud83e\uddd1', { email: target.email });
    return json({ message: 'KYC updated', kyc });
  }

  /* Approve a client account and send the official approval email */
  if (method === 'POST' && sub === 'users' && seg[3] === 'approve') {
    const target = await first(env, "SELECT * FROM users WHERE id=? AND role='user'", seg[2]);
    if (!target) return err('User not found', 404);
    const b = await readBody(request);
    const bonusGBP = Number(b.bonus !== undefined ? b.bonus : (await getSetting(env, 'signup_bonus') || SIGNUP_BONUS_GBP));
    const cur = currencyFor(target.country);
    const bonusAmt = +(bonusGBP * cur.rate).toFixed(2);
    /* Ensure the user has account identifiers */
    let accountNumber = target.account_number, memberId = target.member_id, sortCode = target.sort_code, iban = target.iban, bic = target.bic;
    if (!accountNumber) accountNumber = genAccountNumber();
    if (!memberId) memberId = genMemberId();
    if (!sortCode) sortCode = genSortCode();
    if (!iban) iban = genIBAN(sortCode, genBankAccount());
    if (!bic) bic = 'MCUKGB2L';
    await run(env, 'UPDATE users SET status=?, kyc=?, account_number=?, member_id=?, sort_code=?, iban=?, bic=?, bank_holder=? WHERE id=?',
      'active', 'verified', accountNumber, memberId, sortCode, iban, bic, target.full_name, target.id);
    /* Credit the sign-up bonus if not already received */
    let balanceAfter = target.balance;
    if (!target.bonus_received) {
      balanceAfter = await adjustBalance(env, target.id, bonusAmt);
      await run(env, 'UPDATE users SET bonus_received=1 WHERE id=?', target.id);
      await run(env, `INSERT INTO transactions (user_id,type,status,amount,reference,method,note,balance_after,created_at,processed_at,processed_by)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        target.id, 'bonus', 'approved', bonusAmt, genRef('BON'), 'system', 'Sign-up bonus credited on account approval', balanceAfter, nowMs(), nowMs(), adminId);
    }
    const siteUrl = await getSetting(env, 'site_url');
    const firstName = String(target.full_name || '').split(' ')[0];
    await notify(env, target.id, 'Your account has been approved \ud83c\udf89',
      'Great news! Your Meridian Capital Partners account has been approved and is now fully active. Your account number is ' + accountNumber + ' and your Client/Member ID is ' + memberId + '.',
      '\u2705', { email: target.email });
    await sendMail(env, target.email, 'Your Meridian Capital Partners account has been approved',
      emailTemplate('Your Account Has Been Approved \ud83c\udf89',
        '<p>Dear ' + target.full_name + ',</p>' +
        '<p>Great news! Your Meridian Capital Partners account has been approved and is now fully active. You can now fund your account, invest in our plans and withdraw your returns at any time.</p>' +
        '<div style="background:rgba(201,162,39,.12);border:1px solid rgba(201,162,39,.4);border-radius:12px;padding:20px;margin:18px 0;">' +
        '<div style="color:#E7CE6B;font-family:Georgia,serif;font-size:15px;font-weight:700;letter-spacing:1px;margin-bottom:12px;">YOUR OFFICIAL ACCOUNT DETAILS</div>' +
        '<table style="width:100%;border-collapse:collapse;">' +
        '<tr><td style="padding:6px 0;color:#9db0c4;">Account Name</td><td style="padding:6px 0;color:#fff;text-align:right;"><b>' + target.full_name + '</b></td></tr>' +
        '<tr><td style="padding:6px 0;color:#9db0c4;">Account Number</td><td style="padding:6px 0;color:#fff;text-align:right;"><b>' + accountNumber + '</b></td></tr>' +
        '<tr><td style="padding:6px 0;color:#9db0c4;">Client / Member ID</td><td style="padding:6px 0;color:#fff;text-align:right;"><b>' + memberId + '</b></td></tr>' +
        '<tr><td style="padding:6px 0;color:#9db0c4;">Sort Code</td><td style="padding:6px 0;color:#fff;text-align:right;"><b>' + sortCode + '</b></td></tr>' +
        '<tr><td style="padding:6px 0;color:#9db0c4;">IBAN</td><td style="padding:6px 0;color:#fff;text-align:right;"><b>' + iban + '</b></td></tr>' +
        '<tr><td style="padding:6px 0;color:#9db0c4;">BIC / SWIFT</td><td style="padding:6px 0;color:#fff;text-align:right;"><b>' + bic + '</b></td></tr>' +
        '</table></div>' +
        '<div style="background:linear-gradient(135deg,#0E4C92,#0A1F33);border-radius:12px;padding:20px;text-align:center;margin:18px 0;">' +
        '<div style="color:#E7CE6B;font-family:Georgia,serif;font-size:26px;font-weight:700;">' + fmt(bonusAmt, cur.symbol) + '</div>' +
        '<div style="color:#fff;font-size:13px;letter-spacing:2px;text-transform:uppercase;margin-top:4px;">Sign-up Bonus \u2014 Credited To Your Account</div>' +
        '</div>' +
        '<p>Welcome aboard, ' + firstName + '. We are delighted to have you with us.</p>',
        'Access My Dashboard', siteUrl + '/user/dashboard.html'));
    await adminAlert(env, 'approve', target.id, 'Account approved for ' + target.full_name + ' (' + target.email + ')');
    return json({ message: 'Account approved and email sent', account_number: accountNumber, member_id: memberId, bonus: bonusAmt });
  }

  if (method === 'GET' && sub === 'transactions') {
    let sql = "SELECT t.*, u.full_name, u.email, u.currency_symbol, u.currency_code FROM transactions t JOIN users u ON u.id = t.user_id WHERE u.role='user'";
    const params = [];
    const st = url.searchParams.get('status');
    const ty = url.searchParams.get('type');
    if (st) { sql += ' AND t.status=?'; params.push(st); }
    if (ty) { sql += ' AND t.type=?'; params.push(ty); }
    sql += ' ORDER BY t.created_at DESC LIMIT 400';
    return json({ transactions: await all(env, sql, ...params) });
  }

  if (method === 'POST' && sub === 'transactions' && seg[3] === 'approve') {
    const t = await first(env, 'SELECT t.*, u.email, u.currency_symbol FROM transactions t JOIN users u ON u.id=t.user_id WHERE t.id=?', seg[2]);
    if (!t) return err('Transaction not found', 404);
    if (t.status !== 'pending') return err('Transaction already ' + t.status);
    let balanceAfter;
    if (t.type === 'deposit') balanceAfter = await adjustBalance(env, t.user_id, t.amount);
    else if (t.type === 'withdrawal') { const u = await first(env, 'SELECT balance FROM users WHERE id=?', t.user_id); balanceAfter = u.balance; }
    else return err('Only deposit/withdrawal requests can be approved here');
    await run(env, 'UPDATE transactions SET status=?, processed_at=?, processed_by=?, balance_after=? WHERE id=?', 'approved', nowMs(), adminId, balanceAfter, t.id);
    /* First approved deposit unlocks all other funding methods */
    if (t.type === 'deposit') {
      const du = await first(env, 'SELECT first_deposit_done FROM users WHERE id=?', t.user_id);
      if (du && !du.first_deposit_done) {
        await run(env, 'UPDATE users SET first_deposit_done=1 WHERE id=?', t.user_id);
        await notify(env, t.user_id, 'All deposit methods unlocked \ud83d\udd13', 'Your first deposit is confirmed. Bank transfer, card, wallets and every other funding method are now available on your Deposit page.', '\ud83d\udd13', { email: t.email });
      }
    }
    const title = (t.type === 'deposit') ? 'Deposit approved \u2705' : 'Withdrawal approved \u2705';
    await notify(env, t.user_id, title, 'Your ' + t.type + ' of ' + fmt(t.amount, t.currency_symbol) + ' (ref ' + t.reference + ') has been approved by our team.', t.type === 'deposit' ? '\ud83d\udce5' : '\ud83d\udce4', { email: t.email });
    const siteUrl = await getSetting(env, 'site_url');
    await sendMail(env, t.email, title,
      emailTemplate(title,
        '<p>Your ' + t.type + ' of <b>' + fmt(t.amount, t.currency_symbol) + '</b> via ' + t.method + ' has been approved.</p>' +
        '<p>Reference: <b>' + t.reference + '</b> \u00b7 New balance: <b style="color:#E7CE6B;">' + fmt(balanceAfter, t.currency_symbol) + '</b></p>',
        'Open Dashboard', siteUrl + '/user/dashboard.html'));
    return json({ message: 'Approved', balance_after: balanceAfter });
  }

  if (method === 'POST' && sub === 'transactions' && seg[3] === 'decline') {
    const b = await readBody(request);
    const reason = String(b.reason || '').trim();
    if (!reason) return err('A reason is required to decline');
    const t = await first(env, 'SELECT t.*, u.email, u.currency_symbol FROM transactions t JOIN users u ON u.id=t.user_id WHERE t.id=?', seg[2]);
    if (!t) return err('Transaction not found', 404);
    if (t.status !== 'pending') return err('Transaction already ' + t.status);
    let balanceAfter = null;
    if (t.type === 'withdrawal') balanceAfter = await adjustBalance(env, t.user_id, t.amount);
    await run(env, 'UPDATE transactions SET status=?, admin_note=?, processed_at=?, processed_by=?, balance_after=? WHERE id=?', 'declined', reason, nowMs(), adminId, balanceAfter, t.id);
    const label = (t.type === 'deposit') ? 'Deposit' : 'Withdrawal';
    await notify(env, t.user_id, label + ' declined \u274c', 'Your ' + t.type + ' of ' + fmt(t.amount, t.currency_symbol) + ' (ref ' + t.reference + ') was declined. Reason: ' + reason, '\u26d4', { email: t.email });
    const siteUrl = await getSetting(env, 'site_url');
    await sendMail(env, t.email, label + ' request declined',
      emailTemplate('Request Declined',
        '<p>Your ' + t.type + ' of <b>' + fmt(t.amount, t.currency_symbol) + '</b> (ref ' + t.reference + ') was declined.</p>' +
        '<p>Reason from our team: <i>"' + reason + '"</i></p>' +
        (t.type === 'withdrawal' ? '<p>The held amount has been returned to your available balance.</p>' : ''),
        'Open Dashboard', siteUrl + '/user/dashboard.html'));
    return json({ message: 'Declined with reason' });
  }

  if (method === 'POST' && sub === 'transactions' && seg[3] === 'reverse') {
    const b = await readBody(request);
    const reason = String(b.reason || '').trim();
    if (!reason) return err('A reason is required to reverse the transaction');
    const t = await first(env, 'SELECT t.*, u.email, u.currency_symbol FROM transactions t JOIN users u ON u.id=t.user_id WHERE t.id=?', seg[2]);
    if (!t) return err('Transaction not found', 404);
    if (t.status !== 'approved') return err('Only approved transactions can be reversed');
    let balanceAfter;
    if (t.type === 'withdrawal') balanceAfter = await adjustBalance(env, t.user_id, t.amount);
    else balanceAfter = await adjustBalance(env, t.user_id, -t.amount);
    await run(env, 'UPDATE transactions SET status=?, admin_note=?, processed_at=?, processed_by=?, balance_after=? WHERE id=?', 'reversed', reason, nowMs(), adminId, balanceAfter, t.id);
    await notify(env, t.user_id, 'Transaction reversed \u21a9\ufe0f', 'Your ' + t.type + ' of ' + fmt(t.amount, t.currency_symbol) + ' (ref ' + t.reference + ') was reversed. Reason: ' + reason, '\u21a9\ufe0f', { email: t.email });
    const siteUrl = await getSetting(env, 'site_url');
    await sendMail(env, t.email, 'Transaction reversed',
      emailTemplate('Transaction Reversed',
        '<p>Your ' + t.type + ' of <b>' + fmt(t.amount, t.currency_symbol) + '</b> (ref ' + t.reference + ') has been reversed by our team.</p>' +
        '<p>Reason: <i>"' + reason + '"</i></p>' +
        '<p>Current balance: <b style="color:#E7CE6B;">' + fmt(balanceAfter, t.currency_symbol) + '</b></p>',
        'Open Dashboard', siteUrl + '/user/dashboard.html'));
    return json({ message: 'Reversed with reason', balance_after: balanceAfter });
  }

  if (method === 'POST' && sub === 'transactions' && seg.length === 2) {
    const b = await readBody(request);
    const user_id = Number(b.user_id);
    const type = String(b.type || '');
    const amt = Number(b.amount);
    const note = String(b.note || '').slice(0, 500);
    if (!user_id || !type || !amt || amt <= 0) return err('User, type and a positive amount are required');
    const u = await first(env, "SELECT * FROM users WHERE id=? AND role='user'", user_id);
    if (!u) return err('User not found', 404);
    if (['credit', 'debit', 'profit', 'bonus', 'deposit', 'withdrawal', 'investment', 'referral'].indexOf(type) === -1) return err('Invalid transaction type');
    const delta = (type === 'debit' || type === 'withdrawal') ? -amt : amt;
    if (u.balance + delta < 0) return err('Debit exceeds user balance');
    const balanceAfter = await adjustBalance(env, u.id, delta);
    const ref = genRef(type === 'profit' ? 'PRF' : (type === 'bonus' ? 'BON' : type.toUpperCase().slice(0, 3)));
    /* Optional custom date (ms epoch or ISO string) for back-dated transactions */
    let createdAt = nowMs();
    if (b.created_at) {
      const parsed = typeof b.created_at === 'number' ? b.created_at : Date.parse(b.created_at);
      if (!isNaN(parsed)) createdAt = parsed;
    }
    const status = String(b.status || 'approved');
    await run(env, `INSERT INTO transactions (user_id,type,status,amount,reference,method,note,balance_after,created_at,processed_at,processed_by)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`, u.id, type, status, +amt.toFixed(2), ref, 'admin', note, balanceAfter, createdAt, nowMs(), adminId);
    await notify(env, u.id, 'Account updated by Meridian Capital Partners',
      (delta < 0 ? 'A debit of ' : 'A credit of ') + fmt(amt, u.currency_symbol) + ' was applied to your account.' + (note ? ' Note: ' + note : '') + ' New balance: ' + fmt(balanceAfter, u.currency_symbol) + '.',
      '\ud83e\uddde', { email: u.email });
    const siteUrl = await getSetting(env, 'site_url');
    await sendMail(env, u.email, 'Account transaction created',
      emailTemplate('New Transaction On Your Account',
        '<p>A <b>' + type + '</b> of <b>' + fmt(amt, u.currency_symbol) + '</b> was applied to your account' + (note ? ' \u2014 <i>' + note + '</i>' : '') + '.</p>' +
        '<p>New balance: <b style="color:#E7CE6B;">' + fmt(balanceAfter, u.currency_symbol) + '</b></p>',
        'Open Dashboard', siteUrl + '/user/dashboard.html'));
    return json({ message: 'Transaction created', reference: ref, balance_after: balanceAfter });
  }

  /* ---------- Random transaction generator ----------
     Generates N random transactions for a user (or all users) spread
     across a chosen year range, as far back as requested. */
  if (method === 'POST' && sub === 'transactions' && seg[2] === 'random') {
    const b = await readBody(request);
    const user_id = Number(b.user_id) || 0;
    const count = Math.min(Math.max(parseInt(b.count, 10) || 10, 1), 500);
    const fromYear = parseInt(b.from_year, 10) || (new Date().getFullYear() - 3);
    const toYear = parseInt(b.to_year, 10) || new Date().getFullYear();
    const types = Array.isArray(b.types) && b.types.length ? b.types : ['deposit', 'profit', 'bonus', 'withdrawal'];
    const minAmt = Number(b.min_amount) || 50;
    const maxAmt = Number(b.max_amount) || 5000;
    const applyBalance = b.apply_balance !== false; /* default true */
    const y1 = Math.min(fromYear, toYear), y2 = Math.max(fromYear, toYear);
    const startMs = Date.UTC(y1, 0, 1, 0, 0, 0);
    const endMs = Date.UTC(y2, 11, 31, 23, 59, 59);
    if (endMs <= startMs) return err('Invalid year range');

    let targets;
    if (user_id) {
      const u = await first(env, "SELECT * FROM users WHERE id=? AND role='user'", user_id);
      if (!u) return err('User not found', 404);
      targets = [u];
    } else {
      targets = await all(env, "SELECT * FROM users WHERE role='user'");
      if (!targets.length) return err('No users found');
    }

    const rnd = (a, z) => a + Math.random() * (z - a);
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    let created = 0;
    const notes = {
      deposit: ['Bank transfer received', 'Faster Payments deposit', 'Card deposit', 'Crypto deposit confirmed'],
      profit: ['Portfolio profit distribution', 'Monthly investment return', 'Trading profit credited', 'Dividend payout'],
      bonus: ['Loyalty bonus', 'Promotional credit', 'Referral milestone bonus', 'Seasonal bonus'],
      withdrawal: ['Withdrawal to bank account', 'Payout processed', 'Withdrawal to crypto wallet'],
      investment: ['Investment plan contribution', 'Portfolio top-up'],
      referral: ['Referral reward']
    };
    for (const u of targets) {
      for (let i = 0; i < count; i++) {
        const type = pick(types);
        const amt = +rnd(minAmt, maxAmt).toFixed(2);
        const ts = Math.floor(rnd(startMs, endMs));
        const ref = genRef(type.toUpperCase().slice(0, 3));
        const note = pick(notes[type] || ['Account activity']);
        let balanceAfter = null;
        if (applyBalance) {
          const delta = (type === 'debit' || type === 'withdrawal') ? -amt : amt;
          if (delta < 0) {
            const cur = await first(env, 'SELECT balance FROM users WHERE id=?', u.id);
            if ((cur ? cur.balance : 0) + delta < 0) continue; /* skip: would overdraw */
          }
          balanceAfter = await adjustBalance(env, u.id, delta);
        }
        await run(env, `INSERT INTO transactions (user_id,type,status,amount,reference,method,note,balance_after,created_at,processed_at,processed_by)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          u.id, type, 'approved', amt, ref, 'system', note, balanceAfter, ts, ts, adminId);
        created++;
      }
    }
    await adminAlert(env, 'random_tx', user_id || null,
      'Generated ' + created + ' random transactions (' + y1 + '\u2013' + y2 + ') for ' + (user_id ? '1 user' : targets.length + ' users'));
    return json({ message: 'Generated ' + created + ' transactions across ' + targets.length + ' user(s) for ' + y1 + '\u2013' + y2 + '.', created, users: targets.length });
  }

  /* ---------- Investment plans (admin) ---------- */
  if (method === 'GET' && sub === 'plans') {
    return json({ plans: await all(env, 'SELECT * FROM investment_plans ORDER BY sort_order, id') });
  }
  if (method === 'POST' && sub === 'plans' && seg.length === 2) {
    const b = await readBody(request);
    const name = String(b.name || '').trim();
    if (!name) return err('Plan name is required');
    const info = await run(env, `INSERT INTO investment_plans (name,tagline,icon,min_amount,max_amount,roi_percent,duration_days,risk,features,active,sort_order,created_at,updated_at)
                           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      name, String(b.tagline || ''), String(b.icon || '\ud83d\udcc8'), Number(b.min_amount) || 0, Number(b.max_amount) || 0,
      Number(b.roi_percent) || 0, parseInt(b.duration_days, 10) || 30, String(b.risk || 'Medium'),
      String(b.features || ''), b.active === false ? 0 : 1, parseInt(b.sort_order, 10) || 0, nowMs(), nowMs());
    return json({ message: 'Plan created', id: info.last_row_id });
  }
  if (method === 'PUT' && sub === 'plans' && seg.length === 3) {
    const p = await first(env, 'SELECT * FROM investment_plans WHERE id=?', seg[2]);
    if (!p) return err('Plan not found', 404);
    const b = await readBody(request);
    await run(env, `UPDATE investment_plans SET name=?,tagline=?,icon=?,min_amount=?,max_amount=?,roi_percent=?,duration_days=?,risk=?,features=?,active=?,sort_order=?,updated_at=? WHERE id=?`,
      b.name !== undefined ? String(b.name) : p.name,
      b.tagline !== undefined ? String(b.tagline) : p.tagline,
      b.icon !== undefined ? String(b.icon) : p.icon,
      b.min_amount !== undefined ? Number(b.min_amount) : p.min_amount,
      b.max_amount !== undefined ? Number(b.max_amount) : p.max_amount,
      b.roi_percent !== undefined ? Number(b.roi_percent) : p.roi_percent,
      b.duration_days !== undefined ? parseInt(b.duration_days, 10) : p.duration_days,
      b.risk !== undefined ? String(b.risk) : p.risk,
      b.features !== undefined ? String(b.features) : p.features,
      b.active !== undefined ? (b.active ? 1 : 0) : p.active,
      b.sort_order !== undefined ? parseInt(b.sort_order, 10) : p.sort_order,
      nowMs(), p.id);
    return json({ message: 'Plan updated' });
  }
  if (method === 'DELETE' && sub === 'plans' && seg.length === 3) {
    const p = await first(env, 'SELECT * FROM investment_plans WHERE id=?', seg[2]);
    if (!p) return err('Plan not found', 404);
    await run(env, 'DELETE FROM investment_plans WHERE id=?', p.id);
    return json({ message: 'Plan deleted' });
  }
  if (method === 'GET' && sub === 'subscriptions') {
    return json({ subscriptions: await all(env, `SELECT s.*, u.full_name, u.email, u.currency_symbol FROM plan_subscriptions s JOIN users u ON u.id=s.user_id ORDER BY s.created_at DESC LIMIT 400`) });
  }

  if (method === 'GET' && sub === 'loans') {
    return json({ loans: await all(env, "SELECT l.*, u.full_name, u.email, u.currency_symbol FROM loans l JOIN users u ON u.id=l.user_id WHERE u.role='user' ORDER BY l.created_at DESC LIMIT 400") });
  }
  if (method === 'POST' && sub === 'loans' && seg[3] === 'approve') {
    const l = await first(env, 'SELECT l.*, u.email, u.currency_symbol FROM loans l JOIN users u ON u.id=l.user_id WHERE l.id=?', seg[2]);
    if (!l) return err('Loan not found', 404);
    if (l.status !== 'pending') return err('Loan already ' + l.status);
    /* 5% assessment fee is applied AFTER approval and deducted from the disbursed amount */
    const feePct = Number(await getSetting(env, 'loan_fee_percent') || 5);
    const fee = +(l.amount * (feePct / 100)).toFixed(2);
    const net = +(l.amount - fee).toFixed(2);
    const balanceAfter = await adjustBalance(env, l.user_id, net);
    await run(env, 'UPDATE loans SET status=?, fee=?, processed_at=?, processed_by=? WHERE id=?', 'approved', fee, nowMs(), adminId, l.id);
    const ref = genRef('LON');
    await run(env, `INSERT INTO transactions (user_id,type,status,amount,reference,method,note,balance_after,created_at,processed_at,processed_by)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      l.user_id, 'loan', 'approved', net, ref, 'loan', l.product + ' loan disbursed (net of ' + feePct + '% assessment fee ' + fmt(fee, l.currency_symbol) + ')', balanceAfter, nowMs(), nowMs(), adminId);
    await notify(env, l.user_id, 'Loan approved \u2705',
      'Your ' + fmt(l.amount, l.currency_symbol) + ' ' + l.product + ' loan has been approved. A ' + feePct + '% assessment fee of ' + fmt(fee, l.currency_symbol) + ' was applied, and ' + fmt(net, l.currency_symbol) + ' has been credited to your account.',
      '\ud83c\udfe6', { email: l.email });
    const siteUrl = await getSetting(env, 'site_url');
    await sendMail(env, l.email, 'Loan approved \u2014 ' + l.product,
      emailTemplate('Loan Approved \u2705',
        '<p>Great news \u2014 your <b>' + l.product + '</b> loan of <b>' + fmt(l.amount, l.currency_symbol) + '</b> has been approved.</p>' +
        '<table style="width:100%;border-collapse:collapse;margin:12px 0;">' +
        '<tr><td style="padding:6px 0;color:#9db0c4;">Loan amount</td><td style="padding:6px 0;color:#fff;"><b>' + fmt(l.amount, l.currency_symbol) + '</b></td></tr>' +
        '<tr><td style="padding:6px 0;color:#9db0c4;">Assessment fee (' + feePct + '%)</td><td style="padding:6px 0;color:#E7CE6B;"><b>\u2212 ' + fmt(fee, l.currency_symbol) + '</b></td></tr>' +
        '<tr><td style="padding:6px 0;color:#9db0c4;">Net disbursed</td><td style="padding:6px 0;color:#fff;"><b>' + fmt(net, l.currency_symbol) + '</b></td></tr>' +
        '<tr><td style="padding:6px 0;color:#9db0c4;">Term</td><td style="padding:6px 0;color:#fff;">' + l.term + ' months</td></tr>' +
        '<tr><td style="padding:6px 0;color:#9db0c4;">Reference</td><td style="padding:6px 0;color:#fff;">' + ref + '</td></tr>' +
        '</table>' +
        '<p>New balance: <b style="color:#E7CE6B;">' + fmt(balanceAfter, l.currency_symbol) + '</b></p>',
        'Open My Dashboard', siteUrl + '/user/dashboard.html'));
    return json({ message: 'Loan approved', fee, net, balance_after: balanceAfter });
  }
  if (method === 'POST' && sub === 'loans' && seg[3] === 'decline') {
    const b = await readBody(request);
    const reason = String(b.reason || '').trim();
    if (!reason) return err('A reason is required to decline');
    const l = await first(env, 'SELECT l.*, u.email, u.currency_symbol FROM loans l JOIN users u ON u.id=l.user_id WHERE l.id=?', seg[2]);
    if (!l) return err('Loan not found', 404);
    if (l.status !== 'pending') return err('Loan already ' + l.status);
    await run(env, 'UPDATE loans SET status=?, admin_note=?, processed_at=?, processed_by=? WHERE id=?', 'declined', reason, nowMs(), adminId, l.id);
    await notify(env, l.user_id, 'Loan declined \u274c', 'Your ' + fmt(l.amount, l.currency_symbol) + ' ' + l.product + ' loan was declined. Reason: ' + reason, '\u26d4', { email: l.email });
    return json({ message: 'Loan declined' });
  }

  if (method === 'GET' && sub === 'wallets') {
    return json({ wallets: await all(env, 'SELECT * FROM wallets ORDER BY id') });
  }
  if (method === 'POST' && sub === 'wallets') {
    const b = await readBody(request);
    const network = String(b.network || '').trim();
    const currency = String(b.currency || 'USDT').trim();
    const address = String(b.address || '').trim();
    if (!network || !address) return err('Network and address are required');
    const info = await run(env, 'INSERT INTO wallets (network,currency,address,active,updated_at) VALUES (?,?,?,?,?)', network, currency, address, 1, nowMs());
    return json({ message: 'Wallet added', id: info.last_row_id });
  }
  if (method === 'PUT' && sub === 'wallets') {
    const w = await first(env, 'SELECT * FROM wallets WHERE id=?', seg[2]);
    if (!w) return err('Wallet not found', 404);
    const b = await readBody(request);
    await run(env, 'UPDATE wallets SET network=?, currency=?, address=?, active=?, updated_at=? WHERE id=?',
      b.network !== undefined ? String(b.network).trim() : w.network,
      b.currency !== undefined ? String(b.currency).trim() : w.currency,
      b.address !== undefined ? String(b.address).trim() : w.address,
      b.active !== undefined ? (b.active ? 1 : 0) : w.active,
      nowMs(), w.id);
    return json({ message: 'Wallet updated' });
  }
  if (method === 'DELETE' && sub === 'wallets') {
    const w = await first(env, 'SELECT * FROM wallets WHERE id=?', seg[2]);
    if (!w) return err('Wallet not found', 404);
    await run(env, 'DELETE FROM wallets WHERE id=?', w.id);
    return json({ message: 'Wallet deleted' });
  }

  /* ---------- Loan products (admin) ---------- */
  if (method === 'GET' && sub === 'loan-products') {
    return json({ products: await all(env, 'SELECT * FROM loan_products ORDER BY sort_order, id') });
  }
  if (method === 'POST' && sub === 'loan-products' && seg.length === 2) {
    const b = await readBody(request);
    const name = String(b.name || '').trim();
    if (!name) return err('Loan product name is required');
    const info = await run(env, `INSERT INTO loan_products (name,icon,min_amount,max_amount,rate,term_min,term_max,description,fee_percent,active,sort_order,created_at,updated_at)
                           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      name, String(b.icon || '\ud83c\udfe6'), Number(b.min_amount) || 1000, Number(b.max_amount) || 50000,
      String(b.rate || ''), parseInt(b.term_min, 10) || 12, parseInt(b.term_max, 10) || 84,
      String(b.description || ''), Number(b.fee_percent) || 5, b.active === false ? 0 : 1, parseInt(b.sort_order, 10) || 0, nowMs(), nowMs());
    return json({ message: 'Loan product created', id: info.last_row_id });
  }
  if (method === 'PUT' && sub === 'loan-products' && seg.length === 3) {
    const p = await first(env, 'SELECT * FROM loan_products WHERE id=?', seg[2]);
    if (!p) return err('Loan product not found', 404);
    const b = await readBody(request);
    await run(env, `UPDATE loan_products SET name=?,icon=?,min_amount=?,max_amount=?,rate=?,term_min=?,term_max=?,description=?,fee_percent=?,active=?,sort_order=?,updated_at=? WHERE id=?`,
      b.name !== undefined ? String(b.name) : p.name,
      b.icon !== undefined ? String(b.icon) : p.icon,
      b.min_amount !== undefined ? Number(b.min_amount) : p.min_amount,
      b.max_amount !== undefined ? Number(b.max_amount) : p.max_amount,
      b.rate !== undefined ? String(b.rate) : p.rate,
      b.term_min !== undefined ? parseInt(b.term_min, 10) : p.term_min,
      b.term_max !== undefined ? parseInt(b.term_max, 10) : p.term_max,
      b.description !== undefined ? String(b.description) : p.description,
      b.fee_percent !== undefined ? Number(b.fee_percent) : p.fee_percent,
      b.active !== undefined ? (b.active ? 1 : 0) : p.active,
      b.sort_order !== undefined ? parseInt(b.sort_order, 10) : p.sort_order,
      nowMs(), p.id);
    return json({ message: 'Loan product updated' });
  }
  if (method === 'DELETE' && sub === 'loan-products' && seg.length === 3) {
    const p = await first(env, 'SELECT * FROM loan_products WHERE id=?', seg[2]);
    if (!p) return err('Loan product not found', 404);
    await run(env, 'DELETE FROM loan_products WHERE id=?', p.id);
    return json({ message: 'Loan product deleted' });
  }

  /* ---------- Deposit methods (admin) ---------- */
  if (method === 'GET' && sub === 'deposit-methods') {
    return json({ methods: await all(env, 'SELECT * FROM deposit_methods ORDER BY sort_order, id') });
  }
  if (method === 'POST' && sub === 'deposit-methods' && seg.length === 2) {
    const b = await readBody(request);
    const name = String(b.name || '').trim();
    if (!name) return err('Deposit method name is required');
    const info = await run(env, `INSERT INTO deposit_methods (name,icon,category,details,instructions,min_amount,active,sort_order,created_at,updated_at)
                           VALUES (?,?,?,?,?,?,?,?,?,?)`,
      name, String(b.icon || '\ud83d\udcb3'), String(b.category || 'Bank'), String(b.details || ''),
      String(b.instructions || ''), Number(b.min_amount) || 100, b.active === false ? 0 : 1, parseInt(b.sort_order, 10) || 0, nowMs(), nowMs());
    return json({ message: 'Deposit method created', id: info.last_row_id });
  }
  if (method === 'PUT' && sub === 'deposit-methods' && seg.length === 3) {
    const m = await first(env, 'SELECT * FROM deposit_methods WHERE id=?', seg[2]);
    if (!m) return err('Deposit method not found', 404);
    const b = await readBody(request);
    await run(env, `UPDATE deposit_methods SET name=?,icon=?,category=?,details=?,instructions=?,min_amount=?,active=?,sort_order=?,updated_at=? WHERE id=?`,
      b.name !== undefined ? String(b.name) : m.name,
      b.icon !== undefined ? String(b.icon) : m.icon,
      b.category !== undefined ? String(b.category) : m.category,
      b.details !== undefined ? String(b.details) : m.details,
      b.instructions !== undefined ? String(b.instructions) : m.instructions,
      b.min_amount !== undefined ? Number(b.min_amount) : m.min_amount,
      b.active !== undefined ? (b.active ? 1 : 0) : m.active,
      b.sort_order !== undefined ? parseInt(b.sort_order, 10) : m.sort_order,
      nowMs(), m.id);
    return json({ message: 'Deposit method updated' });
  }
  if (method === 'DELETE' && sub === 'deposit-methods' && seg.length === 3) {
    const m = await first(env, 'SELECT * FROM deposit_methods WHERE id=?', seg[2]);
    if (!m) return err('Deposit method not found', 404);
    await run(env, 'DELETE FROM deposit_methods WHERE id=?', m.id);
    return json({ message: 'Deposit method deleted' });
  }

  /* ---------- Message templates (admin) ---------- */
  if (method === 'GET' && sub === 'templates') {
    return json({ templates: await all(env, 'SELECT * FROM message_templates ORDER BY sort_order, id') });
  }
  if (method === 'POST' && sub === 'templates' && seg.length === 2) {
    const b = await readBody(request);
    const title = String(b.title || '').trim();
    const body = String(b.body || '').trim();
    if (!title || !body) return err('Title and message are required');
    const info = await run(env, `INSERT INTO message_templates (title,body,kind,cta_label,category,active,sort_order,created_at,updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?)`,
      title, body, String(b.kind || 'motivational'), String(b.cta_label || 'Open My Dashboard'),
      String(b.category || 'General'), b.active === false ? 0 : 1, parseInt(b.sort_order, 10) || 0, nowMs(), nowMs());
    return json({ message: 'Template created', id: info.last_row_id });
  }
  if (method === 'PUT' && sub === 'templates' && seg.length === 3) {
    const t = await first(env, 'SELECT * FROM message_templates WHERE id=?', seg[2]);
    if (!t) return err('Template not found', 404);
    const b = await readBody(request);
    await run(env, `UPDATE message_templates SET title=?,body=?,kind=?,cta_label=?,category=?,active=?,sort_order=?,updated_at=? WHERE id=?`,
      b.title !== undefined ? String(b.title) : t.title,
      b.body !== undefined ? String(b.body) : t.body,
      b.kind !== undefined ? String(b.kind) : t.kind,
      b.cta_label !== undefined ? String(b.cta_label) : t.cta_label,
      b.category !== undefined ? String(b.category) : t.category,
      b.active !== undefined ? (b.active ? 1 : 0) : t.active,
      b.sort_order !== undefined ? parseInt(b.sort_order, 10) : t.sort_order,
      nowMs(), t.id);
    return json({ message: 'Template updated' });
  }
  if (method === 'DELETE' && sub === 'templates' && seg.length === 3) {
    const t = await first(env, 'SELECT * FROM message_templates WHERE id=?', seg[2]);
    if (!t) return err('Template not found', 404);
    await run(env, 'DELETE FROM message_templates WHERE id=?', t.id);
    return json({ message: 'Template deleted' });
  }

  if (method === 'GET' && sub === 'chats' && seg.length === 2) {
    const rows = await all(env, `
      SELECT u.id user_id, u.full_name, u.email, u.country, u.currency_symbol, u.currency_code, u.last_seen, u.status,
             (SELECT body FROM messages m WHERE m.user_id = u.id ORDER BY m.created_at DESC LIMIT 1) last_message,
             (SELECT created_at FROM messages m WHERE m.user_id = u.id ORDER BY m.created_at DESC LIMIT 1) last_at,
             (SELECT COUNT(*) FROM messages m WHERE m.user_id = u.id AND m.sender='user' AND m.read=0) unread,
             (SELECT COUNT(*) FROM messages m WHERE m.user_id = u.id) total
      FROM users u WHERE u.role='user' AND EXISTS (SELECT 1 FROM messages m WHERE m.user_id = u.id)
      ORDER BY last_at DESC`);
    return json({ chats: rows.map(function (r) {
      r.online = !!(r.last_seen && (nowMs() - r.last_seen < ONLINE_WINDOW));
      r.last_seen_rel = relTime(r.last_seen || 0);
      return r;
    }) });
  }
  if (method === 'GET' && sub === 'chats' && seg.length === 3) {
    const u = await first(env, "SELECT * FROM users WHERE id=? AND role='user'", seg[2]);
    if (!u) return err('User not found', 404);
    /* Exclude the heavy base64 blob; expose a has_attachment flag instead */
    const msgs = await all(env, "SELECT id,user_id,sender,body,attachment_name,attachment_type,read,created_at, CASE WHEN attachment IS NOT NULL AND attachment<>'' THEN 1 ELSE 0 END has_attachment FROM messages WHERE user_id=? ORDER BY created_at ASC", u.id);
    await run(env, "UPDATE messages SET read=1 WHERE user_id=? AND sender='user'", u.id);
    return json({ user: await publicUser(env, u.id), messages: msgs });
  }
  /* Admin attachment download (forces download) */
  if (method === 'GET' && sub === 'chats' && seg[3] === 'attachment') {
    const m = await first(env, 'SELECT * FROM messages WHERE id=?', seg[2]);
    if (!m || !m.attachment) return err('Attachment not found', 404);
    const bin = base64ToBytes(m.attachment);
    return new Response(bin, {
      headers: {
        'Content-Type': m.attachment_type || 'image/png',
        'Content-Disposition': 'attachment; filename="' + (m.attachment_name || 'attachment') + '"',
        'Cache-Control': 'private, max-age=3600'
      }
    });
  }
  if (method === 'POST' && sub === 'chats' && seg[3] === 'reply') {
    const b = await readBody(request);
    const body = String(b.body || '').trim();
    const u = await first(env, "SELECT * FROM users WHERE id=? AND role='user'", seg[2]);
    if (!u) return err('User not found', 404);
    if (!body) return err('Reply cannot be empty');
    const info = await run(env, 'INSERT INTO messages (user_id,sender,body,read,created_at) VALUES (?,?,?,1,?)', u.id, 'support', body.slice(0, 2000), nowMs());
    const msg = await first(env, 'SELECT * FROM messages WHERE id=?', info.last_row_id);
    await notify(env, u.id, 'New reply from Customer Support', 'Support replied: "' + body.slice(0, 100) + (body.length > 100 ? '\u2026' : '') + '"', '\ud83d\udcac', { email: u.email });
    return json({ message: msg });
  }

  if (method === 'POST' && sub === 'broadcasts') {
    const b = await readBody(request);
    const subject = String(b.subject || '').trim();
    const body = String(b.body || '').trim();
    const kind = String(b.kind || 'promotional').trim();
    const ctaLabel = String(b.cta_label || 'Open My Dashboard').trim();
    if (!subject || !body) return err('Subject and message are required');
    const info = await run(env, 'INSERT INTO broadcasts (subject,body,created_at) VALUES (?,?,?)', subject, body, nowMs());
    const users = await all(env, "SELECT * FROM users WHERE role='user' AND status='active'");
    const siteUrl = await getSetting(env, 'site_url');
    const icon = kind === 'motivational' ? '\ud83c\udf1f' : (kind === 'promotional' ? '\ud83c\udf81' : '\ud83d\udce2');
    const heading = kind === 'motivational' ? 'A Message From Meridian Capital Partners' : subject;
    for (const u of users) {
      const firstName = String(u.full_name || '').split(' ')[0];
      await notify(env, u.id, subject, body, icon, { email: u.email });
      await sendMail(env, u.email, subject,
        emailTemplate(heading,
          '<p>Dear ' + firstName + ',</p>' +
          '<div style="background:rgba(201,162,39,.10);border-left:3px solid #C9A227;padding:16px 18px;border-radius:8px;color:#e8eef5;">' + body.replace(/\n/g, '<br/>') + '</div>',
          ctaLabel, siteUrl + '/user/dashboard.html'));
    }
    await adminAlert(env, 'broadcast', null, 'Broadcast (' + kind + ') sent to ' + users.length + ' users: "' + subject + '"');
    return json({ message: 'Broadcast sent to ' + users.length + ' users', id: info.last_row_id, sent_to: users.length });
  }
  if (method === 'GET' && sub === 'broadcasts') {
    return json({ broadcasts: await all(env, 'SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT 100') });
  }

  if (method === 'GET' && sub === 'alerts') {
    const rows = await all(env, 'SELECT * FROM admin_alerts ORDER BY created_at DESC LIMIT 150');
    await run(env, 'UPDATE admin_alerts SET read=1');
    return json({ alerts: rows.map(function (r) { r.rel = relTime(r.created_at); return r; }) });
  }
  if (method === 'GET' && sub === 'outbox') {
    return json({ emails: await all(env, 'SELECT id,to_email,subject,status,error,created_at FROM email_outbox ORDER BY created_at DESC LIMIT 200') });
  }

  if (method === 'GET' && sub === 'settings') {
    return json({ settings: {
      smtp_host: await getSetting(env, 'smtp_host'), smtp_port: await getSetting(env, 'smtp_port'),
      smtp_user: await getSetting(env, 'smtp_user'), smtp_pass: await getSetting(env, 'smtp_pass'),
      smtp_from: await getSetting(env, 'smtp_from'), admin_notify_email: await getSetting(env, 'admin_notify_email'),
      site_url: await getSetting(env, 'site_url'), signup_bonus: await getSetting(env, 'signup_bonus'),
      referral_bonus: await getSetting(env, 'referral_bonus'),
      contact_name: await getSetting(env, 'contact_name'),
      contact_phone: await getSetting(env, 'contact_phone'), contact_mobile: await getSetting(env, 'contact_mobile'),
      contact_email: await getSetting(env, 'contact_email'),
      contact_address: await getSetting(env, 'contact_address'), contact_hours: await getSetting(env, 'contact_hours'),
      loan_fee_percent: await getSetting(env, 'loan_fee_percent'),
      crypto_first: await getSetting(env, 'crypto_first'),
      crypto_first_reason: await getSetting(env, 'crypto_first_reason'),
      resend_api_key: await getSetting(env, 'resend_api_key')
    } });
  }
  if (method === 'POST' && sub === 'settings' && seg[2] === 'test-email') {
    const to = await getSetting(env, 'admin_notify_email') || 'admin@meridianncapital.com';
    const r = await sendMail(env, to, 'Email test \u2014 Meridian Capital Partners',
      emailTemplate('Email Test', '<p>This is a test message from your Meridian Capital Partners admin dashboard. If you can read this, your email relay is working.</p>', null, null));
    return json({ message: r.sent ? 'Test email sent \u2014 check your inbox' : 'Saved to outbox (relay not configured or failed): ' + (r.reason || ''), sent: r.sent });
  }
  if (method === 'POST' && sub === 'settings') {
    const allowed = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'admin_notify_email', 'site_url', 'signup_bonus', 'referral_bonus',
      'contact_name', 'contact_phone', 'contact_mobile', 'contact_email', 'contact_address', 'contact_hours', 'loan_fee_percent', 'crypto_first', 'crypto_first_reason', 'resend_api_key'];
    const b = await readBody(request);
    for (const k of allowed) { if (b[k] !== undefined) await setSetting(env, k, b[k]); }
    return json({ message: 'Settings saved' });
  }

  if (method === 'POST' && sub === 'rules' && seg[2] === 'send') {
    const users = await all(env, "SELECT * FROM users WHERE role='user' AND status='active'");
    const subject = 'Meridian Capital Partners \u2014 Rules & Regulations (updated ' + RULES.updated + ')';
    const html = RULES.sections.map(function (s) {
      return '<h3 style="font-family:Georgia,serif;color:#E7CE6B;font-size:16px;margin:24px 0 8px 0;">' + s.title + '</h3>' +
             '<p style="color:#e8eef5;">' + s.body + '</p>';
    }).join('');
    const siteUrl = await getSetting(env, 'site_url');
    for (const u of users) {
      await notify(env, u.id, 'Rules & Regulations updated', 'We have sent the current Rules & Regulations to your email. Please take a moment to review them.', '\ud83d\udcdc', { email: u.email });
      await sendMail(env, u.email, subject,
        emailTemplate('Rules & Regulations',
          '<p>' + RULES.intro + '</p>' + html +
          '<p style="color:#9db0c4;font-size:13px;">You can also read the rules at any time on our website Rules & Regulations page.</p>',
          'Open My Dashboard', siteUrl + '/user/dashboard.html'));
    }
    await run(env, 'INSERT INTO broadcasts (subject,body,created_at) VALUES (?,?,?)', subject, RULES.intro + ' Full document emailed to your registered address \u2014 also available on the Rules & Regulations page.', nowMs());
    await adminAlert(env, 'rules', null, 'Rules & Regulations emailed to ' + users.length + ' users');
    return json({ message: 'Rules & Regulations sent to ' + users.length + ' users', sent_to: users.length });
  }

  if (method === 'GET' && sub === 'backup') {
    /* D1 export is handled by `wrangler d1 export`; return a JSON snapshot instead. */
    const tables = ['users', 'wallets', 'transactions', 'loans', 'notifications', 'messages', 'broadcasts', 'email_outbox', 'settings', 'admin_alerts'];
    const dump = { exported_at: new Date().toISOString(), tables: {} };
    for (const t of tables) dump.tables[t] = await all(env, 'SELECT * FROM ' + t);
    return new Response(JSON.stringify(dump, null, 2), {
      headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="meridian-capital-backup.json"' }
    });
  }

  return err('Not found', 404);
}
