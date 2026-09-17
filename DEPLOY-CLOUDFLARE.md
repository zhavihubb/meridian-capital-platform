# Deploying Meridian Capital Partners on Cloudflare (100% Free)

This project runs entirely on Cloudflare's **free tier** — no Railway, no Render, no monthly fees.

| Layer | Cloudflare product | Free tier |
|-------|--------------------|-----------|
| Static site (HTML/CSS/JS) | **Cloudflare Pages** | Unlimited requests, 500 builds/month |
| API (`/api/*`) | **Pages Functions** (Workers) | 100,000 requests/day |
| Database | **Cloudflare D1** (SQLite) | 5 GB storage, 5M reads/day |
| TLS / CDN / DNS | Cloudflare | Free |
| Email (optional) | **Resend** HTTP API | 3,000 emails/month free |

> **Why not the old Express server?** The original backend used `better-sqlite3` (a native
> filesystem module) which cannot run on Cloudflare Workers. It has been fully ported to a
> Pages Function using **D1** (SQLite) and **Web Crypto** (JWT + PBKDF2 password hashing).
> All ~50 API routes behave identically.

---

## What you need

1. A **Cloudflare account** (free) — https://dash.cloudflare.com/sign-up
2. The domain **meridianncapital.com** (already registered at GO54 Limited)
3. Node.js 20+ locally (for the CLI) — or use the Cloudflare dashboard

---

## Step 1 — Install & log in

```bash
cd eurofiducia-uk
npm install
npx wrangler login          # opens a browser to authorise the CLI
```

## Step 2 — Create the D1 database

```bash
npx wrangler d1 create meridian-capital-db
```

Copy the printed `database_id` into **`wrangler.toml`**:

```toml
[[d1_databases]]
binding = "DB"
database_name = "meridian-capital-db"
database_id = "PASTE-THE-ID-HERE"
```

## Step 3 — Create the tables (remote D1)

```bash
npx wrangler d1 execute meridian-capital-db --file=./schema.sql --remote
```

## Step 4 — Set production secrets

```bash
# A long random string used to sign login tokens
npx wrangler pages secret put JWT_SECRET

# The admin login password (email is set in wrangler.toml → ADMIN_EMAIL)
npx wrangler pages secret put ADMIN_PASSWORD
```

> The admin account is auto-created on first request using `ADMIN_EMAIL` + `ADMIN_PASSWORD`.
> Default email: `admin@meridianncapital.com`.

## Step 5 — Build & deploy

```bash
npm run build      # copies the static site into ./dist
npm run deploy     # wrangler pages deploy dist --project-name=meridian-capital-platform
```

The first deploy creates the Pages project. You'll get a URL like
`https://meridian-capital-platform.pages.dev`.

## Step 6 — Connect the domain

**Option A — move DNS to Cloudflare (recommended, fully free):**

1. Cloudflare dashboard → **Add a site** → enter `meridianncapital.com` → Free plan.
2. Cloudflare shows two nameservers (e.g. `xxx.ns.cloudflare.com`).
3. Log in at **GO54 Limited** → domain management → **Nameservers** → replace
   `NSC.GO54.COM` / `NSD.GO54.COM` with the two Cloudflare nameservers.
4. Wait for propagation (minutes to a few hours).
5. In Cloudflare → **Workers & Pages** → your project → **Custom domains** →
   add `meridianncapital.com` and `www.meridianncapital.com`.

**Option B — keep GO54 DNS:** add a `CNAME` record for `www` → your `*.pages.dev`
hostname, and a redirect for the apex. (Option A is simpler and gives free CDN + TLS.)

## Step 7 — Verify

- Visit `https://meridianncapital.com` → the marketing site loads.
- Visit `https://meridianncapital.com/admin/login.html` → log in with the admin email/password.
- Register a test user → confirm the £150 welcome bonus appears.

---

## Email (optional, free)

Cloudflare Workers cannot speak raw SMTP. The platform **always** saves every email to the
admin **Outbox** (visible in the dashboard). To actually deliver email:

1. Create a free account at https://resend.com (3,000 emails/month).
2. Verify your sending domain.
3. In the admin dashboard → **Settings** → paste the **Resend API key** → Save.

Emails then send via Resend's HTTP API. Without a key, everything still works — messages
just queue in the Outbox.

---

## Day-to-day commands

```bash
npm run dev            # local dev server with a local D1 (http://localhost:8788)
npm run db:init:local  # create tables in the local D1
npm run db:export      # download a full SQL backup of the remote D1
npm run deploy         # rebuild + redeploy
```

## Backups

- **Admin dashboard → Backup** downloads a JSON snapshot of every table.
- `npm run db:export` produces a full `.sql` dump from Cloudflare.

## Architecture notes

- `functions/api/[[path]].js` — the entire API (catch-all router).
- `functions/_lib/crypto.js` — JWT (HS256) + PBKDF2 password hashing via Web Crypto.
- `functions/_lib/countries.js` — country → currency map (GBP base).
- `schema.sql` — D1 schema.
- `scripts/build.mjs` — copies only the static site into `dist/` (never `server/`).
- `dist/_routes.json` — routes only `/api/*` through Functions; everything else is static.

The original Express server (`server/server.js`) is kept for reference / self-hosting but is
**not** used by the Cloudflare deployment.
