# deployment.md — Mistridge Estate

Repo layout: one root folder with `backend/` (Express + MongoDB) and `frontend/` (React + Vite).

## 1. Run locally

Needs Node 20+ and a MongoDB (local `mongod`, Docker, or a free Atlas cluster).

```bash
git clone <repo-url> mistridge-estate && cd mistridge-estate
npm run install:all                      # installs backend and frontend

cp backend/.env.example backend/.env     # then edit it:
#   JWT_SECRET  -> run: openssl rand -hex 32
#   MONGODB_URI -> e.g. mongodb://127.0.0.1:27017/mistridge
#   ANTHROPIC_API_KEY is optional (see "AI modes")

npm run seed                             # demo data: rooms, 400 days of rates, promos, bookings, enquiries
npm run dev:api                          # terminal 1 -> http://localhost:4000
npm run dev:web                          # terminal 2 -> http://localhost:5173  (proxies /api to :4000)
npm test                                 # 28 unit tests (no database needed)
```

Open http://localhost:5173. Running the seed again resets all data.

**Production-style, single origin:** `npm run build && npm start` serves the built React app from the API on :4000. (Use HTTPS in front of it; session cookies are `Secure` when `NODE_ENV=production`.)

### AI modes
- **No `ANTHROPIC_API_KEY`:** the built-in rules engine classifies, extracts and drafts. Everything works.
- **With a key:** Claude classifies and writes the draft prose; its output is schema-validated, cross-checked against the rules engine, and any draft containing a price is discarded. Any failure falls back to the rules engine.

## 2. How it is deployed

One Node web service serves the API and the static React build (single origin, first-party cookie, no CORS). MongoDB runs on MongoDB Atlas.
`render.yaml` is a ready blueprint for Render: build `npm run install:all && npm run build`, start `npm start`, health check `/api/health`. After the first deploy, run `npm run seed` once against the production database (Render shell) to load the demo data.

Live app: _add URL here after deploying_

## 3. Environment variables (names only)

| Variable | Needed | Purpose |
|---|---|---|
| `MONGODB_URI` | yes | MongoDB connection string |
| `JWT_SECRET` | yes | Signs session cookies (32+ chars) |
| `NODE_ENV` | yes in prod | `production` enables Secure cookies and strict CSP |
| `PORT` | no | Defaults to 4000 |
| `ANTHROPIC_API_KEY` | no | Turns on the Claude layer of the enquiry router |
| `ANTHROPIC_MODEL` | no | Model name for the router |
| `INGEST_KEY` | no | Shared secret for the simulated WhatsApp/email webhook header `x-ingest-key` |
| `AI_CONFIDENCE_THRESHOLD` | no | Below this, an enquiry goes to the GM's Unsorted lane (default 0.6) |
| `CLIENT_ORIGIN` | dev only | Only if the frontend is served from another origin in development |
| `SEED_PASSWORD` | seed only | Password given to demo accounts |

No secrets are committed; `.env` is git-ignored.

## 4. Demo logins

All demo accounts are created by `npm run seed`. Password for every account: **`Demo@1234`** (unless `SEED_PASSWORD` was changed).

| Role | Email | Can do |
|---|---|---|
| General Manager | gm@mistridge.test | Everything; owns Unsorted and Complaint lanes |
| Reservations | reservations@mistridge.test | Rates, allotment, blackouts, promos, bookings, export, inbox |
| Sales | sales@mistridge.test | Enquiry inbox (weddings and offsites) |
| Guest | guest@mistridge.test | See own stays (guests can also book without an account) |

The login page has a "Reviewer demo accounts" shortcut that fills the email.

**Test cards (mock gateway):** `4242 4242 4242 4242` succeeds; `4000 0000 0000 0002` is declined; `4000 0000 0000 9995` is "insufficient funds". Any future expiry, any 3-digit code.

## 5. Suggested 5-minute review path
1. Home → pick dates (e.g. 14–16 Nov) → open *Planter's Villa* → choose a rate plan → Reserve → 3 steps → confirmation.
2. Sign in as Reservations → *Rates & allotment*: set a night's allotment equal to what is sold, then try to book it as a guest: the site refuses (sold out). Block a date; it disappears from the calendar.
3. *Enquiry inbox*: the three sample enquiries from the brief are routed (Wedding, Room, Offsite); open one, read the AI reading, edit the draft, send (simulated).
4. Use *Simulate an inbound message* with the complaint sample → Complaint lane, GM bell alert. Send "hi do you have something nice for the long weekend?" → Unsorted lane. Re-route in one click.
5. *Bookings* → Download CSV for today (the daily reservation-system export).
