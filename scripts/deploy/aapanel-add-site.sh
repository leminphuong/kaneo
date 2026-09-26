#!/usr/bin/env bash
#
# Add a second site to an aaPanel VPS that already serves another vhost,
# and issue its Let's Encrypt certificate.
#
#   bash scripts/deploy/aapanel-add-site.sh task.joydigi.net 5173
#
# Written for a box where aaPanel's nginx is the one actually running, so it
# never touches `systemctl reload nginx` (that calls /usr/sbin/nginx and fails
# with `invalid PID number "" in "/run/nginx.pid"`).
#
# It is additive: no other vhost is read or modified, and an existing vhost for
# this domain is backed up before being replaced.

set -euo pipefail

DOMAIN="${1:-}"
UPSTREAM_PORT="${2:-5173}"

NGINX_BIN="/www/server/nginx/sbin/nginx"
NGINX_CONF="/www/server/nginx/conf/nginx.conf"
VHOST_DIR="/www/server/panel/vhost/nginx"
LOG_DIR="/www/wwwlogs"
ACME_ROOT="/var/www/letsencrypt"

BLUE=$'\033[0;34m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; RED=$'\033[0;31m'; NC=$'\033[0m'
step() { printf '%s==>%s %s\n' "$BLUE" "$NC" "$1"; }
ok()   { printf '%s  ok%s %s\n' "$GREEN" "$NC" "$1"; }
warn() { printf '%s  !!%s %s\n' "$YELLOW" "$NC" "$1"; }
die()  { printf '%s ERROR%s %s\n' "$RED" "$NC" "$1" >&2; exit 1; }

[ -n "$DOMAIN" ] || die "Usage: bash $0 <domain> [upstream-port]
  e.g. bash $0 task.joydigi.net 5173"
[ "$(id -u)" -eq 0 ] || die "Run as root."
[ -x "$NGINX_BIN" ] || die "aaPanel nginx not found at $NGINX_BIN.
This script is only for aaPanel boxes; use a normal nginx vhost otherwise."
[ -d "$VHOST_DIR" ] || die "aaPanel vhost directory missing: $VHOST_DIR"
command -v certbot >/dev/null 2>&1 || die "certbot is not installed: apt install -y certbot"

VHOST="$VHOST_DIR/$DOMAIN.conf"

# `http2 on;` only exists from nginx 1.25.1; older builds want it as a `listen`
# flag. Emitting the wrong one fails the config test, so pick by version.
nginx_version="$("$NGINX_BIN" -v 2>&1 | sed -n 's|.*nginx/\([0-9.]*\).*|\1|p')"
version_ge() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" = "$2" ]; }
if [ -n "$nginx_version" ] && version_ge "$nginx_version" "1.25.1"; then
  LISTEN_443="listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;"
else
  LISTEN_443="listen 443 ssl http2;
    listen [::]:443 ssl http2;"
fi

reload_nginx() {
  "$NGINX_BIN" -t -c "$NGINX_CONF" || die "nginx config test failed; nothing reloaded."
  /etc/init.d/nginx reload >/dev/null
  ok "aaPanel nginx reloaded"
}

# --- upstream -------------------------------------------------------------
step "Checking the upstream on 127.0.0.1:$UPSTREAM_PORT"
if ss -lnt "( sport = :$UPSTREAM_PORT )" 2>/dev/null | grep -q ":$UPSTREAM_PORT"; then
  ok "Something is listening on $UPSTREAM_PORT"
else
  warn "Nothing is listening on $UPSTREAM_PORT yet."
  warn "The vhost will be created, but the site 502s until the app is up."
fi

# --- existing vhost -------------------------------------------------------
if [ -f "$VHOST" ]; then
  backup="$VHOST.bak-$(date +%Y%m%d-%H%M%S)"
  cp "$VHOST" "$backup"
  warn "Existing vhost backed up to $backup"
fi

mkdir -p "$ACME_ROOT/.well-known/acme-challenge" "$LOG_DIR"
chmod -R 755 "$ACME_ROOT"

# --- phase 1: HTTP only, so ACME can validate -----------------------------
step "Writing the HTTP vhost for ACME validation"
cat > "$VHOST" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location ^~ /.well-known/acme-challenge/ {
        alias $ACME_ROOT/.well-known/acme-challenge/;
        default_type text/plain;
        allow all;
    }

    location / {
        proxy_pass http://127.0.0.1:$UPSTREAM_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    access_log $LOG_DIR/$DOMAIN.log;
    error_log $LOG_DIR/$DOMAIN.error.log;
}
EOF
reload_nginx

step "Verifying the ACME challenge path"
token="probe-$(date +%s)"
echo "$token" > "$ACME_ROOT/.well-known/acme-challenge/$token.txt"
local_body="$(curl -s --max-time 10 --resolve "$DOMAIN:80:127.0.0.1" \
  "http://$DOMAIN/.well-known/acme-challenge/$token.txt" || true)"
[ "$local_body" = "$token" ] || die "Local ACME probe failed. The vhost is not serving $ACME_ROOT."
ok "Served locally"

public_body="$(curl -s --max-time 15 "http://$DOMAIN/.well-known/acme-challenge/$token.txt" || true)"
rm -f "$ACME_ROOT/.well-known/acme-challenge/$token.txt"
if [ "$public_body" != "$token" ]; then
  warn "Public probe did not return the token."
  warn "DNS for $DOMAIN must point at this server before a certificate can be issued:"
  warn "  dig +short A $DOMAIN"
  die "Fix DNS (and any Cloudflare proxying) first, then re-run."
fi
ok "Served publicly - DNS points here"

# --- certificate ----------------------------------------------------------
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
if [ -f "$CERT_DIR/fullchain.pem" ]; then
  ok "Certificate already exists for $DOMAIN"
else
  step "Requesting a certificate"
  certbot certonly --webroot -w "$ACME_ROOT" -d "$DOMAIN" --non-interactive --agree-tos \
    --register-unsafely-without-email || die "certbot failed; the HTTP vhost is left in place."
  ok "Certificate issued"
fi

# Renewals must reload aaPanel nginx, not the systemd unit.
HOOK="/etc/letsencrypt/renewal-hooks/deploy/reload-aapanel-nginx.sh"
if [ ! -x "$HOOK" ]; then
  mkdir -p "$(dirname "$HOOK")"
  printf '#!/bin/sh\n/etc/init.d/nginx reload\n' > "$HOOK"
  chmod +x "$HOOK"
  ok "Installed the certbot deploy hook"
fi

# --- phase 2: final HTTP + HTTPS vhost ------------------------------------
step "Writing the HTTPS vhost"
cat > "$VHOST" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location ^~ /.well-known/acme-challenge/ {
        alias $ACME_ROOT/.well-known/acme-challenge/;
        default_type text/plain;
        allow all;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    $LISTEN_443
    server_name $DOMAIN;

    ssl_certificate $CERT_DIR/fullchain.pem;
    ssl_certificate_key $CERT_DIR/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:$UPSTREAM_PORT;
        proxy_http_version 1.1;

        # Realtime board updates run over WebSockets. Without these two the
        # upgrade dies at this hop and boards silently stop updating live.
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        # Long enough that an idle WebSocket is not cut every minute.
        proxy_read_timeout 3600s;
    }

    access_log $LOG_DIR/$DOMAIN.log;
    error_log $LOG_DIR/$DOMAIN.error.log;
}
EOF
reload_nginx

# --- verify ---------------------------------------------------------------
step "Verifying"
http_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "http://$DOMAIN" || echo 000)"
https_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://$DOMAIN" || echo 000)"
echo "  http://$DOMAIN  -> $http_code (expect 301)"
echo "  https://$DOMAIN -> $https_code (expect 200, or 302 to a login page)"

case "$https_code" in
  200|301|302) ok "Site is up" ;;
  502) warn "502: the vhost works but nothing is answering on 127.0.0.1:$UPSTREAM_PORT." ;;
  000) warn "No response. Check that ports 80/443 are open in the firewall." ;;
  *)   warn "Unexpected status $https_code; check $LOG_DIR/$DOMAIN.error.log" ;;
esac

echo
echo "  vhost:  $VHOST"
echo "  logs:   $LOG_DIR/$DOMAIN.error.log"
echo "  reload: $NGINX_BIN -t -c $NGINX_CONF && /etc/init.d/nginx reload"
