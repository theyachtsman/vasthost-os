# VastHost OS

**A host-side GPU business intelligence platform** — the primary daily interface for serious Vast.ai GPU hosts.

Vast.ai's dashboard answers: *what is my machine doing right now?*

VastHost OS answers:

- *What is the market doing and where do I sit in it?*
- *How much have I actually made, after fees and power?*
- *Is my pricing costing me rentals or leaving margin on the table?*
- *What should I do next, and why?*

The goal: **the user spends their time here, not on Vast's dashboard.**

---

## Surfaces

| # | Surface | What it replaces |
|---|---|---|
| 1 | Market Intelligence | Vast's non-existent host market view |
| 2 | Earnings & Financials | Vast's buried earnings tab |
| 3 | Fleet Health & Utilization | Vast's machine list |
| 4 | Pricing Control Center | Manual price editing on Vast |
| 5 | Offer Management | Scattered CLI commands |
| 6 | Analytics & Insights | Nothing — Vast has none |

## Operating principle (non-negotiable)

> Every phase ends in a usable, deployable product. Do not begin a later phase until the previous one is stable, demoed, and committed.

The **Market Observer starts in Phase 0 and never stops.** The demand dataset cannot be backfilled — every poll that doesn't run is data that's gone forever.

---

## Tech stack (locked)

| Layer | Stack |
|---|---|
| Frontend | Next.js 15+ (App Router), TypeScript, TailwindCSS, ShadCN UI, React Query, Zustand |
| Backend | FastAPI, SQLAlchemy, Alembic, PostgreSQL, Redis |
| Workers | Celery + Celery Beat (Redis broker) |
| Vast SDK | `vastai` Python package |
| Infra | Docker, Docker Compose, Nginx |

## Monorepo structure

```text
repo/
  apps/
    web/          # Next.js 15 dashboard
    api/          # FastAPI
    worker/       # Celery workers + beat scheduler
  packages/
    ui/           # shared ShadCN primitives
    shared-types/ # TypeScript types derived from API schemas
  infrastructure/
    docker/
    nginx/
  docs/
  scripts/
```

## Networking (hard requirement)

Dashboard runs on **port 8111**, reachable from **any LAN browser**.

- Next dev binds `0.0.0.0`: `"dev": "next dev -H 0.0.0.0 -p 8111"`
- No hardcoded `localhost` in client code — same-origin proxy via `next.config.js` rewrites; client always calls `/api/...`.
- Docker Compose maps `"8111:8111"`.
- FastAPI CORS allows all origins in dev, gated by `ALLOW_ALL_CORS=true`.
- Host firewall: `ufw allow 8111/tcp` (see `docs/lan-access.md`).

**Acceptance:** a second LAN machine opens `http://<host-ip>:8111`, the dashboard loads, and the health widget reads live.

## Environment variables

```bash
# Vast
VAST_API_KEY=                       # user's personal Vast account key

# Observer — initial watched class
VAST_OBSERVER_DEFAULT_GPU=RTX_4090
VAST_OBSERVER_DEFAULT_NUM_GPUS=1

# App
API_INTERNAL_URL=http://api:8000
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/vasthost
REDIS_URL=redis://redis:6379/0
SECRET_KEY=                         # for encrypting stored API keys

# Dev flags
ALLOW_ALL_CORS=true
```

---

## Phased roadmap

| Phase | Deliverable |
|---|---|
| **0** | Foundation + real Vast data + Observer live + all six surface stubs |
| **1** | Pricing Control Center — recommend-only |
| **2** | Bounded auto-repricing against simulated host within configured rails |
| **3** | Offer Management surface (bulk ops, expiry alerts, backfill config) |
| **4** | Demand-curve engine (data-gated) |
| **5** | Analytics & Insights surface |
| **6** | Real host adapter |
| **7** | Multi-tenant SaaS |
| **8** | Multi-provider expansion (RunPod + others) |

The full build specification, including the complete database schema, Vast API field
reference, Celery worker schedule, FastAPI endpoint surface, and the Phase 0
Definition of Done, lives in [`docs/BUILD_SPEC.md`](docs/BUILD_SPEC.md).

---

## Quick start (one command)

Prerequisites: Docker + Docker Compose v2.

```bash
# 1. Configure environment
cp .env.example .env
# Generate a SECRET_KEY (used to encrypt your stored Vast API key at rest):
python3 -c "import secrets; print('SECRET_KEY=' + secrets.token_urlsafe(48))" >> .env
#   …then edit .env and set that SECRET_KEY value (and optionally VAST_API_KEY).

# 2. Bring up the full stack (db, redis, api, worker, beat, web)
docker compose up -d

# 3. Open the dashboard
#    http://localhost:8111   (or http://<host-lan-ip>:8111 from another machine)
```

`docker compose up` starts Postgres + Redis, runs Alembic migrations
automatically, launches the FastAPI API, the Celery worker + beat scheduler
(the **Market Observer** begins polling immediately), and the Next.js dashboard
on port **8111**.

Check health through the proxy:

```bash
curl http://localhost:8111/api/health
```

### Connect your Vast account

1. Open the dashboard → **Settings**.
2. Paste your Vast.ai API key and click **Connect**. The key is validated
   against Vast (`show_user`), stored **encrypted at rest**, and an initial
   fleet + earnings sync kicks off — your machines and earnings appear within
   ~60 seconds.
3. Under **Observer — Watched GPU Classes**, add the `(gpu_name, num_gpus,
   region)` tuples you want the Market Observer to track. The demand dataset
   **cannot be backfilled**, so add the classes you care about early.

### LAN access

The dashboard is reachable from any machine on your network. See
[`docs/lan-access.md`](docs/lan-access.md). One-time firewall step on the host:

```bash
sudo ufw allow 8111/tcp
```

### Local development (without Docker)

```bash
pnpm install                      # install JS workspace deps
pnpm --filter @vasthost/web dev   # dashboard on 0.0.0.0:8111

# API (separate shell) — needs a local Postgres + Redis and a populated .env
cd apps/api
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
celery -A worker.celery_app worker --loglevel=info   # worker
celery -A worker.celery_app beat --loglevel=info     # beat scheduler
```

## Environment variables

See [`.env.example`](.env.example) for the full reference. Key ones:

| Variable | Purpose |
|---|---|
| `VAST_API_KEY` | Optional: validated on API startup; the primary key is set in-app via Settings |
| `SECRET_KEY` | **Required.** Encrypts stored Vast API keys at rest |
| `DATABASE_URL` | Postgres connection (SQLAlchemy + psycopg) |
| `REDIS_URL` | Celery broker / result backend |
| `API_INTERNAL_URL` | Internal API host the Next.js proxy forwards `/api/*` to |
| `VAST_OBSERVER_DEFAULT_GPU` / `_NUM_GPUS` | Seeds the first watched class |
| `ALLOW_ALL_CORS` | Dev flag — allow all origins on the API |
| `WEB_PORT` | Host port the dashboard binds (default 8111) |

---

## Status

🚧 **Phase 0 — Foundation & Full Stack Bootstrap** — backend, workers, and all six
surfaces built; web app and API verified building/importing cleanly. Full
`docker compose up` smoke test pending on a Docker-enabled host.
