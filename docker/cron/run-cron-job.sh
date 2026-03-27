#!/bin/sh
# Invoked by BusyBox crond: path is $1 (e.g. /api/cron/sync)
set -eu

path="${1:?missing path arg}"
CRON_SECRET=$(cat /run/dream12-cron.secret)
CRON_BASE_URL=$(cat /run/dream12-cron.base_url)

stamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

url="${CRON_BASE_URL}${path}"
echo "[dream12-cron] START $(stamp) GET ${path}" >&2

tmp="/tmp/cron-body.$$"
trap 'rm -f "$tmp"' EXIT

set +e
http=$(curl -sS -m 300 -o "$tmp" -w "%{http_code}" \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  "$url")
code=$?
set -e

if [ "$code" != 0 ]; then
  echo "[dream12-cron] FAIL $(stamp) ${path} curl_exit=${code}" >&2
  [ -s "$tmp" ] && head -c 1200 "$tmp" >&2 && echo >&2
  exit "$code"
fi

http="${http:-0}"
case "$http" in
  ''|*[!0-9]*) http=0 ;;
esac

if [ "$http" -ge 200 ] && [ "$http" -lt 300 ]; then
  echo "[dream12-cron] OK $(stamp) ${path} HTTP ${http}" >&2
  [ -s "$tmp" ] && head -c 1200 "$tmp" >&2 && echo >&2
else
  echo "[dream12-cron] FAIL $(stamp) ${path} HTTP ${http}" >&2
  [ -s "$tmp" ] && head -c 1200 "$tmp" >&2 && echo >&2
  exit 1
fi
