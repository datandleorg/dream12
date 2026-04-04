# Docker Compose (web + ngrok + cron)

## Quick start

1. Copy env file: `cp .env.docker.example .env` and fill values (`CRON_SECRET`, `NGROK_AUTHTOKEN`, Supabase keys, etc.).
2. Ensure `.env` includes **`NEXT_PUBLIC_SUPABASE_URL`** and **`NEXT_PUBLIC_SUPABASE_ANON_KEY`**. These must be present when you **build** the image (they are compiled into the browser bundle). If you change them, run `docker compose build --no-cache web` (or `docker compose up --build`) again.
3. From the repo root: `docker compose up --build`.
4. App: [http://localhost:3000](http://localhost:3000).
5. Ngrok inspect UI (public URL, requests): [http://localhost:14040](http://localhost:14040) (default host port; ngrok still listens on **4040 inside** the container).

If you see `Bind for 0.0.0.0:14040 failed`, set another free port in `.env`: `NGROK_INSPECT_PORT=24040`, or stop whatever is using that port (`lsof -i :14040` on macOS).

## Services

- **web** — Next.js production image (`output: "standalone"`). Listens on `0.0.0.0:3000`.
- **cron** — Alpine + BusyBox `crond`. On start, reads [`vercel.json`](../vercel.json) and installs one crontab line per entry. Each job runs `curl` to `http://web:3000<path>` with `Authorization: Bearer ${CRON_SECRET}`. Waits until `web` is healthy before starting.
- **ngrok** — Tunnels public HTTPS to `web:3000`. Requires `NGROK_AUTHTOKEN`.

## Schedules and timezones

Cron expressions in `vercel.json` follow the usual five-field form and run in **UTC** unless you set `TZ` for the `cron` service in `docker-compose.yml` (or pass `TZ` in the environment).

## Cron API logs and run history

- Each cron route logs to **stdout** with prefix `[dream12-api-cron]` (visible in `docker compose logs web`).
- Every successful or failed run also **appends one JSON line** to a JSONL file (default: OS temp dir, e.g. `/tmp/dream12-cron-runs.jsonl` in Linux). Override with env **`CRON_RUN_LOG_PATH`** on the `web` service.
- **Inspect last runs** (same bearer as cron):
  ```bash
  curl -sS -H "Authorization: Bearer $CRON_SECRET" \
    "http://localhost:3000/api/cron/run-history?limit=30" | jq .
  ```

## Verify the cron container

- After `docker compose up`, you should see a line like `Installed N job(s) from vercel.json` and a list of **schedule + path** (no secrets printed).
- **Live job logs:** each run prints to container stderr, e.g. `[dream12-cron] START …`, then `OK … HTTP 200` and a short response body, or `FAIL` with details. Watch with:
  ```bash
  docker compose logs -f cron
  ```
- **Quick manual hit** (same auth the cron uses), from the host:
  ```bash
  curl -sS -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/live-match-tick"
  ```
- **BusyBox crond** only runs jobs according to the clock inside the `cron` container (default **UTC** unless you set `TZ` in Compose for that service).

## `vercel.json` schedules (five fields: minute hour day-of-month month day-of-week)

All times below are **UTC** unless you set `TZ` on the `cron` service. The **`cron` container reads schedules from the repo’s `vercel.json`** (see `docker/cron/entrypoint.sh`).

| Schedule | Meaning |
|----------|---------|
| `30 20 * * *` | Every day at **20:30 UTC** — full SportMonks sync (`/api/cron/sync`). |
| `0 * * * *` | At **:00** every hour — today-schedule monitor (`/api/cron/today-schedule`). |
| `* 8-19 * * *` | Every **minute** during UTC hours **8–19** — `runMatchPipeline` / live-match-tick (IST ≈ **2pm–1:30am**; aligned to **2pm–1am IST**). |
| `*/15 * * * *` | Every **15 minutes** — finalize scores (`/api/cron/finalize-scores`). |
| `*/5 * * * *` | Every **5 minutes** — settle contests (`/api/cron/settle-contests`). |
| `*/5 * * * *` | Every **5 minutes** — scale displayed prize pool after join lock (`/api/cron/recompute-contest-prizes-at-lock`). |

## Changing jobs

Edit `vercel.json`, then rebuild/restart the cron container so the crontab is regenerated: `docker compose up -d --build cron`.

## Secrets in `CRON_SECRET`

Avoid quotes, `$`, and backticks in `CRON_SECRET`; the crontab is generated with shell quoting. Use a long alphanumeric secret.

If a **SportMonks `api_token`** was ever committed or shared, **rotate it** in the SportMonks dashboard and update your deployment env.

## Admin console and wallet UPI

- **Admin login:** [http://localhost:3000/adminlogin](http://localhost:3000/adminlogin) (only users with `profiles.is_admin = true`).
- **First admin:** After creating a user under **Authentication** (Dashboard or app sign-up), open [`supabase/scripts/bootstrap-admin.sql`](../supabase/scripts/bootstrap-admin.sql), set the email to match that user, and run it in the SQL editor.
- **Disable public sign-up:** In Supabase **Authentication → Providers → Email**, turn off **Allow new users to sign up** so only admins can create accounts (the app also redirects `/signup` to `/login`).
- **Wallet pay-in:** Set `NEXT_PUBLIC_COMPANY_UPI_VPA` (and optionally `NEXT_PUBLIC_COMPANY_UPI_PAYEE_NAME`) in `.env` so players get a correct `upi://pay` intent on the wallet page.
- **Service role:** Creating users from **Admin → Users** uses `SUPABASE_SERVICE_ROLE_KEY` on the server; keep it secret.

## Docker + Compose on the server (check your setup)

**Docker Engine**

```bash
docker version
```

You should see **Server** (daemon) and **Client**. If the client works but the server errors, the daemon is not running (`sudo systemctl start docker`).

**Compose — two different commands**

| Command | What it is |
|--------|------------|
| **`docker compose`** (space) | Compose **v2** plugin — subcommand of `docker`. Recommended. |
| **`docker-compose`** (hyphen) | Older **v1** Python binary. Still usable, but can break on newer Docker (`KeyError: 'ContainerConfig'`). |

Check what you have:

```bash
docker compose version    # v2 — OK if it prints a version
docker-compose --version  # v1 — OK if v2 is missing; use hyphen for all compose commands
```

If you get **`docker: unknown command: docker compose`**, v2 is **not** installed as a CLI plugin.

- **Docker from Docker’s official apt repo:** install the plugin package:
  ```bash
  sudo apt-get update
  sudo apt-get install -y docker-compose-plugin
  docker compose version
  ```

- **Docker from Ubuntu (`docker.io`, typical on DigitalOcean images):** the plugin package is usually named **`docker-compose-v2`** (Universe). Enable Universe if needed, then:
  ```bash
  sudo apt-get update
  sudo apt-get install -y docker-compose-v2
  docker compose version
  ```

  If `docker compose` still fails, you still get a modern **`docker-compose`** binary — use the **hyphen** for all commands (`docker-compose -f … up`).

- **Manual plugin (any Docker):** install the official binary into Docker’s CLI plugins dir ([releases](https://github.com/docker/compose/releases)):
  ```bash
  sudo mkdir -p /usr/local/lib/docker/cli-plugins
  sudo curl -SL "https://github.com/docker/compose/releases/download/v2.37.1/docker-compose-linux-x86_64" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  docker compose version
  ```
  (Pick the latest **v2** version from the releases page; use `aarch64` on ARM droplets.)

Until **`docker compose`** works, use **`docker-compose`** (hyphen) everywhere this doc shows **`docker compose`**.

## Production on a VPS (DigitalOcean, etc.)

Use [`docker-compose.production.yml`](../docker-compose.production.yml): **web**, **cron**, **nginx** (TLS + reverse proxy), **certbot** (renew loop), and **certbot-issue** (first cert only). Port **3000** is not published; **80** and **443** are.

**Full step-by-step (DNS, `.env`, TLS, verification, troubleshooting, cheat sheet):** **[`docs/digitalocean-deployment.md`](../docs/digitalocean-deployment.md)**.

Quick start on the server:

```bash
docker compose -f docker-compose.production.yml up -d --build
docker compose -f docker-compose.production.yml run --rm certbot-issue   # after DNS + HTTP :80 work
docker compose -f docker-compose.production.yml up -d --no-deps --force-recreate nginx
```

Images and templates: [`docker/nginx/`](nginx/), helper: [`docker/production/certbot-certonly.sh`](../docker/production/certbot-certonly.sh).

## Running without ngrok

Stop only that service: `docker compose up web cron` (or comment out the `ngrok` block temporarily).

## Port already allocated (ngrok)

If Docker reports `Bind for 0.0.0.0:14040 failed`, pick a free port: add `NGROK_INSPECT_PORT=24040` (or any free port) to `.env` next to `docker-compose.yml`, then `docker compose up` again.
