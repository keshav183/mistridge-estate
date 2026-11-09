# deployment.md — Mistridge Estate

One root folder: `backend/` (Node + Express + MongoDB) and `frontend/` (React + Vite).

## 1. Run locally (no MongoDB, no config needed)

Needs only Node 20+.

```bash
git clone <repo-url> mistridge-estate && cd mistridge-estate
npm run install:all     # installs root, backend and frontend
npm run dev             # API on :4000 and the website on :5173
```

Open **http://localhost:5173**.

* **MongoDB is optional.** With no `MONGODB_URI`, the API starts an *embedded* MongoDB and keeps its files in `backend/.data`, so data survives restarts. The first run downloads the MongoDB binary once (about 70 MB), then starts in a few seconds.
* **Demo data loads itself** the first time (rooms, 400 days of rates, promo codes, sample bookings, the sample enquiries). Reset: stop the server, delete `backend/.data`, start again. (`npm run seed` also wipes and reloads.)
* **Use your own MongoDB instead:** copy `backend/.env.example` to `backend/.env` and set `MONGODB_URI` (local `mongod`, Docker, or Atlas).
* **AI (Gemini):** every enquiry is routed by the AI router. Out of the box it runs on the built-in rules engine. To switch on Gemini, copy `backend/.env.example` to `backend/.env`, put your real key in `GEMINI_API_KEY=` (free key from Google AI Studio) and restart; the terminal then says `AI: Gemini + rules`.
* **All secrets default to `hello123`** (`JWT_SECRET`, `INGEST_KEY`, `SEED_PASSWORD`, `GEMINI_API_KEY`), so no `.env` is needed locally. `GEMINI_API_KEY=hello123` means "no real key". Change every one of them for a real deployment.

```bash
npm test          # 29 unit tests, no database needed
npm run smoke     # 22 end-to-end checks against the running API (restart the API before re-running: public endpoints are rate limited)
```

**Production-style, single origin:** `npm run build && npm start` serves the built website from the API on :4000 (set `NODE_ENV=production`, `JWT_SECRET`, `MONGODB_URI`, and put HTTPS in front).

## 2. How it is deployed

One Node web service serves both the API and the built React app (single origin, first-party cookie, no CORS). MongoDB is MongoDB Atlas. `render.yaml` is a ready Render blueprint:

* build: `npm --prefix backend install --omit=optional && npm --prefix frontend install && npm run build` (the embedded database is not installed in production)
* start: `npm start`, health check `/api/health`
* after the first deploy, run `npm run seed` once in the service shell to load the demo data

Live app: _add URL here after deploying_

## 3. Environment variables (names only)

| Variable | Needed | Purpose |
|---|---|---|
| `MONGODB_URI` | production | MongoDB connection string. Empty = embedded MongoDB (local only) |
| `JWT_SECRET` | production | Signs session cookies (demo default `hello123`; change it in production) |
| `NODE_ENV` | production | `production` enables Secure cookies and upgrade-insecure-requests |
| `GEMINI_API_KEY` | optional | Turns on the Gemini layer of the enquiry router (`hello123` = off) |
| `GEMINI_MODEL` | optional | Defaults to `gemini-2.5-flash` |
| `INGEST_KEY` | optional | Shared secret for the simulated WhatsApp/email webhook (header `x-ingest-key`; demo `hello123`) |
| `AI_CONFIDENCE_THRESHOLD` | optional | Below this, an enquiry goes to the GM's Unsorted lane (default 0.6) |
| `PORT`, `DATA_DIR`, `CLIENT_ORIGIN`, `SEED_PASSWORD` | optional | Port, embedded DB folder, dev-only CORS origin, demo password (default `hello123`) |

No secrets are in the repository; `.env` and `.data` are git-ignored.

## 4. Demo logins (staff; guests book without an account)

Password for all: **`hello123`**

| Role | Email | Can do |
|---|---|---|
| General Manager | gm@mistridge.test | Everything; owns the Unsorted and Complaint lanes |
| Reservations | reservations@mistridge.test | Rates, allotment, blackouts, promos, bookings, export, inbox |
| Sales | sales@mistridge.test | Enquiry inbox (weddings and offsites) |

Sign in at `/login` (the "Staff" link in the header). **Test cards:** `4242 4242 4242 4242` succeeds; `4000 0000 0000 0002` is declined. Any future expiry, any 3-digit code.

## 5. Suggested 5-minute review path
0. Guest side: use the **Enquiry** tab on the right edge of the home page to send a message such as "Is a villa free 14-16 Nov for 2 adults and a child?"; sign in as staff and see it already routed in the inbox.
1. Home: pick dates, open *Planter's Villa*, choose a rate plan, Reserve, three steps, confirmation. Look the booking up again from "My booking".
2. Sign in as Reservations, *Rates & allotment*: click a night, set allotment to what is already sold, then try to book it as a guest: it is refused. Block a date: it disappears from the guest calendar.
3. *Enquiry inbox*: the three sample enquiries from the brief are already routed (Wedding, Room, Offsite). Open one, read the AI reading, edit the draft, Send (simulated).
4. *Simulate an inbound message*: send the complaint sample (Complaint lane, GM alert) and "hi do you have something nice for the long weekend?" (Unsorted lane). Re-route in one click.
5. *Bookings*: download the daily CSV export.
