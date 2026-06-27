# Dev Bot Build Prompt — VastHost OS
## GPU Host Operating System Dashboard

Read this entire document before writing a single line of code. This is not a simple CRUD app — it is a **host-side GPU business intelligence platform** that replaces Vast.ai's dashboard as the primary daily interface for serious hosts.

---

## What this product is

Vast.ai's dashboard answers: *what is my machine doing right now?*

VastHost OS answers:
- *What is the market doing and where do I sit in it?*
- *How much have I actually made, after fees and power?*
- *Is my pricing costing me rentals or leaving margin on the table?*
- *What should I do next, and why?*

The goal is simple: **the user spends their time here, not on Vast's dashboard.**

The product has six surfaces, stubbed from day one, filled in phase by phase:

| # | Surface | What it replaces |
|---|---|---|
| 1 | Market Intelligence | Vast's non-existent host market view |
| 2 | Earnings & Financials | Vast's buried earnings tab |
| 3 | Fleet Health & Utilization | Vast's machine list |
| 4 | Pricing Control Center | Manual price editing on Vast |
| 5 | Offer Management | Scattered CLI commands |
| 6 | Analytics & Insights | Nothing — Vast has none |

---

## Operating principle (non-negotiable)

> Every phase ends in a usable, deployable product. Do not begin a later phase until the previous one is stable, demoed, and committed.

Finish early → harden, test, document. Never scope-creep forward.

---

## Cross-cutting requirements (apply to every phase)

### Tech stack (locked — do not substitute)

| Layer | Stack |
|---|---|
| Frontend | Next.js 15+ (App Router), TypeScript, TailwindCSS, ShadCN UI, React Query, Zustand |
| Backend | FastAPI, SQLAlchemy, Alembic, PostgreSQL, Redis |
| Workers | Celery + Celery Beat (Redis broker) |
| Vast SDK | `vastai` Python package (`pip install vastai`) |
| Infra | Docker, Docker Compose, Nginx |

### Monorepo structure

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

### Networking — hard requirement

Dashboard runs on **port 8111**, reachable from **any LAN browser**.

1. Next dev script must bind `0.0.0.0`:
   ```json
   "dev": "next dev -H 0.0.0.0 -p 8111"
   ```

2. **No hardcoded `localhost` in client code.** Same-origin proxy in `next.config.js`:
   ```js
   async rewrites() {
     return [{ source: '/api/:path*', destination: `${process.env.API_INTERNAL_URL}/:path*` }];
   }
   ```
   Client always calls `/api/...` — never `http://host:8000/...`.

3. Docker Compose port mapping: `"8111:8111"` (binds all interfaces).

4. FastAPI CORS: allow all origins in dev, gated by `ALLOW_ALL_CORS=true` env flag.

5. Document in `docs/lan-access.md`: host must run `ufw allow 8111/tcp`.

**Acceptance:** second machine on the LAN opens `http://<host-ip>:8111`, dashboard loads, health widget reads live.

### UX bar — Grafana meets Linear

Read `/mnt/skills/public/frontend-design/SKILL.md` before writing any UI code.

- **Dark-first.** Dense, data-forward. One restrained accent color. Real typographic hierarchy. Consistent spacing scale. Not default Tailwind gray cards.
- **App shell from day one:** persistent left sidebar with all six surface icons/labels (active or "coming soon" badge), top bar with connection status + account info.
- **Every data widget ships all four states:** skeleton (not spinner-on-blank), empty, error, populated. This is the house style — build it once as a shared primitive.
- Toasts for all write actions. Keyboard accessible. AA contrast. Semantic HTML.
- Shared primitives in `packages/ui`.

### Vast API integration

Use the official `vastai` Python SDK everywhere. Do not hand-roll HTTP calls to Vast.

```python
from vastai import VastAI
vast = VastAI(api_key=settings.VAST_API_KEY)
```

Key quirks to handle from day one:
- `gpu_ram` in CLI = GB; in REST API = MB. The SDK auto-converts — document which unit each field arrives in.
- Rate limit: ~2s threshold, returns HTTP 429. All Vast calls must have exponential backoff + jitter. Log every 429.
- `show machines` returns sparse data from the REST endpoint. Cross-reference with `search offers` using `machine_id` filter to get the full field set per host machine.
- Earnings endpoint returns **daily granularity** — not real-time. Intraday "current earnings" is estimated from polled rental state × current price.

### Data retention policy (enforce from schema design)

- Each connected user's raw machine/earnings data is **private to that user**.
- Market observations (offer snapshots, clearing events, distributions) are **derived from public Vast listings** and feed the shared demand dataset.
- These two pools must never be mixed in a single query. Enforce at the ORM layer with separate table ownership.

### Engineering hygiene

- Strict TypeScript, ESLint + Prettier. Ruff + Black on Python.
- All config via environment variables. `.env.example` committed; `.env` git-ignored. No secrets in repo.
- Alembic migrations for every table — never autocreate schema.
- Conventional commits. Small logical commits per slice.

---

## Vast API field reference (use these exact names)

### `search offers` response fields (key subset)

```python
offer = {
  "id": int,                    # offer ID (stable across polls — use for lifecycle tracking)
  "machine_id": int,            # parent machine
  "gpu_name": str,              # e.g. "RTX 4090"
  "num_gpus": int,
  "gpu_ram": int,               # MB (REST) — divide by 1024 for GB display
  "gpu_total_ram": int,         # MB total across all GPUs on machine
  "gpu_max_power": int,         # watts per GPU — critical for break-even calc
  "dph_base": float,            # host's asking price $/hr
  "dph_total": float,           # total $/hr including fees (renter pays this)
  "reliability": float,         # 0.0–1.0
  "reliability2": float,        # secondary reliability metric
  "verified": str,              # "verified" | "unverified" | "deverified"
  "geolocation": str,           # "City, CC"
  "inet_down": float,           # Mb/s
  "inet_up": float,             # Mb/s
  "cpu_name": str,
  "cpu_cores": int,
  "cpu_ram": int,               # MB
  "dlperf": float,              # deep learning perf score
  "dlperf_per_dphtotal": float, # perf per dollar — Vast's ranking signal
  "rentable": bool,
  "rented": bool,               # True if currently rented
  "end_date": float,            # unix timestamp offer expires
  "duration": float,            # seconds until offer expires
  "min_bid": float,             # current min interruptible bid price
  "compute_cap": int,           # CUDA compute capability × 100
  "cuda_max_good": float,
  "disk_space": float,          # GB
  "disk_bw": float,             # GB/s
  "direct_port_count": int,
  "gpu_mem_bw": float,          # GB/s
  "gpu_arch": str,              # "nvidia" | "amd"
}
```

### `show earnings` response

```python
earnings = {
  "summary": {
    "total_gpu": float,     # total GPU earnings in period
    "total_stor": float,    # total storage earnings
    "total_bwu": float,     # total upload bandwidth earnings
    "total_bwd": float,     # total download bandwidth earnings
  },
  "current": {
    "balance": float,       # current account balance
    "service_fee": float,   # Vast's actual cut (use this for margin calc)
    "total": float,
    "credit": float,
  },
  "per_machine": [
    {
      "machine_id": int,
      "gpu_earn": float,
      "sto_earn": float,
      "bwu_earn": float,
      "bwd_earn": float,
    }
  ],
  "per_day": [
    {
      "day": int,           # unix day (seconds / 86400)
      "gpu_earn": float,
      "sto_earn": float,
      "bwu_earn": float,
      "bwd_earn": float,
    }
  ]
}
```

### `list machine` write fields

```python
vast.list_machine(
  id=machine_id,
  price_gpu=float,        # on-demand $/hr per GPU
  price_disk=float,       # $/GB/month storage
  price_inetu=float,      # $/GB upload bandwidth
  price_inetd=float,      # $/GB download bandwidth
  price_min_bid=float,    # interruptible bid floor
  discount_rate=float,    # max prepay discount (0.0–0.4)
  min_chunk=int,          # minimum GPUs per rental (powers of 2)
  end_date=str,           # "MM/DD/YYYY" or unix timestamp
  duration=str,           # "n days" / "n weeks" — auto-rolls end_date
)
```

---

## Database schema (Phase 0 — all tables created now)

### Account & auth tables

```sql
-- The connected Vast account
vast_accounts (
  id                  uuid primary key default gen_random_uuid(),
  vast_api_key        text not null,          -- encrypted at rest
  vast_user_id        integer,                -- from show_user()
  email               text,
  display_name        text,
  account_balance     numeric(10,4),
  connected_at        timestamptz default now(),
  last_synced_at      timestamptz,
  is_active           boolean default true
)
```

### Machine & fleet tables

```sql
-- Host machines (synced from show_machines + enriched from search offers)
host_machines (
  id                  uuid primary key default gen_random_uuid(),
  vast_account_id     uuid references vast_accounts(id),
  machine_id          integer not null,       -- Vast's machine_id
  gpu_name            text,
  num_gpus            integer,
  gpu_ram_mb          integer,
  gpu_max_power_w     integer,               -- watts per GPU, for break-even
  cpu_name            text,
  cpu_cores           integer,
  cpu_ram_mb          integer,
  disk_space_gb       numeric(10,2),
  geolocation         text,
  verified            text,                  -- verified|unverified|deverified
  reliability         numeric(5,4),
  is_listed           boolean,
  is_rentable         boolean,
  current_price_gpu   numeric(10,6),         -- current asking price
  current_price_disk  numeric(10,6),
  current_price_inetu numeric(10,6),
  current_price_inetd numeric(10,6),
  min_bid_price       numeric(10,6),
  offer_end_date      timestamptz,
  last_seen_at        timestamptz,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
)

-- Active and historical rental contracts on host machines
rental_contracts (
  id                  uuid primary key default gen_random_uuid(),
  machine_id          uuid references host_machines(id),
  vast_contract_id    integer,
  rented_at           timestamptz,
  ended_at            timestamptz,
  locked_price_gpu    numeric(10,6),         -- price at contract creation (locked)
  rental_type         text,                  -- on-demand|interruptible|reserved
  num_gpus_rented     integer,
  status              text,                  -- active|ended|interrupted
  created_at          timestamptz default now()
)

-- Reliability score history per machine
reliability_history (
  id                  uuid primary key default gen_random_uuid(),
  machine_id          uuid references host_machines(id),
  recorded_at         timestamptz default now(),
  reliability         numeric(5,4),
  is_listed           boolean,
  is_rentable         boolean
)
```

### Earnings & financial tables

```sql
-- Daily earnings per machine (synced from show_earnings)
earnings_daily (
  id                  uuid primary key default gen_random_uuid(),
  vast_account_id     uuid references vast_accounts(id),
  machine_id          uuid references host_machines(id),
  earn_date           date not null,
  gpu_earn            numeric(10,6),
  storage_earn        numeric(10,6),
  bw_upload_earn      numeric(10,6),
  bw_download_earn    numeric(10,6),
  total_earn          numeric(10,6) generated always as
                        (gpu_earn + storage_earn + bw_upload_earn + bw_download_earn) stored,
  synced_at           timestamptz default now(),
  unique(machine_id, earn_date)
)

-- Snapshot of account-level financials (polled periodically)
account_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  vast_account_id     uuid references vast_accounts(id),
  recorded_at         timestamptz default now(),
  balance             numeric(10,4),
  service_fee         numeric(10,4),         -- Vast's actual cut
  total_credit        numeric(10,4)
)

-- Host-entered cost configuration (power cost for margin calc)
cost_config (
  id                  uuid primary key default gen_random_uuid(),
  vast_account_id     uuid references vast_accounts(id),
  machine_id          uuid references host_machines(id),
  kwh_rate            numeric(8,4),          -- $/kWh, host enters this
  updated_at          timestamptz default now()
)
```

### Market Observer tables

```sql
-- One row per offer per poll (public market data — not tied to a user account)
offer_snapshots (
  id                  bigserial primary key,
  observed_at         timestamptz not null,
  offer_id            integer not null,
  machine_id          integer,
  gpu_name            text not null,
  num_gpus            integer,
  gpu_ram_mb          integer,
  gpu_max_power_w     integer,
  reliability         numeric(5,4),
  verified            text,
  geolocation         text,
  price_gpu           numeric(10,6),
  price_disk          numeric(10,6),
  price_inetu         numeric(10,6),
  price_inetd         numeric(10,6),
  dph_total           numeric(10,6),
  dlperf              numeric(10,4),
  dlperf_per_dphtotal numeric(10,4),
  rentable            boolean,
  rented              boolean,
  num_gpus_available  integer,
  end_date            timestamptz
)

-- Detected clearing events (offer disappeared = probable rental)
clearing_events (
  id                  bigserial primary key,
  detected_at         timestamptz not null,
  offer_id            integer not null,
  gpu_name            text,
  num_gpus            integer,
  verified            text,
  geolocation         text,
  last_price_gpu      numeric(10,6),
  dwell_minutes       integer,              -- how long it sat before clearing
  is_partial_fill     boolean default false,
  confidence          text default 'MEDIUM' -- HIGH|MEDIUM|LOW (de-noise signal)
)

-- Pre-aggregated distribution per GPU class per poll cycle
market_distributions (
  id                  bigserial primary key,
  computed_at         timestamptz not null,
  gpu_name            text not null,
  num_gpus            integer not null,
  verified            text,
  geolocation         text,                 -- NULL = all regions
  p10_price           numeric(10,6),
  p25_price           numeric(10,6),
  p50_price           numeric(10,6),
  p75_price           numeric(10,6),
  p90_price           numeric(10,6),
  supply_count        integer,
  rented_count        integer,
  utilization_pct     numeric(5,2),         -- rented / total
  clearing_rate_1h    numeric(5,4),
  clearing_rate_24h   numeric(5,4)
)
```

### Pricing controller tables

```sql
-- Every price change, manual or automated
price_change_events (
  id                  uuid primary key default gen_random_uuid(),
  changed_at          timestamptz default now(),
  machine_id          uuid references host_machines(id),
  old_price_gpu       numeric(10,6),
  new_price_gpu       numeric(10,6),
  reason              text,    -- manual|recommend_applied|auto_step_down|auto_probe_up
  market_dist_id      bigint references market_distributions(id),
  market_percentile   numeric(5,2),         -- where old price sat in distribution
  applied_to_vast     boolean default false,
  applied_at          timestamptz,
  error_message       text
)

-- Simulated host configs (for sandbox testing)
simulated_hosts (
  id                  uuid primary key default gen_random_uuid(),
  name                text,
  gpu_name            text,
  num_gpus            integer,
  gpu_ram_mb          integer,
  gpu_max_power_w     integer,
  verified            text default 'unverified',
  reliability         numeric(5,4) default 0.90,
  geolocation         text,
  kwh_rate            numeric(8,4),
  vast_service_fee_pct numeric(5,4) default 0.20,
  is_active           boolean default true,
  created_at          timestamptz default now()
)
```

---

## Worker tasks (Celery Beat schedule)

```python
# apps/worker/tasks/

# ── Market Observer ────────────────────────────────────────────
# Polls Vast search offers for configured GPU classes
# Writes offer_snapshots, detects clearing events
# Schedule: every 3 minutes
market_observer_poll()

# Aggregates raw snapshots into market_distributions per bucket
# Schedule: every 15 minutes
market_distribution_aggregate()

# ── Fleet Sync ────────────────────────────────────────────────
# Syncs show_machines() for all connected vast_accounts
# Enriches with search offers (machine_id filter) for full field set
# Updates host_machines, rental_contracts, reliability_history
# Schedule: every 2 minutes
fleet_sync()

# ── Earnings Sync ─────────────────────────────────────────────
# Calls show_earnings(last_days=90) for each vast_account
# Upserts earnings_daily rows
# Updates account_snapshots (balance, service_fee)
# Schedule: every 30 minutes; also triggered on account connect
earnings_sync()

# ── Offer Expiry Monitor ──────────────────────────────────────
# Checks for host_machines where offer_end_date < now() + 48h
# Writes alert records (Phase 1 feature — stub the task now)
# Schedule: every 6 hours
offer_expiry_monitor()
```

All tasks: exponential backoff on 429, log every retry. Never share a rate limit budget across accounts — schedule per `vast_account_id`.

---

## FastAPI endpoint surface (Phase 0)

```
# Health
GET  /health

# Account
POST /account/connect          # save + validate Vast API key, trigger initial sync
GET  /account/status           # connection status, last sync time, balance
DELETE /account/disconnect

# Fleet (read-only in Phase 0)
GET  /fleet/machines           # list of host_machines with current state
GET  /fleet/machines/:id       # single machine detail

# Earnings (read-only in Phase 0)
GET  /earnings/summary         # totals + per-machine breakdown
GET  /earnings/daily           # per_day array for charting (last N days)

# Market
GET  /market/distribution      # latest market_distributions for a gpu_name + region
GET  /market/clearing-events   # recent clearing events (proof Observer is working)

# Simulator
GET  /simulator/hosts          # list simulated_hosts
POST /simulator/hosts          # create simulated_host config
PUT  /simulator/hosts/:id      # update config
```

---

## PHASE 0 — Foundation & Full Stack Bootstrap

### The single most important rule for Phase 0

**The Market Observer starts in Phase 0 and never stops.** It is the most important deliverable. The demand dataset cannot be backfilled — every poll that doesn't run is data that's gone forever. Everything else in the roadmap depends on this record existing. The dashboard is there to prove it's working.

### Deliverables

**Repo & tooling**
- Monorepo as specified. pnpm workspaces or Turborepo.
- `README.md`: one-command spin-up, LAN access instructions, firewall step, env var reference.

**Backend**
- FastAPI with all Phase 0 endpoints above.
- Full schema created via Alembic migrations (every table in this spec).
- `vastai` SDK wired and validated on startup (calls `show_user()` to confirm key works).
- All Celery beat tasks running: `market_observer_poll`, `market_distribution_aggregate`, `fleet_sync`, `earnings_sync`.

**Frontend — app shell first**

Read `frontend-design` skill before writing a single component.

Dark-first app shell:
- Left sidebar with all six surface nav items:
  - Market Intelligence (active in Phase 0)
  - Earnings & Financials (active in Phase 0)
  - Fleet Health (active in Phase 0)
  - Pricing Control (stub — "coming soon" badge)
  - Offer Management (stub — "coming soon" badge)
  - Analytics & Insights (stub — "coming soon" badge)
- Top bar: connection status dot (green/red), account email, account balance (live from `account_snapshots`).
- Settings page: connect Vast API key form.

**Dashboard — landing surface**

Six summary cards, all four states (skeleton/empty/error/populated):

1. **Fleet Overview** — total machines, GPUs online, currently rented count, fleet utilization %, machines with expiring offers (within 48h).

2. **Earnings Today** — estimated GPU earnings today (intraday estimate from rental state × price), yesterday actual, this month running total. Source: `earnings_daily` + live rental state.

3. **Market Position** — for the user's primary GPU class: their current asking price, market p50, their percentile position. Visual: a tiny inline distribution with their price marked. "You are priced at the Nth percentile."

4. **Market Activity** — clearing events detected in the last hour / 24h for their GPU class. Clearing rate trending up or down vs yesterday. This is the "is the market hot right now" signal.

5. **Observer Status** — last poll time, next poll, total offer snapshots in DB, total clearing events detected. Proves the data engine is running.

6. **System Status** — API health, worker health, DB connection, Redis connection. Reads `/api/health`.

**Market Intelligence surface (Phase 0 — core feature)**

Full page, not just a card:

- **Price Distribution Chart** — box plot or violin plot showing p10/p25/p50/p75/p90 for selected GPU class + region. User's current price overlaid as a vertical line. Updates every 15 minutes from `market_distributions`.
- **Supply & Demand Panel** — supply count over time (line chart, last 24h). Utilization % over time. Clearing rate 1h vs 24h.
- **Recent Clearing Events Table** — last 50 clearing events: GPU class, price it cleared at, how long it dwelled before clearing, confidence level, timestamp. This is the demand signal made visible.
- **Class Selector** — dropdown: GPU name + num_gpus + region. Drives all panels on the page.

**Earnings & Financials surface (Phase 0 — real data)**

- **Earnings Chart** — stacked bar, last 30 days, per-machine breakdown: GPU earn / storage earn / bandwidth earn.
- **Per-Machine Earnings Table** — each machine: total earned this month, GPU earn, storage earn, bw earn, Vast service fee (from `account_snapshots.service_fee`), and if `cost_config` exists: estimated power cost, **net margin**.
- **Cost Config Panel** — per-machine: enter kWh rate + power watts (pre-filled from `gpu_max_power_w` if available). Saves to `cost_config`. Recalculates break-even and margin immediately.
- **Account Balance Widget** — current balance, last payout, total earned all-time (summed from `earnings_daily`).

**Fleet Health surface (Phase 0 — real data)**

- **Machine Cards** — one card per `host_machines` row:
  - GPU name, count, VRAM
  - Current status: RENTED / IDLE / UNLISTED / OFFLINE
  - Current asking price vs market p50 (delta highlighted)
  - Reliability score + trend (up/down from `reliability_history`)
  - Offer end date with warning if < 48h
  - Active contract: rental type, locked price, GPU count rented
- **Utilization Timeline** — per-machine Gantt-style bar showing rented/idle periods from `rental_contracts`. Last 7 days.

**Simulator Config (Phase 0 — surface only)**

- Create / edit / delete `simulated_hosts` configs via the `/simulator/hosts` endpoints.
- Swappable fields: GPU name, count, VRAM, region, verified status, reliability, power watts, kWh rate, service fee %.
- Shows computed break-even floor in real time as fields are edited.
- No controller or pricing actions yet — config management only.

**Settings page**

- Connect Vast API key (POST `/account/connect`).
- Show connection status, last sync time, validated user email.
- Disconnect button.
- Watched GPU classes for Observer: add/remove `(gpu_name, num_gpus, region)` tuples that drive `market_observer_poll`. Persisted in a `watched_classes` table (add to schema).

---

## Environment variables

```bash
# Vast
VAST_API_KEY=                       # user's personal Vast account key

# Observer — initial watched class (user can add more in Settings)
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

## Definition of Done for Phase 0

1. `docker compose up -d` brings the full stack healthy from a clean checkout.
2. `GET /api/health` returns healthy through the Next proxy.
3. Dashboard loads on `http://<host-lan-ip>:8111` from a different LAN machine.
4. Connecting a real Vast API key triggers initial `fleet_sync` and `earnings_sync` — machines and earnings appear in the dashboard within 60 seconds.
5. Market Observer is polling every 3 minutes — `offer_snapshots` rows accumulating, verifiable in DB.
6. At least one `clearing_event` detected and visible in the Recent Clearing Events table within a reasonable observation window.
7. Market Intelligence surface shows a real price distribution for at least one GPU class.
8. Earnings surface shows real per-machine earnings broken down by GPU/storage/bandwidth.
9. Fleet Health surface shows real machines with rented/idle status and reliability scores.
10. Cost Config panel accepts kWh rate and shows computed net margin for at least one machine.
11. All dashboard widgets render all four states (skeleton, empty, error, populated).
12. Simulator Config panel can create and save a simulated host config.
13. Alembic migrations clean, all tables present. Lint/format clean. Conventional commits.
14. README complete: spin-up, LAN access, firewall step, env vars, how to connect a Vast key.

### Do NOT build in Phase 0

- Pricing recommendations or auto-repricing (Phase 2+)
- Pricing controller logic (Phase 2+)
- Simulated rental outcomes / demand model (Phase 2+)
- Offer Management surface (Phase 3+)
- Analytics & Insights surface (Phase 4+)
- Multi-user / multi-tenant (Phase 5+)

---

## Phased roadmap (reference only)

| Phase | Deliverable |
|---|---|
| **0** | Foundation + real Vast data + Observer live + all six surface stubs |
| **1** | Pricing Control Center — recommend-only (shows recommended price, human clicks apply) |
| **2** | Bounded auto-repricing against simulated host within configured rails |
| **3** | Offer Management surface (bulk ops, expiry alerts, backfill config via `set defjob`) |
| **4** | Demand-curve engine (data-gated — lights up once dataset is deep enough) |
| **5** | Analytics & Insights surface |
| **6** | Real host adapter (plug real Vast listing into the pricing controller) |
| **7** | Multi-tenant SaaS (per-user accounts, per-user Vast keys) |
| **8** | Multi-provider expansion (RunPod + others) |

---

Stop after Phase 0 is complete. Report: what's running, how to demo on the LAN, any deviations and why, and any decisions that need confirmation before Phase 1.
