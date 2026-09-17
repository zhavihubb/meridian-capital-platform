# Meridian Capital Partners — Platform Backend

Express + SQLite + JWT + Socket.IO + Nodemailer backend for the Meridian Capital Partners
investment platform. Provides **real, server-side, permanent storage** shared
across every device and browser — replacing the earlier client-only
`localStorage` demo.

## Quick start

```bash
cd server
npm install
npm start          # or: node server.js
```

Then open **http://localhost:3000**

| Area            | URL                              |
|-----------------|----------------------------------|
| Website         | http://localhost:3000/           |
| Client login    | http://localhost:3000/login.html |
| Client register | http://localhost:3000/register.html |
| Admin login     | http://localhost:3000/admin/login.html |

**Default admin credentials**

```
email:    admin@meridiancapital.co.uk
password: admin123
```

> Change these before going live (see *Production hardening* below).

## What it does

- **Accounts** — signup with a **£150 welcome bonus**, login, forgot/reset
  password, change password. Passwords hashed with bcrypt (10 rounds).
- **Auth** — JWT bearer tokens (7-day expiry) issued on signup/login.
- **Wallets & balances** — per-user GBP balance, sort code / account number /
  IBAN / BIC generated on signup (BIC `MCUKGB2L`).
- **Transactions** — deposits, withdrawals, bonuses, referral rewards, profits.
  Deposits/withdrawals are created `pending` and only move money when an admin
  approves them.
- **Loans** — 12 loan products, 5% arrangement fee, admin approve/decline.
- **Referrals** — unique code per user, **£50 reward** when a referred user
  signs up.
- **Support chat** — user ↔ admin messaging with Socket.IO live delivery.
- **Notifications & broadcasts** — per-user notifications and platform-wide
  broadcasts.
- **Email outbox** — every email is recorded in `email_outbox`; configure SMTP
  in Admin → Settings to actually send.
- **Admin console** — stats, clients (KYC/status/credit), transactions
  (approve/decline/reverse/create), loans, chats, outbox, settings, DB backup.
- **Rules & Regulations** — 12 UK-specific sections, emailable to all clients.

## Data & persistence

- SQLite database at `server/data/platform.db` (WAL journal mode).
- Automatic backups to `server/data/backups/` on boot and every 6 hours
  (keeps the 10 most recent).
- Data survives server restarts and redeploys **as long as the `server/data`
  directory is preserved**. Back it up (Admin → *Download DB Backup*, or copy
  the folder) before redeploying.

## Configuration (environment variables)

| Variable     | Default                                        | Purpose                    |
|--------------|------------------------------------------------|----------------------------|
| `PORT`       | `3000`                                         | HTTP port                  |
| `JWT_SECRET` | `meridian-capital-dev-secret-change-me-in-prod`  | Token signing secret       |

## Production hardening checklist

1. Set a strong `JWT_SECRET` (e.g. `openssl rand -hex 32`).
2. Change the admin password (Admin → Settings, or update the seed).
3. Configure SMTP in Admin → Settings so real emails are sent.
4. Put the app behind HTTPS (reverse proxy such as Nginx/Caddy).
5. Persist `server/data/` on a durable volume and schedule off-site backups.
6. Set `site_url` in Admin → Settings to your public domain.

## API surface (summary)

Public: `POST /api/leads`, `POST /api/signup`, `POST /api/login`,
`POST /api/forgot-password`, `POST /api/reset-password`, `GET /api/wallets`,
`GET /api/rules`, `GET /api/health`.

Authenticated: `GET /api/me`, `GET /api/transactions`, `POST /api/deposits`,
`POST /api/withdrawals`, `GET|POST /api/loans`, `GET /api/referrals`,
`GET|POST /api/messages`, `GET /api/notifications`, `GET /api/broadcasts`,
`POST /api/change-password`.

Admin (`/api/admin/*`): `stats`, `users`, `users/:id/status`,
`users/:id/kyc`, `transactions` (+ `:id/approve|decline|reverse`, `POST`),
`loans` (+ `:id/approve|decline`), `wallets` (CRUD), `chats` (+ `:userId`,
`:userId/reply`), `broadcasts`, `alerts`, `outbox`, `settings`
(+ `test-email`), `rules/send`, `backup`.
