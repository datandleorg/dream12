#!/bin/sh
set -e
if [ -z "$DOMAINS" ]; then
  echo "nginx: DOMAINS is required (comma-separated, apex first), e.g. dream12.botnetworks.in,www.dream12.botnetworks.in" >&2
  exit 1
fi

# First hostname = Let's Encrypt live/<name>/ (use the same order in certbot -d flags).
DOMAINS_PRIMARY=$(printf '%s' "$DOMAINS" | cut -d',' -f1 | tr -d '[:space:]')
# nginx server_name: space-separated list
DOMAINS_SERVER_NAMES=$(printf '%s' "$DOMAINS" | tr ',' ' ' | tr -s ' ' | sed 's/^ //;s/ $//')

if [ -z "$DOMAINS_PRIMARY" ]; then
  echo "nginx: DOMAINS must list at least one hostname" >&2
  exit 1
fi

export DOMAINS_PRIMARY DOMAINS_SERVER_NAMES

if [ -f "/etc/letsencrypt/live/${DOMAINS_PRIMARY}/fullchain.pem" ] &&
  [ -f "/etc/letsencrypt/live/${DOMAINS_PRIMARY}/privkey.pem" ]; then
  tmpl=/opt/nginx-templates/https.conf.template
else
  tmpl=/opt/nginx-templates/http-only.conf.template
fi

envsubst '${DOMAINS_PRIMARY} ${DOMAINS_SERVER_NAMES}' <"$tmpl" >/etc/nginx/conf.d/default.conf

exec /docker-entrypoint.sh "$@"
