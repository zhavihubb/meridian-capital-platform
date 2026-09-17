# Meridian Capital Partners — Deployment Status

**Status: LIVE on Cloudflare (free tier).** Only two user actions remain (nameservers + Resend domain).

---

## Live URLs

| What | URL |
|------|-----|
| Production site | https://meridian-capital-platform.pages.dev |
| Admin login | https://meridian-capital-platform.pages.dev/admin/login |
| Client login | https://meridian-capital-platform.pages.dev/login |
| Custom domain (after nameserver change) | https://meridianncapital.com |

---

## What was deployed

| Layer | Product | Free tier |
|-------|---------|-----------|
| Static site | Cloudflare Pages | Unlimited requests |
| API (`/api/*`) | Pages Functions (Workers) | 100,000 req/day |
| Database | Cloudflare D1 (SQLite) | 5 GB, 5M reads/day |
| TLS / CDN / DNS | Cloudflare | Free |
| Email | Resend HTTP API | 3,000 emails/month |

**Monthly cost: $0.**

---

## Cloudflare resources created

- **Account:** meridiann (`ee60a9acb24881dc655c53d1bdc1f85d`)
- **Pages project:** `meridian-capital-platform` (`9e64e8ff-9378-4529-b5a5-ed3983d367db`)
- **D1 database:** `meridian-capital-db` (`8d58c786-872d-4b31-a13f-08b088da1419`) — 10 tables
- **Zone:** `meridianncapital.com` (`c9273a2f441d679415d8777d92817d14`)
- **DNS:** apex + www CNAME → `meridian-capital-platform.pages.dev` (proxied)
- **Secrets set:** `JWT_SECRET`, `ADMIN_PASSWORD`, `RESEND_API_KEY`

---

## Admin credentials

- **Email:** `admin@meridianncapital.com`
- **Password:** `MeridianAdmin2026!Secure`

> Change the password any time with:
> `echo "NewPassword" | npx wrangler pages secret put ADMIN_PASSWORD --project-name=meridian-capital-platform`

---

## Verified working (live)

- Static pages (index, about, login, register, admin, user dashboard, CSS, JS) — 200
- `/api/health`, `/api/site`, `/api/wallets` — 200
- Admin login → JWT issued, role=admin
- Signup → user created, **£150 welcome bonus** credited
- Admin stats / users / outbox / alerts — 200
- Email relay → reaches Resend (fails only until domain verified in Resend)
- Unknown API route → 404

## Feature build (admin tx, wallets, support, plans) — LIVE

| Feature | Endpoint(s) | Status |
|---------|-------------|--------|
| Admin generate SINGLE transaction (any type, custom/back-date) | `POST /api/admin/transactions` | ✅ |
| Admin generate RANDOM transactions (year range, as far back as needed) | `POST /api/admin/transactions/random` | ✅ |
| Admin edit crypto wallets | `GET/POST/PUT/DELETE /api/admin/wallets` | ✅ |
| Users see crypto wallets on Deposit tab | `GET /api/wallets` | ✅ |
| User → support messaging | `GET/POST /api/messages` | ✅ |
| Admin → reply to any user | `GET /api/admin/chats`, `POST /api/admin/chats/:id/reply` | ✅ |
| Admin notified (email + dashboard alert) on new support message | `admin_alerts` + Resend | ✅ |
| Admin notified (email) on new signup | Resend "New signup — {name}" | ✅ |
| Investment plans (5 seeded) + admin CRUD | `GET /api/plans`, `GET/POST/PUT/DELETE /api/admin/plans` | ✅ |
| User subscribes to a plan (balance deducted, ROI tracked) | `GET/POST /api/subscriptions` | ✅ |

### Seeded investment plans

| Plan | ROI | Duration | Range | Risk |
|------|-----|----------|-------|------|
| 🌱 Starter Growth | 4.5% | 30 days | £100 – £4,999 | Low |
| ⚖️ Balanced Income | 7.5% | 60 days | £5,000 – £24,999 | Medium |
| 🚀 Premium Growth | 11.0% | 90 days | £25,000 – £99,999 | Medium-High |
| 👑 Elite Portfolio | 15.5% | 180 days | £100,000 – £499,999 | High |
| 🏦 Institutional | 20.0% | 365 days | £500,000+ | High |

> Plans are fully editable from **Admin → Plans** (add / edit / hide / delete).

---

## ⚠️ Two actions only you can do

### 1. Point the domain at Cloudflare (required for meridianncapital.com)

1. Log in at **GO54 Limited** → domain management → **meridianncapital.com** → **Nameservers**.
2. Replace `NSC.GO54.COM` / `NSD.GO54.COM` with:
   - `aida.ns.cloudflare.com`
   - `huxley.ns.cloudflare.com`
3. Save. Propagation takes minutes to a few hours.
4. Cloudflare will auto-issue TLS and the custom domain flips to **Active**.

### 2. Verify the domain in Resend (required for real email delivery)

1. Log in at https://resend.com → **Domains** → **Add Domain** → `meridianncapital.com`.
2. Add the DNS records Resend shows (SPF/DKIM) in Cloudflare → DNS.
3. Click **Verify**. Emails then send for real (currently they queue in the admin Outbox).

---

## Day-to-day commands

```bash
cd eurofiducia-uk
npm run dev            # local dev (http://localhost:8788)
npm run deploy         # rebuild + redeploy to Cloudflare
npm run db:export      # full SQL backup of the remote D1
```

## Repo

https://github.com/zhavihubb/meridian-capital-platform
