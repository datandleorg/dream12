#!/bin/sh
# First Let's Encrypt certificate for docker-compose.production.yml (run inside certbot container).
# Expects DOMAINS (comma-separated, same order as nginx) and CERTBOT_EMAIL in the environment.
set -e
if [ -z "$DOMAINS" ] || [ -z "$CERTBOT_EMAIL" ]; then
  echo "certbot-certonly: set DOMAINS and CERTBOT_EMAIL (e.g. from .env)" >&2
  exit 1
fi
dflags=""
OLDIFS=$IFS
IFS=,
for d in $DOMAINS; do
  d=$(printf '%s' "$d" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  [ -z "$d" ] && continue
  dflags="$dflags -d $d"
done
IFS=$OLDIFS
exec certbot certonly --webroot -w /var/www/certbot $dflags \
  --email "$CERTBOT_EMAIL" --agree-tos --no-eff-email -n
