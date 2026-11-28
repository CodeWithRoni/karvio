#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 VPS for Karvio. Run as root:
#   KARVIO_BASE_DOMAIN=karvioerp.com KARVIO_ADMIN_EMAIL=you@example.com bash setup-ubuntu.sh
# Installs PostgreSQL 16, Node.js 22 and Caddy, adds 2 GB swap, a firewall, the karvio user,
# the database roles and the shop list. The database password is generated here and only
# written to /etc/karvio/karvio.env — it is never printed.
set -euo pipefail
: "${KARVIO_BASE_DOMAIN:?set KARVIO_BASE_DOMAIN, e.g. karvioerp.com}"
: "${KARVIO_ADMIN_EMAIL:?set KARVIO_ADMIN_EMAIL, used for certificate notices}"
HERE="$(cd "$(dirname "$0")" && pwd)"
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a

apt-get update
apt-get -y upgrade
apt-get -y install curl ca-certificates gnupg ufw rsync git sudo unattended-upgrades postgresql-16 \
  debian-keyring debian-archive-keyring apt-transport-https

# Node.js 22 (NodeSource)
if ! command -v node >/dev/null || ! node -v | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get -y install nodejs
fi
# Caddy (official repository)
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update && apt-get -y install caddy
fi

# 2 GB swap so a busy moment never kills PostgreSQL.
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' > /etc/sysctl.d/90-karvio.conf && sysctl -p /etc/sysctl.d/90-karvio.conf
fi

# Firewall: SSH and web only. PostgreSQL and the Node server stay on localhost.
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Karvio user and folders.
id karvio >/dev/null 2>&1 || useradd --system --create-home --home-dir /srv/karvio --shell /bin/bash karvio
mkdir -p /srv/karvio/{releases,app,site,logs,backups} /etc/karvio
chown -R karvio:karvio /srv/karvio
[ -f /srv/karvio/site/index.html ] || echo '<!doctype html><meta charset="utf-8"><title>Karvio ERP</title><h1>Karvio ERP</h1>' > /srv/karvio/site/index.html

# PostgreSQL: tuning, roles, shop list.
install -m 644 "$HERE/postgresql-2gb.conf" /etc/postgresql/16/main/conf.d/karvio.conf
systemctl restart postgresql
sudo -u postgres psql -q -v ON_ERROR_STOP=1 -f "$HERE/../lib/roles.sql"
if [ ! -f /etc/karvio/karvio.env ]; then
  PW="$(openssl rand -hex 24)"
  sudo -u postgres psql -q -c "alter role karvio password '$PW'"
  cat > /etc/karvio/karvio.env <<EOF
KARVIO_BASE_DOMAIN=$KARVIO_BASE_DOMAIN
KARVIO_ADMIN_EMAIL=$KARVIO_ADMIN_EMAIL
KARVIO_PORT=8787
KARVIO_CONTROL_DB=karvio_control
PGHOST=127.0.0.1
PGPORT=5432
PGUSER=karvio
PGPASSWORD=$PW
EOF
  unset PW
fi
chown root:karvio /etc/karvio/karvio.env && chmod 640 /etc/karvio/karvio.env
sudo -u postgres psql -tAc "select 1 from pg_database where datname='karvio_control'" | grep -q 1 || sudo -u postgres createdb -O karvio karvio_control

# Caddy and the service file (the code itself arrives with update.sh).
grep -q KARVIO_ADMIN_EMAIL /etc/default/caddy 2>/dev/null || echo "KARVIO_ADMIN_EMAIL=$KARVIO_ADMIN_EMAIL" >> /etc/default/caddy
mkdir -p /etc/systemd/system/caddy.service.d
printf '[Service]\nEnvironmentFile=-/etc/default/caddy\n' > /etc/systemd/system/caddy.service.d/karvio.conf
sed "s/karvioerp\.com/$KARVIO_BASE_DOMAIN/g" "$HERE/Caddyfile" > /etc/caddy/Caddyfile
install -m 644 "$HERE/karvio.service" /etc/systemd/system/karvio.service
install -m 755 "$HERE/backup.sh" /usr/local/bin/karvio-backup
echo '30 20 * * * karvio /usr/local/bin/karvio-backup >> /srv/karvio/logs/backup.log 2>&1' > /etc/cron.d/karvio-backup  # 02:30 Dhaka
systemctl daemon-reload
systemctl enable karvio caddy
systemctl restart caddy
echo "Server setup done."
