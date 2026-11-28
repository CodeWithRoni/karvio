#!/usr/bin/env bash
# Update this VPS to the latest Karvio on GitHub. Run as root:  karvio-update
# Downloads the code, builds the web app here, installs it as a new release, brings every shop database up
# to date and restarts the server. If the build fails, the running version is left untouched.
set -euo pipefail
SRC=/srv/karvio-src
BRANCH="${KARVIO_BRANCH:-main}"
[ "$(id -u)" = 0 ] || { echo "Run as root."; exit 1; }
[ -f /etc/karvio/karvio.env ] || { echo "Run install.sh first."; exit 1; }

git -C "$SRC" fetch -q --depth 1 origin "$BRANCH"
git -C "$SRC" reset -q --hard FETCH_HEAD
REL="$(date -u +%Y%m%d%H%M%S)-$(git -C "$SRC" rev-parse --short HEAD)"
echo "==> Building $REL"

# The web app, with its API at /api on each shop's own address. Desktop/mobile tooling is not needed here.
cd "$SRC/frontend"
export ELECTRON_SKIP_BINARY_DOWNLOAD=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 CYPRESS_INSTALL_BINARY=0
export NODE_OPTIONS=--max-old-space-size=1024
npm ci --no-audit --no-fund --loglevel=error
npm run build:vps

R="/srv/karvio/releases/$REL"
mkdir -p "$R"
rsync -a --delete --exclude node_modules "$SRC/server" "$SRC/supabase" "$R/"
rsync -a --delete "$SRC/frontend/dist/" "$R/app/"
chown -R karvio:karvio "$R"
sudo -u karvio -H bash -c "cd '$R/server' && npm ci --omit=dev --no-audit --no-fund --loglevel=error"

# Switch over.
ln -sfn "$R" /srv/karvio/current
rsync -a --delete "$R/app/" /srv/karvio/app/
chown -R karvio:karvio /srv/karvio/app
cat > /usr/local/bin/karvio <<'CLI'
#!/usr/bin/env bash
set -a; . /etc/karvio/karvio.env; set +a
cd /srv/karvio/current/server && exec node cli.mjs "$@"
CLI
chmod 755 /usr/local/bin/karvio
install -m 755 "$SRC/server/deploy/update.sh" /usr/local/bin/karvio-update
install -m 755 "$SRC/server/deploy/backup.sh" /usr/local/bin/karvio-backup
# Caddy settings from this release, for this domain (kept as they are if the new file has a mistake).
DOMAIN="$(. /etc/karvio/karvio.env; echo "$KARVIO_BASE_DOMAIN")"
sed "s/karvioerp\.com/$DOMAIN/g" "$SRC/server/deploy/Caddyfile" > /etc/caddy/Caddyfile.new
if (set -a; . /etc/default/caddy; set +a; caddy validate --config /etc/caddy/Caddyfile.new --adapter caddyfile >/dev/null 2>&1); then
  mv /etc/caddy/Caddyfile.new /etc/caddy/Caddyfile; systemctl reload caddy || systemctl restart caddy
else
  rm -f /etc/caddy/Caddyfile.new; echo "Warning: the new Caddyfile did not validate; kept the old one"
fi

sudo -u karvio karvio init
sudo -u karvio karvio migrate
systemctl restart karvio
for i in $(seq 1 20); do curl -fsS http://127.0.0.1:8787/healthz >/dev/null 2>&1 && break; sleep 1; done
curl -fsS http://127.0.0.1:8787/healthz >/dev/null && echo "==> Karvio $REL is live" || { echo "Karvio did not start; see: journalctl -u karvio -n 50"; exit 1; }
ls -1dt /srv/karvio/releases/* | tail -n +6 | xargs -r rm -rf   # keep the last 5 releases
