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
  curl -sS -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/sync-scoreboards"
  ```
- **BusyBox crond** only runs jobs according to the clock inside the `cron` container (default **UTC** unless you set `TZ` in Compose for that service).

## `vercel.json` schedules (five fields: minute hour day-of-month month day-of-week)

All times below are **UTC** unless you set `TZ` on the `cron` service.

| Schedule | Meaning |
|----------|---------|
| `30 20 * * *` | Every day at **20:30 UTC** — full SportMonks sync (`/api/cron/sync`). |
| `30 21 * * *` | Every day at **21:30 UTC** — live fantasy points from `/livescores` (`/api/cron/live-scores`). |
| `*/2 * * * *` | Every **2 minutes** — scoreboard snapshots for upcoming/live matches (`/api/cron/sync-scoreboards`). |
| `15 * * * *` | At **:15** every hour — finalize scores for completed matches (`/api/cron/finalize-scores`). |
| `45 * * * *` | At **:45** every hour — settle contests / payouts when ready (`/api/cron/settle-contests`). |

## Changing jobs

Edit `vercel.json`, then rebuild/restart the cron container so the crontab is regenerated: `docker compose up -d --build cron`.

## Secrets in `CRON_SECRET`

Avoid quotes, `$`, and backticks in `CRON_SECRET`; the crontab is generated with shell quoting. Use a long alphanumeric secret.

## Running without ngrok

Stop only that service: `docker compose up web cron` (or comment out the `ngrok` block temporarily).

## Port already allocated (ngrok)

If Docker reports `Bind for 0.0.0.0:14040 failed`, pick a free port: add `NGROK_INSPECT_PORT=24040` (or any free port) to `.env` next to `docker-compose.yml`, then `docker compose up` again.
