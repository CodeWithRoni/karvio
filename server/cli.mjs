// Karvio server administration. Run on the VPS as the karvio user, with /etc/karvio/karvio.env loaded:
//   node cli.mjs init                          create the shop list (once)
//   node cli.mjs shop:create <shop> "<name>"   new shop at <shop>.<base domain>; prints its setup key
//   node cli.mjs shop:list
//   node cli.mjs shop:pause <shop> | shop:resume <shop>
//   node cli.mjs shop:setup-key <shop>         new setup key (only before the Administrator account exists)
//   node cli.mjs migrate                       bring every shop database up to date (run on each deploy)
//   node cli.mjs admin:password <name>         create a super admin (admin.<base domain>) or change its password
import pg from 'pg';
import {createPool, migrate} from './lib/db.mjs';
import {createShop, initControl, listShops, setSetupKey, setStatus, newSetupKey} from './lib/shops.mjs';
import {setAdminPassword, startSubscription} from './lib/billing.mjs';

// Typed without showing on screen (and never passed on the command line, where it would land in the shell history).
async function askHidden(question) {
  const {stdin, stdout} = process;
  if (!stdin.isTTY) { let text = ''; for await (const c of stdin) text += c; return text.split('\n')[0].replace(/\r$/, ''); }
  stdout.write(question);
  stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const done = fn => { stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', on); stdout.write('\n'); fn(); };
    const on = ch => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') return done(() => resolve(value));
        if (c === '\u0003') return done(() => reject(new Error('Cancelled')));
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1); else if (c >= ' ') value += c;
      }
    };
    stdin.on('data', on);
  });
}

const [command, ...args] = process.argv.slice(2);
const base = process.env.KARVIO_BASE_DOMAIN || '<base domain>';
const control = new pg.Pool({database: process.env.KARVIO_CONTROL_DB || 'karvio_control', max: 2});

async function main() {
  switch (command) {
    case 'init': await initControl(control); console.log('Shop list ready.'); break;
    case 'shop:create': {
      const [sub, name] = args;
      if (!sub || !name) throw new Error('Usage: shop:create <shop> "<Shop name>"');
      await initControl(control);
      const r = await createShop({control, subdomain: sub.toLowerCase(), name});
      await startSubscription(control, {subdomain: r.subdomain, plan: 'monthly'});
      console.log(`Shop created: https://${r.subdomain}.${base}  (database ${r.db_name})`);
      console.log(`Setup key (give it to the owner once; it creates the Administrator account): ${r.setupKey}`);
      break;
    }
    case 'shop:list': {
      for (const s of await listShops(control)) console.log(`${s.subdomain.padEnd(24)} ${s.status.padEnd(10)} ${s.db_name.padEnd(32)} ${s.name}`);
      break;
    }
    case 'shop:pause': case 'shop:resume': {
      if (!args[0]) throw new Error(`Usage: ${command} <shop>`);
      await setStatus(control, args[0], command === 'shop:pause' ? 'suspended' : 'active');
      console.log(`${args[0]}: ${command === 'shop:pause' ? 'paused' : 'active'} (the server picks it up within 30 seconds)`);
      break;
    }
    case 'shop:setup-key': {
      const shop = (await listShops(control)).find(s => s.subdomain === args[0]);
      if (!shop) throw new Error(`No shop "${args[0]}"`);
      const pool = createPool(shop.db_name, {max: 1});
      try { const key = newSetupKey(); await setSetupKey(pool, key); console.log(`New setup key for ${shop.subdomain}: ${key}`); }
      finally { await pool.end(); }
      break;
    }
    case 'migrate': {
      const shops = await listShops(control);
      for (const shop of shops) {
        const pool = createPool(shop.db_name, {max: 1});
        try { const done = await migrate(pool); console.log(`${shop.subdomain}: ${done.length ? done.length + ' migration(s) applied' : 'up to date'}`); }
        finally { await pool.end(); }
      }
      if (!shops.length) console.log('No shops yet.');
      break;
    }
    case 'admin:password': {
      const name = String(args[0] || '').toLowerCase();
      if (!name) throw new Error('Usage: admin:password <name>');
      await initControl(control);
      const pw = await askHidden(`Password for ${name} (at least 10 characters): `);
      const again = process.stdin.isTTY ? await askHidden('Same password again: ') : pw;
      if (pw !== again) throw new Error('The two passwords are different');
      await setAdminPassword(control, name, pw);
      console.log(`Admin "${name}" can now sign in at https://admin.${base}`);
      break;
    }
    default:
      console.log('Commands: init | shop:create <shop> "<name>" | shop:list | shop:pause <shop> | shop:resume <shop> | shop:setup-key <shop> | migrate | admin:password <name>');
      process.exitCode = command ? 1 : 0;
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => control.end());
