// Every action the server journals as a write must be sent by the app as a write too, so a lost
// reply is retried with the same request ID (never a second sale, payment or update).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const routes = vm.runInNewContext(fs.readFileSync(new URL('../Code.gs', import.meta.url), 'utf8') + ';ROUTES', {console});
const serverWrites = Object.keys(routes).filter(k => routes[k].write === true).sort();
const api = fs.readFileSync(new URL('../../frontend/src/lib/api.js', import.meta.url), 'utf8');
const block = api.slice(api.indexOf('const WRITES = new Set(['), api.indexOf(']);', api.indexOf('const WRITES = new Set([')));
const clientWrites = [...block.matchAll(/'([\w.]+)'/g)].map(m => m[1]).sort();
assert.ok(serverWrites.length > 30, 'server routes read');
assert.deepEqual(serverWrites.filter(a => !clientWrites.includes(a)), [], 'server writes the app does not retry safely');
assert.deepEqual(clientWrites.filter(a => !serverWrites.includes(a)), [], 'app writes the server does not journal');
// Unknown or inherited names (constructor, toString …) are refused as unknown actions.
assert.ok(!Object.hasOwn(routes, 'constructor') && !Object.hasOwn(routes, 'toString'));
console.log(`Write actions: ${serverWrites.length} server writes all retried safely by the app.`);
