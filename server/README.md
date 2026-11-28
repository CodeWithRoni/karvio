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

1. DNS for the domain (DNS only, no proxy): `A  @  <VPS IP>`, `A  www  <VPS IP>`, `A  *  <VPS IP>`.
2. Log in to the VPS as root (`ssh root@<VPS IP>`) and run:
   ```
   curl -fsSL https://raw.githubusercontent.com/CodeWithRoni/karvio/main/server/deploy/install.sh | bash -s -- karvio.com.bd <your email>
   ```
   It installs PostgreSQL 16, Node.js 22, Caddy, the firewall, swap and nightly dumps, downloads Karvio from
   GitHub, builds it on the server and starts it.
3. Create your admin sign-in: `sudo -u karvio karvio admin:password <your-name>`

## Super admin panel (`https://admin.karvioerp.com`)

Create your sign-in once on the server (the password is typed, never shown or saved in history):
`sudo -u karvio karvio admin:password <name>`

The panel lists every shop with its plan, paid-until date and status, and records payments (bKash, Nagad,
bank, cash…). A payment moves the paid-until date forward by the plan's months. Settings: plan prices, free
trial days (new shops without a first payment), warning days (the shop's Administrator sees "renew soon") and
grace days after the due date. After the grace days the shop pauses itself; recording a payment opens it again
at once. Shops you pause by hand stay paused until you resume them.

## A new shop

From the panel: "New shop". Or on the server:

```
sudo -u karvio karvio shop:create computerplus "Computer Plus"
```

It prints a one-time **setup key**. The owner opens `https://computerplus.karvioerp.com`, chooses
"Set up", enters the key and their password. Then in Settings → Database they add their own Google keys
for Drive backup (the redirect address shown there is `https://computerplus.karvioerp.com/api`).

Other commands: `karvio shop:list`, `karvio shop:pause <shop>` (unpaid: the shop sees a paused message),
`karvio shop:resume <shop>`, `karvio shop:setup-key <shop>`, `karvio migrate`.

## Updates

On the VPS, as root: `karvio-update`. It downloads the latest code from GitHub, builds the web app there
(`npm run build:vps`, API at `/api` on each shop's address), runs new migrations on every shop database and
restarts the server; a failed build leaves the running version alone. The last five releases are kept in
`/srv/karvio/releases`. (`deploy.sh` does the same from a Linux or Mac computer instead.)

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
