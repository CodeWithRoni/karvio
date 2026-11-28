#!/usr/bin/env bash
# Karvio on a fresh Ubuntu 24.04 VPS, in one step. Run as root on the VPS:
#   curl -fsSL https://raw.githubusercontent.com/CodeWithRoni/karvio/main/server/deploy/install.sh | bash -s -- <domain> <email>
# e.g. ... | bash -s -- karvio.com.bd you@example.com   (the email only gets Let's Encrypt certificate notices)
# It sets up the server (PostgreSQL, Node.js, Caddy, firewall, swap, nightly dumps), downloads Karvio from
# GitHub, builds it and starts it. Safe to run again. Later updates: karvio-update
set -euo pipefail
DOMAIN="${1:-${KARVIO_BASE_DOMAIN:-}}"
EMAIL="${2:-${KARVIO_ADMIN_EMAIL:-}}"
REPO="${KARVIO_REPO:-https://github.com/CodeWithRoni/karvio.git}"
BRANCH="${KARVIO_BRANCH:-main}"
SRC=/srv/karvio-src

[ "$(id -u)" = 0 ] || { echo "Run this as root (log in as root, or use sudo)."; exit 1; }
if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "Usage: bash install.sh <domain> <email>   e.g. bash install.sh karvio.com.bd you@example.com"; exit 1
fi
DOMAIN="$(echo "$DOMAIN" | tr 'A-Z' 'a-z')"
echo "$DOMAIN" | grep -Eq '^[a-z0-9-]+(\.[a-z0-9-]+)+$' || { echo "Domain looks wrong: $DOMAIN"; exit 1; }
grep -q 'VERSION_ID="24.04"' /etc/os-release || echo "Note: made for Ubuntu 24.04; this server is $(. /etc/os-release; echo "$PRETTY_NAME")."

echo "==> Downloading Karvio ($BRANCH)"
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a
command -v git >/dev/null || { apt-get update -q && apt-get -y -q install git; }
if [ -d "$SRC/.git" ]; then
  git -C "$SRC" fetch -q --depth 1 origin "$BRANCH" && git -C "$SRC" reset -q --hard FETCH_HEAD
else
  git clone -q --depth 1 -b "$BRANCH" "$REPO" "$SRC"
fi

echo "==> Setting up the server (takes a few minutes)"
KARVIO_BASE_DOMAIN="$DOMAIN" KARVIO_ADMIN_EMAIL="$EMAIL" bash "$SRC/server/deploy/setup-ubuntu.sh"

echo "==> Building and starting Karvio"
KARVIO_BRANCH="$BRANCH" bash "$SRC/server/deploy/update.sh"

cat <<EOF

Karvio is installed.
  Main site:    https://www.$DOMAIN
  Admin panel:  https://admin.$DOMAIN
  Shops:        https://<shop>.$DOMAIN
HTTPS starts working once the domain's DNS points here.

Next, create your admin sign-in (type the password when asked; it is not shown):
  sudo -u karvio karvio admin:password <your-name>
EOF
