// Request limits: requests without a session are limited in their own buckets (sign-in, public
// links, other) and can never use up the shop bucket that signed-in counters depend on.
import assert from 'node:assert/strict';
import {freshDatabase, apiClient, rpcFor} from './pg-harness.mjs';

const db = await freshDatabase();
const {token, raw} = await apiClient(db);
const rpc = rpcFor(db);
const limit = (action, tok = 'nobody') => rpc('karvio_request_limit', {session_key: 'tok_' + tok, action_name: action});
const count = async (action, n, tok) => { let ok = 0; for (let i = 0; i < n; i++) if (await limit(action, typeof tok === 'function' ? tok(i) : tok)) ok++; return ok; };
let checks = 0;
const eq = (a, b, msg) => { assert.equal(a, b, msg); checks++; };

await db.exec('delete from karvio_private.rate_limits');
eq(await count('login', 61, i => 'guess' + i), 60, 'sign-in without a session: 60 a minute, even with rotating fake tokens');
eq(await limit('invoice.public'), true, 'a sign-in flood does not block customers opening invoice links');
eq(await limit('ping'), true, 'nor other requests');
eq(await limit('dashboard', token), true, 'nor signed-in staff');

await db.exec('delete from karvio_private.rate_limits');
eq(await count('invoice.public', 301), 300, 'public invoice / quotation links: 300 a minute');
eq(await limit('login'), true, 'a link flood does not block sign-in');

await db.exec('delete from karvio_private.rate_limits');
eq(await count('ping', 121), 120, 'other requests without a session: 120 a minute');
// 1000 anonymous requests in all: the shop bucket for signed-in counters is untouched.
await count('invoice.public', 400); await count('login', 100); await count('ping', 380);
eq((await db.query(`select count(*)::int n from karvio_private.rate_limits where key = 'shop-total'`)).rows[0].n, 0, 'anonymous requests never count against the shop');
eq(await count('sale.create', 180, token), 180, 'a signed-in user still gets all 180 requests a minute');
eq(await limit('sale.create', token), false, 'and is limited after that');

// The previous Edge build (one argument) keeps working during a deploy.
await db.exec('delete from karvio_private.rate_limits');
eq(await rpc('karvio_request_limit', {session_key: 'tok_' + token}), true, 'old one-argument call still answers');

// Not callable by API roles other than the Edge function.
for (const role of ['anon', 'authenticated']) {
  await db.exec(`set role ${role}`);
  await assert.rejects(db.query(`select public.karvio_request_limit('tok_x', 'login')`), /permission denied/); checks++;
  await db.exec('reset role');
}
// Inherited object names are unknown actions, not a 'could not be confirmed' server error.
for (const action of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
  const r = await raw(action, {});
  eq(r.error, 'Unknown action: ' + action, action + ' is an unknown action'); eq(!!r.uncertain, false, action + ' is not uncertain');
}
console.log(`Request limits: ${checks} checks passed (separate sign-in, link and other buckets; anonymous floods never block signed-in staff; inherited names are unknown actions).`);
