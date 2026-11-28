#!/usr/bin/env bash
# Ship the current code to the VPS from your computer (or CI). Uses your own SSH key; asks for nothing else.
#   KARVIO_SSH=root@<vps-ip> bash server/deploy/deploy.sh
# Builds the web app for the VPS (/api on the same address), uploads it with the server code,
# installs the server's packages, migrates every shop database and restarts the service.
set -euo pipefail
: "${KARVIO_SSH:?set KARVIO_SSH, e.g. root@203.0.113.10}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REL=$(date -u +%Y%m%d%H%M%S)

(cd "$ROOT/frontend" && npm run build:vps)
ssh "$KARVIO_SSH" "mkdir -p /srv/karvio/releases/$REL"
rsync -az --delete --exclude node_modules \
  "$ROOT/server" "$ROOT/supabase" "$KARVIO_SSH:/srv/karvio/releases/$REL/"
rsync -az --delete "$ROOT/frontend/dist/" "$KARVIO_SSH:/srv/karvio/releases/$REL/app/"
ssh "$KARVIO_SSH" bash -s -- "$REL" <<'EOF'
set -euo pipefail
REL=$1; R=/srv/karvio/releases/$REL
chown -R karvio:karvio "$R"
sudo -u karvio bash -c "cd $R/server && npm ci --omit=dev --no-audit --no-fund"
ln -sfn "$R" /srv/karvio/current
rsync -a --delete "$R/app/" /srv/karvio/app/
cat > /usr/local/bin/karvio <<'CLI'
#!/usr/bin/env bash
set -a; . /etc/karvio/karvio.env; set +a
cd /srv/karvio/current/server && exec node cli.mjs "$@"
CLI
chmod 755 /usr/local/bin/karvio
sudo -u karvio karvio init
sudo -u karvio karvio migrate
systemctl restart karvio
sleep 2; curl -fsS http://127.0.0.1:8787/healthz >/dev/null && echo "Karvio $REL is live"
ls -1dt /srv/karvio/releases/* | tail -n +6 | xargs -r rm -rf   # keep the last 5 releases
EOF
