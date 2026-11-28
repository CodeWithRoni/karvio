# Karvio on your own VPS (Node.js + PostgreSQL)

One VPS serves every shop. Each shop has its own address (`computerplus.karvioerp.com`) and **its own PostgreSQL
database** (`karvio_shop_computerplus`); shops never share data, sign-ins or backup keys. The API code is the same
code that runs on Supabase (`supabase/functions/karvio-api`), and the database is built from the same
`supabase/migrations`.

```
Browser ──HTTPS──> Caddy ──/api──> Node (127.0.0.1:8787) ──> PostgreSQL: karvio_shop_<shop>
                     └── web app files (/srv/karvio/app)        karvio_control (shop list)
```

What replaces Supabase pieces:

| Supabase | Here |
|---|---|
| Edge Function | `server/main.mjs` (Node 22) |
| pg_cron | the server runs each shop's `cron.job` rows once a minute (UTC) |
| pg_net | jobs queue calls in `net.calls`; the server hands them to that shop's API |
| Daily backups | the app's encrypted Google Drive backup per shop, plus `backup.sh` nightly dumps on the server |

## First setup (once, on a fresh Ubuntu 24.04 VPS)

1. DNS at your domain provider: `A  @  <VPS IP>`, `A  www  <VPS IP>`, `A  *  <VPS IP>`.
2. Copy the `server/deploy` and `server/lib` folders to the VPS, then as root:
   `KARVIO_BASE_DOMAIN=karvioerp.com KARVIO_ADMIN_EMAIL=<your email> bash server/deploy/setup-ubuntu.sh`
3. From your computer: `KARVIO_SSH=root@<VPS IP> bash server/deploy/deploy.sh`

## A new shop

```
sudo -u karvio karvio shop:create computerplus "Computer Plus"
```
It prints a one-time **setup key**. The owner opens `https://computerplus.karvioerp.com`, chooses
"Set up", enters the key and their password. Then in Settings → Database they add their own Google keys
for Drive backup (the redirect address shown there is `https://computerplus.karvioerp.com/api`).

Other commands: `karvio shop:list`, `karvio shop:pause <shop>` (unpaid: the shop sees a paused message),
`karvio shop:resume <shop>`, `karvio shop:setup-key <shop>`, `karvio migrate`.

## Updates

`deploy.sh` again. It builds the web app with `npm run build:vps` (API at `/api` on the shop's own address),
uploads it, runs new migrations on every shop database and restarts the server. The last five releases are kept
in `/srv/karvio/releases`.

## Moving a shop from Supabase

Create the shop here, set it up, then in Settings → Database download a backup on the old address and
restore it on the new one (same Administrator password and RESTORE confirmation as always).

## Size

The 2 GB / 2 CPU plan with `postgresql-2gb.conf` and 2 GB swap is comfortable for about 10–15 shops of
2–5 users each. Watch `free -h` and `df -h`; move to 4 GB when memory stays above 75%.

## Tests

`node backend/test/node-server.mjs` (from `frontend/`, part of `npm test`) runs against a real PostgreSQL when
`PGHOST`/`PGUSER`/`PGPASSWORD` point at a login with `createdb` (see `lib/roles.sql`) and `server/` packages are
installed; otherwise only the schedule checks run.
