// Subscriptions in the control database: plans, each shop's paid-until date, payments, and the super admin's
// own sign-in. Dates are Bangladesh calendar days: a shop paid until 3 Dec works through 3 Dec, then gets
// `grace_days` more, then pauses itself until the next payment.
import {randomBytes, scrypt as scryptCb, timingSafeEqual, createHash} from 'node:crypto';
import {promisify} from 'node:util';

const scrypt = promisify(scryptCb);
const TODAY = `(now() at time zone 'Asia/Dhaka')::date`;

export const BILLING_SQL = `
create table if not exists plans(
 code text primary key check (code ~ '^[a-z0-9-]{1,20}$'),
 label text not null,
 months integer not null check (months between 1 and 60),
 price numeric(12,2) not null check (price >= 0),
 sort integer not null default 0
);
insert into plans(code,label,months,price,sort) values
 ('monthly','Monthly',1,1500,1),('half-yearly','6 months',6,7500,2),('yearly','Yearly',12,12000,3)
on conflict (code) do nothing;
create table if not exists admin_settings(key text primary key, value text not null);
insert into admin_settings values ('grace_days','3'),('trial_days','7'),('warn_days','7') on conflict (key) do nothing;
alter table shops add column if not exists plan text references plans(code) on update cascade;
alter table shops add column if not exists paid_until date;
alter table shops add column if not exists pause_reason text check (pause_reason in ('manual','expired'));
alter table shops add column if not exists phone text;
alter table shops add column if not exists note text;
create table if not exists payments(
 id bigserial primary key,
 subdomain text not null references shops(subdomain) on delete cascade,
 amount numeric(12,2) not null check (amount > 0),
 method text not null,
 plan text references plans(code) on update cascade,
 months integer not null check (months between 0 and 60),
 from_date date,
 to_date date,
 paid_on date not null default ${TODAY},
 note text,
 recorded_by text,
 created_at timestamptz not null default now()
);
create index if not exists payments_shop on payments(subdomain, id desc);
create index if not exists payments_paid_on on payments(paid_on);
create table if not exists admins(
 username text primary key check (username ~ '^[a-z0-9._-]{3,32}$'),
 password_hash text not null,
 created_at timestamptz not null default now()
);
create table if not exists admin_sessions(
 token_hash text primary key,
 username text not null references admins(username) on delete cascade,
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);`;

export async function initBilling(control) { await control.query(BILLING_SQL); }

const settingsOf = async q => Object.fromEntries((await q.query('select key, value from admin_settings')).rows.map(r => [r.key, Number(r.value)]));
const money = v => Math.round(Number(v) * 100) / 100;
const iso = d => d ? (d instanceof Date ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : String(d).slice(0, 10)) : null;

/** Everything the admin page shows: totals, shops with days left, plans and settings. */
export async function overview(control) {
  const settings = await settingsOf(control);
  const shops = (await control.query(`select s.subdomain, s.name, s.status, s.pause_reason, s.plan, s.paid_until, s.phone, s.note, s.created_at,
      (s.paid_until - ${TODAY}) as days_left,
      (select max(paid_on) from payments p where p.subdomain=s.subdomain) as last_paid
    from shops s order by s.created_at`)).rows.map(s => ({...s, paid_until: iso(s.paid_until), last_paid: iso(s.last_paid), days_left: s.days_left === null ? null : Number(s.days_left)}));
  const plans = (await control.query('select code, label, months, price::float8 as price from plans order by sort, months')).rows;
  const month = (await control.query(`select coalesce(sum(amount),0)::float8 as total, count(*)::int as n from payments
    where date_trunc('month', paid_on) = date_trunc('month', ${TODAY})`)).rows[0];
  const warn = settings.warn_days ?? 7;
  return {
    today: iso((await control.query(`select ${TODAY} as d`)).rows[0].d),
    totals: {
      active: shops.filter(s => s.status === 'active').length,
      due_soon: shops.filter(s => s.status === 'active' && s.days_left !== null && s.days_left <= warn).length,
      paused: shops.filter(s => s.status !== 'active').length,
      month_received: money(month.total), month_payments: month.n,
    },
    shops, plans, settings,
  };
}

export async function shopPayments(control, subdomain, limit = 50) {
  return (await control.query(`select id, amount::float8 as amount, method, plan, months, from_date, to_date, paid_on, note, recorded_by, created_at
    from payments where subdomain=$1 order by id desc limit $2`, [subdomain, limit])).rows
    .map(p => ({...p, from_date: iso(p.from_date), to_date: iso(p.to_date), paid_on: iso(p.paid_on)}));
}

/**
 * Record a payment and move the shop's paid-until date forward by the plan's months: from the current
 * paid-until date if it hasn't passed, otherwise from today. A shop paused for non-payment starts again.
 */
export async function recordPayment(control, {subdomain, amount, method, plan, months, note, paid_on, by}) {
  const value = money(amount);
  if (!(value > 0) || value > 10_000_000) throw new Error('Enter the amount received');
  if (!['bKash', 'Nagad', 'Rocket', 'Bank', 'Cash', 'Other'].includes(method)) throw new Error('Choose how it was paid');
  const client = await control.connect();
  try {
    await client.query('begin');
    const shop = (await client.query(`select subdomain, plan, paid_until, status, pause_reason, (paid_until >= ${TODAY}) as current from shops where subdomain=$1 for update`, [subdomain])).rows[0];
    if (!shop) throw new Error('Shop not found');
    const planCode = plan || shop.plan || 'monthly';
    const p = (await client.query('select code, months from plans where code=$1', [planCode])).rows[0];
    if (!p) throw new Error('Choose a plan');
    const add = months === undefined || months === null || months === '' ? p.months : Number(months);
    if (!Number.isInteger(add) || add < 0 || add > 60) throw new Error('Months: 0 to 60');
    const range = (await client.query(`select $1::date as from_date, ($1::date + make_interval(months => $2))::date as to_date`,
      [shop.current ? iso(shop.paid_until) : iso((await client.query(`select ${TODAY} as d`)).rows[0].d), add])).rows[0];
    const paidOn = paid_on && /^\d{4}-\d{2}-\d{2}$/.test(paid_on) ? paid_on : null;
    const row = (await client.query(`insert into payments(subdomain, amount, method, plan, months, from_date, to_date, paid_on, note, recorded_by)
      values($1,$2,$3,$4,$5,$6,$7,coalesce($8::date, ${TODAY}),nullif($9,''),$10) returning id`,
      [subdomain, value, method, p.code, add, add ? range.from_date : null, add ? range.to_date : null, paidOn, String(note || '').slice(0, 300), by || null])).rows[0];
    const resume = shop.status !== 'active' && shop.pause_reason === 'expired';
    await client.query(`update shops set plan=$2, paid_until=case when $3 > 0 then $4::date else paid_until end,
        status=case when $5 then 'active' else status end, pause_reason=case when $5 then null else pause_reason end, updated_at=now()
      where subdomain=$1`, [subdomain, p.code, add, range.to_date, resume]);
    await client.query('commit');
    return {id: row.id, paid_until: add ? iso(range.to_date) : iso(shop.paid_until), resumed: resume};
  } catch (e) { await client.query('rollback').catch(() => {}); throw e; }
  finally { client.release(); }
}

/** A new shop starts with a trial (no payment) or its first payment. */
export async function startSubscription(control, {subdomain, plan, phone, note, trial = true}) {
  const s = await settingsOf(control);
  const p = (await control.query('select code from plans where code=$1', [plan || 'monthly'])).rows[0];
  if (!p) throw new Error('Choose a plan');
  await control.query(`update shops set plan=$2, phone=nullif($3,''), note=nullif($4,''), paid_until=${TODAY} + $5::int, updated_at=now() where subdomain=$1`,
    [subdomain, p.code, String(phone || '').slice(0, 30), String(note || '').slice(0, 300), trial ? Math.max(0, s.trial_days ?? 7) : 0]);
}

export async function updateShop(control, {subdomain, name, plan, phone, note, paid_until}) {
  if (name !== undefined && !String(name).trim()) throw new Error('Shop name required');
  if (paid_until !== undefined && paid_until !== null && !/^\d{4}-\d{2}-\d{2}$/.test(paid_until)) throw new Error('Paid until: a date');
  const r = await control.query(`update shops set
      name=coalesce(nullif(trim($2),''), name),
      plan=coalesce($3, plan),
      phone=case when $4::text is null then phone else nullif($4,'') end,
      note=case when $5::text is null then note else nullif($5,'') end,
      paid_until=case when $6 then $7::date else paid_until end,
      updated_at=now()
    where subdomain=$1`, [subdomain, name ?? null, plan || null, phone ?? null, note ?? null, paid_until !== undefined, paid_until ?? null]);
  if (!r.rowCount) throw new Error('Shop not found');
}

export async function pauseShop(control, subdomain, paused) {
  const r = await control.query(`update shops set status=$2, pause_reason=$3, updated_at=now() where subdomain=$1`,
    [subdomain, paused ? 'suspended' : 'active', paused ? 'manual' : null]);
  if (!r.rowCount) throw new Error('Shop not found');
}

export async function savePlans(control, plans) {
  if (!Array.isArray(plans) || !plans.length) throw new Error('No plans');
  const client = await control.connect();
  try {
    await client.query('begin');
    for (const p of plans) {
      const price = money(p.price), months = Number(p.months);
      if (!(price >= 0) || !Number.isInteger(months) || months < 1 || months > 60 || !String(p.label || '').trim()) throw new Error('Each plan needs a name, 1-60 months and a price');
      const r = await client.query('update plans set label=$2, months=$3, price=$4 where code=$1', [p.code, String(p.label).trim().slice(0, 40), months, price]);
      if (!r.rowCount) throw new Error(`No plan "${p.code}"`);
    }
    await client.query('commit');
  } catch (e) { await client.query('rollback').catch(() => {}); throw e; }
  finally { client.release(); }
}

export async function saveSettings(control, settings) {
  for (const key of ['grace_days', 'trial_days', 'warn_days']) {
    if (settings[key] === undefined) continue;
    const v = Number(settings[key]);
    if (!Number.isInteger(v) || v < 0 || v > 60) throw new Error('Days: 0 to 60');
    await control.query('update admin_settings set value=$2 where key=$1', [key, String(v)]);
  }
}

/** Daily: pause every active shop whose paid-until date plus the grace days has passed. Returns the paused shops. */
export async function pauseExpired(control) {
  const s = await settingsOf(control);
  return (await control.query(`update shops set status='suspended', pause_reason='expired', updated_at=now()
    where status='active' and paid_until is not null and paid_until + $1::int < ${TODAY} returning subdomain`, [s.grace_days ?? 3])).rows.map(r => r.subdomain);
}

/** What a shop's own users see: days left, for the "renew soon" notice. */
export async function subscriptionOf(control, subdomain) {
  const s = await settingsOf(control);
  const r = (await control.query(`select paid_until, (paid_until - ${TODAY}) as days_left from shops where subdomain=$1`, [subdomain])).rows[0];
  if (!r || !r.paid_until) return {paid_until: null, days_left: null, warn: false, grace_days: s.grace_days ?? 3};
  const days = Number(r.days_left);
  return {paid_until: iso(r.paid_until), days_left: days, warn: days <= (s.warn_days ?? 7), grace_days: s.grace_days ?? 3};
}

// ---- Super admin sign-in (scrypt passwords, 12-hour sessions stored hashed).
const sha = s => createHash('sha256').update(s).digest('hex');
export async function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = await scrypt(String(pw), salt, 64, {N: 16384, r: 8, p: 1});
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}
async function checkPassword(pw, stored) {
  const [kind, salt, key] = String(stored).split('$');
  if (kind !== 'scrypt' || !salt || !key) return false;
  const want = Buffer.from(key, 'base64');
  const got = await scrypt(String(pw), Buffer.from(salt, 'base64'), want.length, {N: 16384, r: 8, p: 1});
  return timingSafeEqual(got, want);
}
export async function setAdminPassword(control, username, password) {
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw new Error('Username: 3-32 lower-case letters, digits, dot, dash or underscore');
  if (String(password).length < 10) throw new Error('Password: at least 10 characters');
  await control.query(`insert into admins(username, password_hash) values($1,$2) on conflict (username) do update set password_hash=excluded.password_hash`,
    [username, await hashPassword(password)]);
  await control.query('delete from admin_sessions where username=$1', [username]);
}
const DUMMY = 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');
export async function adminLogin(control, username, password) {
  const row = (await control.query('select username, password_hash from admins where username=$1', [String(username || '').toLowerCase()])).rows[0];
  const ok = await checkPassword(password, row?.password_hash || DUMMY); // same work whether or not the user exists
  if (!row || !ok) return null;
  const token = randomBytes(32).toString('base64url');
  await control.query(`delete from admin_sessions where expires_at < now()`);
  await control.query(`insert into admin_sessions(token_hash, username, expires_at) values($1,$2, now() + interval '12 hours')`, [sha(token), row.username]);
  return {token, username: row.username};
}
export async function adminSession(control, token) {
  if (!token || token.length > 100) return null;
  return (await control.query('select username from admin_sessions where token_hash=$1 and expires_at > now()', [sha(token)])).rows[0]?.username || null;
}
export async function adminLogout(control, token) { if (token) await control.query('delete from admin_sessions where token_hash=$1', [sha(token)]); }
export async function hasAdmin(control) { return (await control.query('select 1 from admins limit 1')).rowCount > 0; }
