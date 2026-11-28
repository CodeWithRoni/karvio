import { useEffect, useState } from 'react';
import { endpoint } from '../lib/api';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (d) => { const [y, m, dd] = d.split('-').map(Number); return `${dd} ${MONTHS[m - 1]} ${y}`; };

/**
 * Shops on the Karvio server (API at /api on the shop's own address): the Administrator sees when the
 * subscription is about to end. Shops on any other backend never ask, so nothing changes for them.
 */
export default function RenewNotice({ show }) {
  const [sub, setSub] = useState(null);
  const url = endpoint();
  const selfHosted = /^\/api\/?$/.test(url);
  useEffect(() => {
    if (!show || !selfHosted) return undefined;
    let live = true;
    fetch('/api/subscription', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j?.ok && j.data?.warn && j.data.paid_until) setSub(j.data); })
      .catch(() => { /* the notice is optional */ });
    return () => { live = false; };
  }, [show, selfHosted]);
  if (!sub) return null;
  const left = sub.days_left;
  const text = left > 0
    ? `Your Karvio subscription ends on ${day(sub.paid_until)} (${left} day${left === 1 ? '' : 's'} left). Contact Karvio to renew.`
    : left === 0
      ? `Your Karvio subscription ends today (${day(sub.paid_until)}). Contact Karvio to renew.`
      : `Your Karvio subscription ended on ${day(sub.paid_until)}. Renew within ${Math.max(0, sub.grace_days + left + 1)} day(s) to keep the shop open.`;
  return (
    <div role="status" style={{ margin: '0 0 12px', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--warn)', color: 'var(--warn)', background: 'var(--panel)', fontSize: 14 }}>
      {text}
    </div>
  );
}
