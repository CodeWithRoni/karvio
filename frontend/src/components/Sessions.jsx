import { api } from '../lib/api';
import { fdatetime } from '../lib/format';
import { useApi, Btn, Badge, ErrorBox, Empty, Loading, useAction, useConfirm } from './ui';

const ago = (iso) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 2 ? 'Just now' : m < 60 ? `${m} minutes ago` : m < 120 ? '1 hour ago' : `${Math.floor(m / 60)} hours ago`;
};
const RESULT = { ok: ['ok', 'Signed in'], failed: ['bad', 'Wrong password'], signed_out: ['muted', 'Signed out by admin'] };

/** Users & roles → Devices & logins: who is signed in on which device, sign a device out, and the login history. */
export default function Sessions() {
  const q = useApi('sessions.list', {});
  const [busy, run] = useAction();
  const [confirmUi, confirm] = useConfirm();
  const d = q.data;
  if (q.loading && !d) return <Loading label="Reading signed-in devices" />;
  if (q.error && !d) return <ErrorBox error={q.error} onRetry={q.reload} />;
  const others = d.sessions.filter((s) => !s.current);
  const revoke = async (payload, what) => {
    if (!(await confirm({ title: `Sign out ${what}?`, message: 'That device goes back to the sign-in page the next time it does anything. Work that was not saved there is lost.', confirmLabel: 'Sign out' }))) return;
    await run(() => api('sessions.revoke', payload), 'Signed out');
    q.reload();
  };
  return (
    <>
      {confirmUi}
      <ErrorBox error={q.error} onRetry={q.reload} />
      <section className="card">
        <div className="card-head"><h2>Signed in now</h2>{others.length > 0 && <Btn size="sm" busy={busy} onClick={() => revoke({ others: true }, 'all other devices')}>Sign out all other devices</Btn>}</div>
        {d.sessions.length ? (
          <div className="dt-scroll"><table className="dc-hist sess">
            <thead><tr><th>User</th><th>Device</th><th>Signed in</th><th>Last active</th><th /></tr></thead>
            <tbody>{d.sessions.map((s) => (
              <tr key={s.sid}>
                <td><b>{s.user}</b><small className="muted"> · {s.role}</small></td>
                <td>{s.device} {s.current && <Badge tone="ok">this device</Badge>}</td>
                <td>{fdatetime(s.signed_in)}</td>
                <td>{s.current ? 'Just now' : ago(s.last_active)}</td>
                <td className="r">{!s.current && <Btn size="sm" busy={busy} onClick={() => revoke({ sid: s.sid }, `${s.user} on ${s.device}`)} aria-label={`Sign out ${s.user} on ${s.device}`}>Sign out</Btn>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty compact icon="users" title="No devices listed yet">Devices appear here after their next sign-in.</Empty>}
        <p className="muted sess-note">A device that is closed without signing out stays listed for up to 6 hours after it was last used. "Last active" is updated about every 15 minutes.</p>
      </section>
      <section className="card" style={{ marginTop: 12 }}>
        <div className="card-head"><h2>Login history</h2><span className="muted">last {d.history.length} sign-ins and attempts</span></div>
        {d.history.length ? (
          <div className="dt-scroll"><table className="dc-hist sess">
            <thead><tr><th>When</th><th>User</th><th>Device</th><th>Result</th></tr></thead>
            <tbody>{d.history.map((h, i) => { const [tone, label] = RESULT[h.result] || ['muted', h.result]; return (
              <tr key={i}><td>{fdatetime(h.ts)}</td><td>{h.user}</td><td>{h.device}</td><td><Badge tone={tone}>{label}{h.by ? ` (${h.by})` : ''}</Badge></td></tr>
            ); })}</tbody>
          </table></div>
        ) : <Empty compact icon="receipt" title="No sign-ins recorded yet">Sign-ins and wrong-password attempts will be listed here.</Empty>}
      </section>
    </>
  );
}
