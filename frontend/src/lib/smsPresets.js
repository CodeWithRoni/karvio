// SMS gateway presets and detection of which one the saved settings match.
export const PRESETS = {
  'OneCodeSoft (Bulk SMS API v3)': { sms_method: 'POST', sms_body_type: 'json', sms_url: 'https://PASTE-BASE-URL-FROM-DASHBOARD/v3/send-sms', sms_body: '{"number":"{number}","message":"{message}","senderid":"{sender_id}"}', sms_headers: 'Authorization: Bearer {api_key}\nAccept: application/json', sms_number_format: 'intl' },
  'BulkSMSBD (GET)': { sms_headers: '', sms_method: 'GET', sms_url: 'https://bulksmsbd.net/api/smsapi?api_key={api_key}&type=text&number={number}&senderid={sender_id}&message={message}', sms_number_format: 'intl' },
  'Generic JSON POST': { sms_headers: '', sms_method: 'POST', sms_body_type: 'json', sms_url: 'https://api.example.com/sms/send', sms_body: '{"api_key":"{api_key}","senderid":"{sender_id}","contacts":"{number}","msg":"{message}"}', sms_number_format: 'intl' },
  'Generic form POST': { sms_headers: '', sms_method: 'POST', sms_body_type: 'form', sms_url: 'https://api.example.com/sms/send', sms_body: 'api_key={api_key}&senderid={sender_id}&number={number}&message={message}', sms_number_format: 'local' }
};

/** Which preset the current SMS settings came from ('' = nothing set yet, 'custom' = the user's own setup).
 *  Matching is done from the saved values, so the box keeps showing the provider after a reload, and still
 *  shows it once the user has pasted their own base URL / key into the preset's fields. */
const PH = /^\{\w+\}$/;
function urlParts(u) {
  try { const x = new URL(u); return { base: (x.origin + x.pathname).replace(/\/+$/, '').toLowerCase(), q: x.searchParams }; } catch { return null; }
}
export function matchPreset(f) {
  const url = (f.sms_url || '').trim();
  if (!url) return '';
  const norm = (v) => String(v ?? '').trim();
  for (const [name, p] of Object.entries(PRESETS)) {
    const same = Object.keys(p).filter((k) => k !== 'sms_url').every((k) => norm(f[k]) === norm(p[k]));
    if (!same) continue;
    if (/api\.example\.com/.test(p.sms_url)) return name; // generic shapes: any address
    if (/PASTE-BASE-URL/.test(p.sms_url)) { // OneCodeSoft: the user's own base URL + /v3/send-sms or the sandbox
      if (/PASTE-BASE-URL/i.test(url) || /\/v3\/(sandbox\/)?send-sms\/?$/i.test(url.split('?')[0])) return name;
      continue;
    }
    const a = urlParts(url), b = urlParts(p.sms_url);
    if (!a || !b || a.base !== b.base) continue;
    const fixed = [...b.q.entries()].filter(([k, v]) => !PH.test(v) && k !== 'label'); // e.g. type=text vs type=unicode
    if (fixed.every(([k, v]) => (a.q.get(k) || '').toLowerCase() === v.toLowerCase())) return name;
  }
  return 'custom';
}
