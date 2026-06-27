# LAN Access

VastHost OS is designed to be your daily dashboard, opened from any machine on
your local network — not just the host running it.

## How it works

- The Next.js dashboard binds `0.0.0.0:8111` (all interfaces), so it is
  reachable at `http://<host-lan-ip>:8111` from any device on the LAN.
- The browser only ever calls `/api/...` (same-origin). Next.js proxies those
  requests to the FastAPI container via a rewrite (`next.config.js`), using the
  internal Docker hostname `api:8000`. **There are no hardcoded `localhost` URLs
  in client code**, so it works identically from a second machine.
- Docker Compose maps `8111:8111`, binding all host interfaces.

## One-time firewall step (required)

On the host, allow inbound traffic to the dashboard port:

```bash
sudo ufw allow 8111/tcp
```

(If you also want to reach the raw API or Postgres from another machine for
debugging, allow `8000/tcp` / `5432/tcp` too — not required for normal use.)

## Find your host LAN IP

```bash
hostname -I | awk '{print $1}'
# or
ip -4 addr show | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v 127.0.0.1
```

## Verify from a second machine

1. On the host: `docker compose up -d`
2. From another device on the same network, open:
   `http://<host-lan-ip>:8111`
3. The dashboard should load and the **System Status** card should read live
   (it calls `GET /api/health` through the proxy).

## Acceptance check

> A second machine on the LAN opens `http://<host-ip>:8111`, the dashboard
> loads, and the health/System Status widget reads live.

If the page doesn't load from another machine but works on the host:

- Confirm the firewall rule (`sudo ufw status`).
- Confirm the containers are up: `docker compose ps`.
- Confirm you used the host's **LAN** IP (not `127.0.0.1`).
