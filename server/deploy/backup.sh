#!/usr/bin/env bash
# Nightly safety copy of every shop database on the VPS (cron runs it as karvio at 02:30 Dhaka).
# These are full PostgreSQL dumps, kept 7 days in /srv/karvio/backups. Shops' own encrypted
# Google Drive backups run separately from the app; this is the server owner's extra copy.
# Optional: KARVIO_OFFSITE (an rclone remote such as "gdrive:karvio-server") copies them off the VPS.
set -euo pipefail
set -a; . /etc/karvio/karvio.env; set +a
DIR=/srv/karvio/backups/$(date -u +%Y-%m-%d)
mkdir -p "$DIR"; chmod 700 /srv/karvio/backups "$DIR"
for db in "$KARVIO_CONTROL_DB" $(psql -d "$KARVIO_CONTROL_DB" -tAc "select db_name from shops order by subdomain"); do
  pg_dump -Fc -Z 6 -d "$db" -f "$DIR/$db.dump.tmp" && mv "$DIR/$db.dump.tmp" "$DIR/$db.dump"
  echo "$(date -u +%FT%TZ) $db $(du -h "$DIR/$db.dump" | cut -f1)"
done
find /srv/karvio/backups -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +
if [ -n "${KARVIO_OFFSITE:-}" ] && command -v rclone >/dev/null; then
  rclone copy "$DIR" "$KARVIO_OFFSITE/$(basename "$DIR")" && echo "copied off-site"
fi
# Restore one shop:  pg_restore --clean --if-exists -d karvio_shop_<shop> /srv/karvio/backups/<day>/karvio_shop_<shop>.dump
