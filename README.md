# Meridian Capital Partners — Investment Platform

A UK-focused investment platform (Meridian design system) with a **real
server-side backend** for permanent, shared data storage.

## Run it

```bash
cd server
npm install
npm start
```

Open **http://localhost:3000**

- Website: http://localhost:3000/
- Client login: http://localhost:3000/login.html
- Client register: http://localhost:3000/register.html
- Admin login: http://localhost:3000/admin/login.html

**Admin credentials:** `admin@meridiancapital.co.uk` / `admin123`

## Architecture

- **Frontend** — static HTML/CSS/JS in this folder. Pages call the backend via
  `assets/js/api.js` (`EV.api.*`), storing the JWT in `localStorage`.
- **Backend** — `server/` (Express + SQLite + JWT + Socket.IO + Nodemailer).
  Serves the static site *and* the `/api/*` endpoints. See
  [`server/README.md`](server/README.md) for full details.

## Data persistence

All user data (accounts, balances, transactions, loans, referrals, messages,
notifications) lives in **`server/data/platform.db`** (SQLite). It is shared
across every device and browser and survives restarts/redeploys as long as the
`server/data` directory is preserved. Automatic backups are written to
`server/data/backups/`.

## UK localisation

GBP (£) base currency, £150 signup bonus, £50 referral reward, 5% loan
arrangement fee, FCA / FSCS / ICO references, Faster Payments, sort code /
IBAN / BIC (`MCUKGB2L`), England & Wales governing law, Financial Ombudsman.
All countries are still supported with local currency display.
