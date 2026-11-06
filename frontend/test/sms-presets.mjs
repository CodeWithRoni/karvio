// node test/sms-presets.mjs — the preset box must show the provider the saved SMS settings belong to.
import assert from 'node:assert/strict';
import { PRESETS, matchPreset } from '../src/lib/smsPresets.js';
let n = 0; const is = (f, want, msg) => { assert.equal(matchPreset(f), want, msg); n++; };
const OCS = 'OneCodeSoft (Bulk SMS API v3)', MR = 'MRAM Technologies (sms.mram.com.bd)', MRU = 'MRAM Technologies — Bangla SMS (unicode)';
// every preset, applied as-is, is recognised as itself
for (const [k, p] of Object.entries(PRESETS)) is({ sms_body: '', sms_body_type: 'form', ...p, sms_api_key: 'x', sms_sender_id: '88' }, k, k);
is({}, '', 'nothing set yet → placeholder');
is({ sms_url: '  ' }, '', 'blank url → placeholder');
const ocs = PRESETS[OCS];
is({ ...ocs, sms_url: 'https://app.onecodesoft.com/api/v3/send-sms' }, OCS, 'own base URL kept');
is({ ...ocs, sms_url: 'https://app.onecodesoft.com/api/v3/sandbox/send-sms' }, OCS, 'sandbox');
is({ ...ocs, sms_url: 'https://app.onecodesoft.com/api/v3/send-sms/' }, OCS, 'trailing slash');
is({ ...ocs, sms_url: 'https://app.onecodesoft.com/api/v2/send' }, 'custom', 'other path');
is({ ...ocs, sms_headers: 'Authorization: Bearer {api_key}\nAccept: application/json\n' }, OCS, 'trailing newline in headers');
is({ ...ocs, sms_headers: '' }, 'custom', 'headers removed');
is({ ...PRESETS[MR], sms_url: PRESETS[MR].sms_url.replace('&label=transactional', '') }, MR, 'label dropped');
is({ ...PRESETS[MR], sms_url: PRESETS[MR].sms_url.replace('type=text', 'type=unicode') }, MRU, 'text vs unicode');
is({ ...PRESETS[MR], sms_url: 'https://other.com/smsapi?api_key={api_key}' }, 'custom', 'other host');
is({ ...PRESETS[MR], sms_method: 'POST' }, 'custom', 'method changed');
is({ ...PRESETS['Generic JSON POST'], sms_url: 'https://mygateway.bd/send' }, 'Generic JSON POST', 'generic with own url');
is({ sms_url: 'not a url', sms_method: 'GET', sms_number_format: 'intl', sms_headers: '' }, 'custom', 'bad url');
console.log(`sms-presets: ${n} checks passed`);
