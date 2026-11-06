// Staff working hours: outside them a staff member cannot sign in or keep using the app; admins never limited.
const fs = require('fs');
const path = require('path');
const harness = fs.readFileSync(path.join(__dirname, 'simulate.js'), 'utf8').split('/* ---------------- scenario ---------------- */')[0];
const scenario = `
sandbox.setupDatabase();
const assert = require('assert/strict');
let checks = 0;
const same = (a, b, msg) => { assert.deepEqual(JSON.parse(JSON.stringify(a)), b, msg); checks++; };
const truthy = (v, msg) => { assert.ok(v, msg); checks++; };
const at = (hm, dow) => vm.runInContext('CLOCK_OVERRIDE_ = ' + JSON.stringify({ hm, dow }), sandbox);
const token = call('login', {username:'admin', password:'admin123'}).data.token;
const Q = (a, p, t) => { const r = call(a, p, t || token); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
const QF = (a, p, t) => { const r = call(a, p, t || token); assert.equal(r.ok, false, a + ' should fail'); checks++; return r; };
// days: 0 Sun 1 Mon 2 Tue 3 Wed 4 Thu 5 Fri 6 Sat
const SAT = 6, SUN = 0, THU = 4, FRI = 5;

/* ---- pure rule ---- */
const u = { role: 'sales', access_limit: true, access_from: '10:00', access_to: '20:00', access_days: 'sat,sun,mon,tue,wed,thu' };
const A = (x, hm, dow) => sandbox.accessAllowed_(x, { hm, dow });
same(A(u, '09:59', SAT), false, 'before start');
same(A(u, '10:00', SAT), true, 'at start');
same(A(u, '19:59', SAT), true, 'just before end');
same(A(u, '20:00', SAT), false, 'at end time the day is over');
same(A(u, '12:00', FRI), false, 'day off');
same(A({ ...u, role: 'admin' }, '03:00', FRI), true, 'admins are never limited');
same(A({ ...u, access_limit: false }, '03:00', FRI), true, 'no limit set');
const night = { role: 'manager', access_limit: true, access_from: '22:00', access_to: '06:00', access_days: 'thu' };
same(A(night, '23:30', THU), true, 'overnight: evening of a working day');
same(A(night, '02:00', FRI), true, 'overnight: early morning after a working day (Thu night shift)');
same(A(night, '06:00', FRI), false, 'overnight: ends at 6');
same(A(night, '23:30', FRI), false, 'overnight: evening of a day off');
same(A(night, '12:00', THU), false, 'overnight: midday');
same(A({ ...u, access_days: '' }, '12:00', FRI), true, 'no days stored = every day');
same(A({ ...u, access_from: '1899-12-30T10:00:00', access_to: '1899-12-30T20:00:00' }, '11:00', SAT), true, 'times the sheet turned into date-times still work');
same(A({ ...u, access_from: '10:00', access_to: '10:00' }, '10:00', SAT), false, 'broken window denies');
same(sandbox.accessText_(u), '10:00 AM – 8:00 PM, Sat, Sun, Mon, Tue, Wed, Thu', 'text');
same(sandbox.accessText_({ ...u, access_days: '' }), '10:00 AM – 8:00 PM, every day');
same(sandbox.hm12_('00:05'), '12:05 AM'); same(sandbox.hm12_('12:00'), '12:00 PM');

/* ---- saving ---- */
at('12:00', SAT);
const k = Q('user.save', { name: 'Karim', username: 'karim', password: 'secret1', role: 'sales', access_limit: true, access_from: '9:30', access_to: '18:00', access_days: ['fri', 'sat', 'xx', 'sun'] });
same([k.access_limit, k.access_from, k.access_to, k.access_days], [true, '09:30', '18:00', 'sat,sun,fri'], 'saved, cleaned and padded');
truthy(/working hours/.test(QF('user.save', { name: 'B', username: 'b1', password: 'secret1', role: 'sales', access_limit: true, access_from: '', access_to: '18:00', access_days: 'sat' }).error), 'times required');
truthy(/same/.test(QF('user.save', { name: 'B', username: 'b1', password: 'secret1', role: 'sales', access_limit: true, access_from: '10:00', access_to: '10:00', access_days: 'sat' }).error), 'same times refused');
truthy(/working day/.test(QF('user.save', { name: 'B', username: 'b1', password: 'secret1', role: 'sales', access_limit: true, access_from: '10:00', access_to: '18:00', access_days: [] }).error), 'a day required');
truthy(/working hours/.test(QF('user.save', { name: 'B', username: 'b1', password: 'secret1', role: 'sales', access_limit: true, access_from: '25:00', access_to: '18:00', access_days: 'sat' }).error), 'invalid time refused');
const ad = Q('user.save', { name: 'Boss2', username: 'boss2', password: 'secret1', role: 'admin', access_limit: true, access_from: '10:00', access_to: '11:00', access_days: 'sat' });
same(ad.access_limit, false, 'admins never get a limit');
same(Q('users.list').find((x) => x.id === k.id).access_days, 'sat,sun,fri', 'listed with hours');

/* ---- sign in ---- */
at('09:00', SAT);
let r = QF('login', { username: 'karim', password: 'secret1' });
truthy(/working hours are 9:30 AM – 6:00 PM, Sat, Sun, Fri/.test(r.error), 'login refused before hours with the hours in the message: ' + r.error);
same(r.auth, false, 'login error is not a session error');
truthy(/Invalid username or password/.test(QF('login', { username: 'karim', password: 'wrong!' }).error), 'wrong password does not reveal the hours');
at('09:30', SAT);
const kt = Q('login', { username: 'karim', password: 'secret1' }).token;
truthy(kt, 'can sign in at start time');
truthy(Q('bootstrap', {}, kt), 'works during hours');
at('12:00', 2); // Tuesday: not a working day
r = QF('bootstrap', {}, kt);
same(r.auth, true, 'request outside hours ends the session');
truthy(/^AUTH: Your working hours are/.test(r.error), 'session error carries the hours (the app strips AUTH:): ' + r.error);
at('10:00', SAT);
truthy(/expired|sign in/i.test(QF('bootstrap', {}, kt).error), 'session was removed — must sign in again');
const kt2 = Q('login', { username: 'karim', password: 'secret1' }).token;
at('18:00', SAT);
same(QF('products.list', {}, kt2).auth, true, 'signed out at the end time');
at('03:00', FRI);
truthy(Q('login', { username: 'admin', password: 'admin123' }).token, 'admin can sign in any time');

/* ---- removing the limit ---- */
at('12:00', SAT);
Q('user.save', { id: k.id, name: 'Karim', username: 'karim', role: 'sales', active: true, access_limit: false });
at('03:00', 2);
truthy(Q('login', { username: 'karim', password: 'secret1' }).token, 'no limit: any time');
same(Q('users.list').find((x) => x.id === k.id).access_from, '', 'hours cleared');
console.log('Working hours: ' + checks + ' checks passed');
`;
eval(harness + scenario);
