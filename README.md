# GPUIQ

**GPU marketplace intelligence + host automation.** GPUIQ has two halves:

1. **Public Market Intelligence** — a live supply/demand/pricing hub for the GPU
   marketplace, free and login-free. What rents, for how much, and how fast.
2. **Per-host automation** — once a host connects their own provider key, GPUIQ
   reads *their* fleet and earnings, shows where their rigs sit in the market,
   and (later) reprices for them.

The product becomes powerful at the moment a guest, having seen the real Market
Intelligence hub for free, hands over their own key and lets GPUIQ work for them.

---

## The two-key model (read this first)

There are **two kinds of key, with two jobs, two owners, two trust levels.**

| | Platform key | User key |
|---|---|---|
| Owner | The company (admin) | Each registered user |
| Count | One per provider | One per provider per user |
| Job | Powers the public **Market Observer** (read-only marketplace polling) | Reads that user's **fleet / earnings**, writes their **prices** |
| Touches user rigs? | **Never** | Only that one user's own rigs |
| Stored | Admin Console only | User's own Settings only |
| Table | `platform_provider_keys` | `user_provider_keys` |

The Observer is **exclusively platform-key-driven** — a user key never feeds the
shared market dataset. Both kinds are encrypted at rest (Fernet, key derived from
`SECRET_KEY`), validated before storage (`show_user()`), masked in every response,
and every decrypt-and-use is written to `key_access_audit` (never the key value).

> A second platform key slot for **RunPod** exists in the Admin Console, and a
> RunPod user-key input exists in Settings — both encrypted-storage-ready but
> **inactive**: no RunPod polling/adapter runs yet. `market_source` columns and a
> reserved RunPod color token are in place so it drops in without a redesign.

---

## The Observer's confirmed-rental detection — do not regress this

The single most valuable piece of logic in the system, and a constraint on every
future change:

Vast's `search offers` endpoint returns a **randomized sample**, not an
exhaustive listing. So **absence is not evidence** — an offer vanishing between
polls usually means it wasn't sampled, not that it was rented. Absence-based
"clearing detection" is pure noise.

Instead, the Observer polls **both** the available set (`rentable=true`) and the
unavailable set (`rentable=false`) each cycle, and records a **confirmed rental**
only as an **observed state transition**: an offer seen as *available* and later
seen as *unavailable*. Sampling can make us miss rentals (false negatives) but
never invent them (no false positives) — every recorded event is a positively
observed transition.

**Any future change to clearing/rental detection must preserve this two-set
polling + transition approach.** Do not silently swap back to absence-based
detection because it looks simpler. (See `apps/api/services/observer.py`.)

---

## Surfaces

| Surface | Visibility |
|---|---|
| Market Intelligence (homepage `/`) | **Public** — no login |
| Dashboard | Signed-in |
| Earnings & Financials | Signed-in |
| Fleet Health | Signed-in (real machines vs `is_simulated` rigs are visibly distinct) |
| Pricing Control / Offer Management / Analytics | Signed-in (stubs) |
| Alerting | Signed-in (offer-expiry) |
| Simulator, Settings | Signed-in |
| Admin Console (`/admin`) | **Separate** admin login, separate cookie scope |

Private routes are gated **server-side** in `apps/web/middleware.ts` — direct
navigation to a gated route redirects to sign-in with no flash of content.

---

## Tech stack

| Layer | Stack |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind, React Query, Zustand |
| Backend | FastAPI, SQLAlchemy, Alembic, PostgreSQL, Redis |
| Workers | Celery + Celery Beat (Redis broker) |
| Auth | Opaque session tokens (hashed at rest), bcrypt passwords; separate user/admin cookie scopes |
| Vast SDK | `vastai` **1.1.3** (pinned — 0.2.7 is broken) |
| Infra | Docker Compose |

---

## Quick start (one command)

Prerequisites: Docker + Docker Compose v2.

```bash
# 1. Configure environment
cp .env.example .env

# Generate a SECRET_KEY (encrypts stored provider keys at rest):
python3 -c "import secrets; print('SECRET_KEY=' + secrets.token_urlsafe(48))" >> .env
#   …then edit .env: set that SECRET_KEY, and set ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD.

# 2. Bring up the full stack (db, redis, api, worker, beat, web)
docker compose up -d

# 3. Open the dashboard
#    http://localhost:8111   (or http://<host-lan-ip>:8111 from another machine)
```

`docker compose up` runs Alembic migrations automatically, launches the API, the
Celery worker + beat (the **Market Observer** starts polling immediately), and the
Next.js dashboard on port **8111**. On first boot the API **seeds one admin** from
`ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` (idempotent — skipped if an admin
already exists). **Real admin credentials live only in the untracked `.env`.**

Health through the proxy: `curl http://localhost:8111/api/health`

---

## End-to-end demo: guest → signup → connect key → your own data

On the LAN (`http://<host-ip>:8111`):

1. **Guest.** Land on `/` — the live Market Intelligence hub, no login, with a
   "see where your rig ranks" sign-up CTA. Try navigating directly to `/fleet`:
   you're redirected to `/login` (no protected content flashes).
2. **Admin (one-time).** Go to `/admin/login`, sign in with the seeded admin.
   Under **Platform Vast key**, paste the company Vast key — it validates and the
   Observer polls with it. (The migration also seeds this from the pre-existing
   account, so polling never gaps.) The RunPod slot accepts a key, stores it
   encrypted, stays inactive.
3. **Sign up.** Back on the app, `/signup` → you land on `/dashboard` with full
   nav.
4. **Connect your key.** **Settings → Vast.ai** → paste your personal Vast key.
   It validates (`show_user()`), encrypts, stores, detects scopes, and kicks an
   initial sync — your machines and earnings appear within ~60s, attributed to
   your `user_provider_keys` row (pre-migration data is backfilled onto it).
5. **See your own data.** Fleet Health, Earnings, and the signed-in Market hub now
   overlay *your* rigs. A second user with a different key sees only their own
   machines (scoping is enforced at the query level, not just the UI).
6. **Disconnect.** Settings → Disconnect halts that user's scheduled syncs and
   deletes the key row; history is retained (ownership set null), not destroyed.

### Connecting a Vast key — scoped permissions

When you create a restricted Vast key, grant only:

- **Machine read** — sync your fleet & utilization
- **Machine write / pricing** — let GPUIQ adjust your prices (used later)
- **Billing read** — sync earnings & balance

**Do NOT grant billing-write or key-management permissions.** GPUIQ never needs
them; omitting them limits the blast radius if a key ever leaks. Settings links
straight to Vast's key page and repeats this warning.

---

## Environment variables

See [`.env.example`](.env.example). Key ones:

| Variable | Purpose |
|---|---|
| `SECRET_KEY` | **Required.** Encrypts stored platform + user keys at rest |
| `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` | Seed the first admin on boot (untracked `.env` only) |
| `DATABASE_URL` | Postgres (SQLAlchemy + psycopg) |
| `REDIS_URL` | Celery broker / result backend |
| `API_INTERNAL_URL` | Internal API host the Next.js proxy forwards `/api/*` to |
| `VAST_API_KEY` | Optional legacy single-account key (validated on startup) |
| `ALLOW_ALL_CORS`, `WEB_PORT` | Dev flag; dashboard port (default 8111) |

---

## Local development (without Docker)

```bash
pnpm install
pnpm --filter @vasthost/web dev    # dashboard on 0.0.0.0:8111

cd apps/api                        # needs local Postgres + Redis + populated .env
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
celery -A worker.celery_app worker --loglevel=info
celery -A worker.celery_app beat --loglevel=info
```

(The JS workspace scope is still `@vasthost/*` internally; only user-facing
naming is GPUIQ.)

---

## Migrations

Additive only. `0001`/`0002` (Phase 0) are never collapsed. `0003` adds the auth +
two-key tables, a nullable `user_provider_key_id` on the private pool (SET NULL on
disconnect → history retained), the `market_source` seam on the Observer tables,
and `is_simulated` on simulated rigs — and seeds the platform key from any
pre-existing account so the Observer never gaps.

---

## Status

Migration to the GPUIQ architecture (two-key model, public/private surfaces,
multi-tenant auth, admin console) complete. Stack builds; `docker compose up`
smoke test runs on a Docker-enabled host.
