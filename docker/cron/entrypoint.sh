#!/bin/sh
set -eu

if [ -z "${CRON_SECRET:-}" ]; then
  echo "CRON_SECRET is required" >&2
  exit 1
fi

CRON_BASE_URL="${CRON_BASE_URL:-http://web:3000}"

if [ ! -f /config/vercel.json ]; then
  echo "Mount vercel.json at /config/vercel.json" >&2
  exit 1
fi

# Secrets for job script (crond runs jobs with a minimal env)
printf '%s' "$CRON_SECRET" > /run/dream12-cron.secret
printf '%s' "$CRON_BASE_URL" > /run/dream12-cron.base_url
chmod 600 /run/dream12-cron.secret /run/dream12-cron.base_url

: > /etc/crontabs/root
jq -r '.crons[] | [.schedule, .path] | @tsv' /config/vercel.json |
  while IFS="$(printf '\t')" read -r schedule path; do
    echo "$schedule /usr/local/bin/run-cron-job.sh $path" >> /etc/crontabs/root
  done

chmod 600 /etc/crontabs/root

n=$(wc -l </etc/crontabs/root | tr -d ' ')
echo "[dream12-cron] Installed ${n} crontab line(s) from vercel.json (schedules are UTC unless TZ is set on this service):" >&2
jq -r '.crons[] | "  \(.schedule)  \(.path)"' /config/vercel.json >&2
if jq -e '.crons[] | select(.path == "/api/cron/live-match-tick")' /config/vercel.json >/dev/null 2>&1; then
  echo "[dream12-cron] live-match-tick: once per cron schedule tick (same as Vercel, e.g. 1/min for \"* 8-19 * * *\")" >&2
fi
echo "[dream12-cron] crond running in foreground; job output appears above as START/OK/FAIL lines." >&2

exec crond -f -l 2
