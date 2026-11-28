// The shop list (control database) and creating a shop: its own PostgreSQL database with every migration.
import {createHash, randomBytes} from 'node:crypto';
import pg from 'pg';
import {createPool, migrate} from './db.mjs';
import {initBilling} from './billing.mjs';

export const RESERVED = new Set(['www', 'api', 'app', 'admin', 'mail', 'smtp', 'ftp', 'static', 'cdn', 'status', 'docs', 'help', 'support', 'karvio']);
export const validSubdomain = s => typeof s === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(s) && !RESERVED.has(s);
export const dbNameFor = sub => 'karvio_shop_' + sub.replace(/-/g, '_');

const CONTROL_SQL = `
create table if not exists shops(
 subdomain text primary key,
 name text not null check (length(name) between 1 and 120),
 db_name text not null unique,
 status text not null default 'active' check (status in ('active','suspended')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);`;

export async function initControl(control) { await control.query(CONTROL_SQL); await initBilling(control); }
export async function listShops(control) {
  return (await control.query('select subdomain, name, db_name, status, pause_reason, plan, paid_until, created_at from shops order by created_at')).rows;
}
export async function setStatus(control, sub, status) {
  const r = await control.query(`update shops set status=$2, pause_reason=case when $2='active' then null else 'manual' end, updated_at=now() where subdomain=$1`, [sub, status]);
  if (!r.rowCount) throw new Error(`No shop "${sub}"`);
}

/** A one-time key the owner types on the first-run screen to create the Administrator account. */
export function newSetupKey() { return randomBytes(24).toString('base64url').replace(/[_-]/g, 'x').slice(0, 32); }
const sha = s => createHash('sha256').update(s, 'utf8').digest('hex');
export async function setSetupKey(shopPool, key) {
  const r = await shopPool.query(`update karvio_private.runtime set setup_hash=$1 where id and not exists (select 1 from public."Users")`, [sha(key)]);
  if (!r.rowCount) throw new Error('This shop already has an Administrator account');
}

/** Create a shop: database, migrations, setup key. Returns { subdomain, db_name, setupKey }. */
export async function createShop({control, connection = {}, subdomain, name}) {
  if (!validSubdomain(subdomain)) throw new Error('Subdomain: 1-32 lower-case letters, digits or dashes, not a reserved name');
  if (!name || !String(name).trim()) throw new Error('Shop name required');
  const exists = await control.query('select 1 from shops where subdomain=$1', [subdomain]);
  if (exists.rowCount) throw new Error(`Shop "${subdomain}" already exists`);
  const dbName = dbNameFor(subdomain);
  // CREATE DATABASE cannot take parameters; the name is checked above (letters, digits, underscores only).
  await control.query(`create database ${pg.escapeIdentifier(dbName)} template template0 encoding 'UTF8'`);
  await control.query(`alter database ${pg.escapeIdentifier(dbName)} set timezone to 'UTC'`);
  const pool = createPool(dbName, {connection, max: 1});
  try {
    await migrate(pool);
    const setupKey = newSetupKey();
    await setSetupKey(pool, setupKey);
    await control.query('insert into shops(subdomain, name, db_name) values($1,$2,$3)', [subdomain, String(name).trim(), dbName]);
    await pool.end();
    return {subdomain, db_name: dbName, setupKey};
  } catch (e) {
    // Half-made: remove the database so the same shop can be created again.
    await pool.end().catch(() => {});
    await control.query(`drop database if exists ${pg.escapeIdentifier(dbName)}`).catch(() => {});
    throw e;
  }
}
