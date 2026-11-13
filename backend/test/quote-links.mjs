// Quotation links: send a PC-builder quote by SMS, open it without signing in, and make sure it is
// deleted after three days. Only the link-key hash is stored. In-memory only.
import assert from 'node:assert/strict';
import schema from '../../supabase/functions/karvio-api/schema.json' with {type:'json'};
import {hash} from '../../supabase/functions/karvio-api/runtime.mjs';
import {createHandler} from '../../supabase/functions/karvio-api/handler.mjs';

const setupKey = 'quote-key';
const snapshot = {revision:0, metadata:{properties:{},cache:{},privateSheets:{}}, tables:Object.fromEntries(Object.keys(schema).map(n => [n, []])), requiresSetup:true};
const smsJobs = [];
const rpc = async (name, args) => {
  if (name === 'karvio_snapshot') return structuredClone(snapshot);
  if (args.expected_revision !== snapshot.revision) return {committed:false};
  if (args.initialize_owner && (!snapshot.requiresSetup || args.setup_token_hash !== hash(setupKey))) throw new Error('Invalid setup key');
  if (args.initialize_owner) snapshot.requiresSetup = false;
  Object.assign(snapshot.tables, structuredClone(args.changes)); snapshot.metadata = structuredClone(args.next_metadata); snapshot.revision++;
  (args.sms_jobs || []).forEach(j => smsJobs.push(j));
  return {committed:true};
};
const handler = createHandler({rpc});
const call = async (action, payload = {}, token = '', request_id = crypto.randomUUID()) => (await handler(new Request('http://localhost', {method:'POST', body:JSON.stringify({action, payload, token, request_id})}))).json();
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const eq = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };

ok((await call('owner.initialize', {name:'Owner', password:'test-password-12345', setup_key:setupKey})).ok, 'owner initialized');
const token = (await call('login', {username:'admin', password:'test-password-12345'})).data.token;
const Q = async (action, payload = {}, id) => { const r = await call(action, payload, token, id); assert.ok(r.ok, action + ': ' + r.error); return r.data; };
const R = (action, payload = {}) => call(action, payload, token);
const rejects = async (r, pattern, message) => { const res = await r; ok(!res.ok && pattern.test(res.error), message + ' (got: ' + (res.ok ? 'ok' : res.error) + ')'); };

const quote = {customer:'Rahim', phone:'01711-222333', title:'Gaming PC', valid_days:7, discount:500, note:'Assembly free',
  lines:[{group:'Processor', name:'Ryzen 5 5600', warranty:'1095 days', qty:1, price:15000}, {group:'RAM', name:'16GB DDR4', warranty:'', qty:2, price:3500}]};

await rejects(R('quote.send', quote), /SMS is turned off/, 'needs SMS turned on');
await Q('settings.save', {values:{sms_enabled:'true', sms_url:'https://sms.example.com/send?to={number}&text={message}', sms_method:'GET'}});
await rejects(R('quote.send', {...quote, phone:'12345'}), /mobile number/, 'needs a real mobile number');
await rejects(R('quote.send', {...quote, lines:[]}), /1 to 60 parts/, 'needs parts');
await rejects(R('quote.send', {...quote, discount:99999}), /Discount cannot be more/, 'discount capped');
await rejects(R('quote.send', {...quote, lines:[{name:'X', qty:0, price:1}]}), /Invalid quantity/, 'positive quantity');

const id = crypto.randomUUID();
const sent = await Q('quote.send', quote, id);
const smsUrl = decodeURIComponent(smsJobs[0]?.url || '');
const linkToken = (/#\/q\/([A-Za-z0-9]{22})/.exec(smsUrl) || [])[1];
ok(linkToken && /https:\/\/[^ ]+#\/q\/[A-Za-z0-9]{22}/.test(smsUrl), 'SMS has a link to the quote page');
ok(!('url' in sent), 'staff response does not carry the link');
eq(sent.days, 3, 'link valid for 3 days');
eq(smsJobs.length, 1, 'one SMS queued');
ok(smsJobs[0].url.includes('8801711222333'), 'SMS goes to the customer number');
const log = snapshot.tables.SmsLog.at(-1);
ok(!log.message.includes(linkToken) && log.message.includes('#/q/' + linkToken.slice(0, 4) + '…'), 'SMS log keeps a masked link');
ok(!JSON.stringify(snapshot).includes(linkToken), 'the link key is stored nowhere in the database');
await Q('quote.send', quote, id);
eq(smsJobs.length, 1, 'a retried request does not send a second SMS');

// The customer opens it without signing in.
const pub = (await call('quote.public', {token:linkToken})).data;
eq([pub.quote.customer, pub.quote.title, pub.quote.subtotal, pub.quote.discount, pub.quote.total], ['Rahim', 'Gaming PC', 22000, 500, 21500], 'quote totals');
eq(pub.quote.lines.map(l => [l.name, l.qty, l.price, l.total]), [['Ryzen 5 5600', 1, 15000, 15000], ['16GB DDR4', 2, 3500, 7000]], 'quote lines');
eq(pub.quote.phone, '01711222333', 'phone shown in local form');
ok(pub.shop && 'shop_name' in pub.shop && !('sms_api_key' in pub.shop), 'only public shop details');
eq((await call('quote.public', {token:'A'.repeat(22)})).data.expired, true, 'unknown link refused');
ok(!(await call('quote.public', {token:'bad!'})).ok, 'malformed link refused');

// After three days the link stops working and the stored quote is deleted.
const second = await Q('quote.send', {...quote, customer:'Karim'});
const rows = () => (snapshot.metadata.privateSheets.__KarvioQuoteLinks?.rows || []).filter(r => r && r[0]);
eq(rows().length, 2, 'two live quotes stored');
const expired = rows().find(r => JSON.parse(r[2]).customer === 'Rahim');
expired[1] = Date.now() - 1000; snapshot.revision++;
const gone = await call('quote.public', {token:linkToken});
ok(gone.ok && gone.data.expired && /expired/.test(gone.data.message) && !gone.data.quote, 'expired link refused');
eq(rows().map(r => JSON.parse(r[2]).customer), ['Karim'], 'expired quote deleted from storage');
const secondToken = (/#\/q\/([A-Za-z0-9]{22})/.exec(decodeURIComponent(smsJobs.at(-1).url)) || [])[1];
ok((await call('quote.public', {token:secondToken})).ok, 'the other quote still opens');
ok(snapshot.tables.AuditLog.some(a => a.action === 'quote_send'), 'sending is audited');
// Nobody opens it: the first save of the day still deletes it once it has expired.
rows().forEach(r => { r[1] = Date.now() - 1000; }); snapshot.metadata.properties.links_cleaned = '2000-01-01'; snapshot.revision++;
await Q('customer.save', {name:'Any save', phones:['01711000777']});
eq(rows().length, 0, 'daily clean-up deleted the unopened expired quote');

console.log(`Quotation links: ${checks} checks passed (SMS with link, public view, masked log, retry safety, 3-day expiry and deletion).`);
