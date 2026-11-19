import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { money, fdate, fdatetime } from '../lib/format';
import { printHtml, esc } from '../lib/export';
import { useApi, Btn, Field, ErrorBox, Badge, Empty, Loading, useAction, Modal } from '../components/ui';
import DateInput from '../components/DateInput';

// Bangladeshi notes and coins, largest first.
const FACES = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
const sign = (v) => (v > 0 ? '+' : '') + money(v, false);

/** Shift & day close → Day close: count the drawer, compare with the books, record the difference and print a Z-report. */
export default function DayClose() {
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState('');
  const q = useApi('dayclose.get', { account_id: accountId, date }, [accountId, date]);
  const d = q.data;
  if (q.loading && !d) return <Loading label="Reading today's cash" />;
  if (q.error && !d) return <ErrorBox error={q.error} onRetry={q.reload} />;
  return (
    <>
      <div className="filters">
        <Field label="Account"><select value={d.account.id} onChange={(e) => setAccountId(e.target.value)} aria-label="Account to close">{d.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Field label="Day"><DateInput value={d.date} max={d.today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Day to close" /></Field>
      </div>
      <ErrorBox error={q.error} onRetry={q.reload} />
      {d.closed ? <ClosedView d={d} c={d.closed} onChanged={q.reload} /> : <CountForm key={`${d.account.id}:${d.date}`} d={d} onSaved={q.reload} />}
      <History d={d} />
    </>
  );
}

function Breakdown({ d, f }) {
  return (
    <div className="dc-sum">
      <div><span>Opening balance</span><b className="num">{money(f.opening, false)}</b></div>
      {d.lines.map((l) => <div key={l.type + l.direction} className="dc-line"><span>{l.direction === 'in' ? '+' : '−'} {l.label} <small>({l.count})</small></span><b className="num">{l.direction === 'in' ? '' : '−'}{money(l.amount, false)}</b></div>)}
      {!d.lines.length && <div className="dc-line"><span className="muted">No money moved in or out on this day</span><b /></div>}
      <div className="dc-big"><span>Should be in {d.account.type === 'cash' ? 'the drawer' : 'the account'}</span><b className="num">{money(f.expected)}</b></div>
    </div>
  );
}

function CountForm({ d, onSaved }) {
  const [busy, run] = useAction();
  const [notes, setNotes] = useState({});
  const [manual, setManual] = useState('');
  const [note, setNote] = useState('');
  const [adjust, setAdjust] = useState(true);
  useEffect(() => { setNotes({}); setManual(''); setNote(''); }, [d.account.id, d.date]);
  const fromNotes = useMemo(() => FACES.reduce((s, f) => s + f * (Number(notes[f]) || 0), 0), [notes]);
  const anyNotes = FACES.some((f) => Number(notes[f]) > 0);
  const counted = anyNotes ? fromNotes : manual === '' ? null : Number(manual);
  const diff = counted === null ? null : Math.round((counted - d.expected) * 100) / 100;
  const off = diff !== null && Math.abs(diff) > 0.005;
  const save = async () => {
    await run(() => api('dayclose.save', { account_id: d.account.id, date: d.date, counted, notes: anyNotes ? notes : {}, note, adjust: off && adjust }), `${d.account.name} closed for ${fdate(d.date)}`);
    onSaved();
  };
  return (
    <div className="dc-grid">
      <section className="card">
        <div className="card-head"><h2>Count {d.account.type === 'cash' ? 'the cash drawer' : d.account.name} — {fdate(d.date)}</h2><Badge tone="warn">Not closed yet</Badge></div>
        {d.account.type === 'cash' ? (
          <>
            <div className="dc-notes">
              {FACES.map((f) => (
                <label key={f}><span>Tk {f} ×</span>
                  <input type="number" min="0" step="1" inputMode="numeric" value={notes[f] ?? ''} placeholder="0" aria-label={`Number of Tk ${f}`}
                    onChange={(e) => setNotes({ ...notes, [f]: e.target.value.replace(/[^0-9]/g, '') })} onWheel={(e) => e.currentTarget.blur()} />
                  <b className="num">{money(f * (Number(notes[f]) || 0), false)}</b></label>
              ))}
            </div>
            <p className="muted dc-help">Type how many of each note and coin are in the drawer; the total fills in by itself. Or type the total below.</p>
          </>
        ) : <p className="muted dc-help">Check the balance in the bank or mobile banking app and type it below.</p>}
        <Field label="Counted total"><input type="number" min="0" step="any" value={anyNotes ? fromNotes : manual} disabled={anyNotes} onChange={(e) => setManual(e.target.value)} aria-label="Counted total" /></Field>
      </section>
      <section className="card">
        <div className="card-head"><h2>Expected vs counted</h2></div>
        <Breakdown d={d} f={d} />
        <div className="dc-sum"><div className="dc-big"><span>Counted</span><b className="num">{counted === null ? '—' : money(counted)}</b></div></div>
        {diff !== null && (
          <div className={`dc-diff ${!off ? 'ok' : diff < 0 ? 'short' : 'over'}`}>
            <span>{!off ? 'Matches the books' : diff < 0 ? 'Short by' : 'Extra cash'}</span><b>{off ? money(Math.abs(diff)) : '✓'}</b>
          </div>
        )}
        {off && <>
          <Field label="Note (required when there is a difference)"><input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Gave change from personal wallet" /></Field>
          <label className="check" style={{ marginTop: 10 }}><input type="checkbox" checked={adjust} onChange={(e) => setAdjust(e.target.checked)} />
            Correct the balance to the counted amount (books a {diff < 0 ? 'withdrawal' : 'deposit'} of {money(Math.abs(diff))})</label>
        </>}
        <div className="dc-actions">
          <Btn onClick={() => printZ(d, { counted, difference: diff, notes, note })} disabled={counted === null}>Print Z-report</Btn>
          <Btn kind="primary" busy={busy} disabled={counted === null || (off && !note.trim())} onClick={save}>Close the day</Btn>
        </div>
      </section>
    </div>
  );
}

function ClosedView({ d, c, onChanged }) {
  const [reopen, setReopen] = useState(false);
  const user = useStore((s) => s.user);
  return (
    <div className="dc-grid">
      <section className="card">
        <div className="card-head"><h2>{c.account_name} — {fdate(c.date)}</h2><Badge tone="ok">{d.locked ? 'Closed · locked' : 'Closed'}</Badge></div>
        <p className="muted" style={{ marginTop: 0 }}>Closed by {c.closed_by} at {fdatetime(c.closed_at)}.{c.adjusted ? ' The balance was corrected to the counted amount.' : ''}</p>
        {Object.keys(c.notes || {}).length > 0 && (
          <div className="dc-notes readonly">
            {FACES.filter((f) => c.notes[f]).map((f) => <label key={f}><span>Tk {f} ×</span><b>{c.notes[f]}</b><b className="num">{money(f * c.notes[f], false)}</b></label>)}
          </div>
        )}
        {c.note && <p><b>Note:</b> {c.note}</p>}
        {d.locked && <p className="dc-lock" role="note">This day is locked. Sales money, expenses, payments and cancellations dated <b>{fdate(c.date)}</b> can no longer be added or changed in <b>{c.account_name}</b>.</p>}
        <div className="dc-actions"><Btn onClick={() => setReopen(true)}>Reopen the day</Btn></div>
        {reopen && <ReopenDialog c={c} admin={user?.role === 'admin'} onClose={() => setReopen(false)} onDone={onChanged} />}
      </section>
      <section className="card">
        <div className="card-head"><h2>Expected vs counted</h2></div>
        <Breakdown d={{ ...d, lines: c.lines || [] }} f={c} />
        <div className="dc-sum"><div className="dc-big"><span>Counted</span><b className="num">{money(c.counted)}</b></div></div>
        <div className={`dc-diff ${Math.abs(c.difference) <= 0.005 ? 'ok' : c.difference < 0 ? 'short' : 'over'}`}>
          <span>{Math.abs(c.difference) <= 0.005 ? 'Matched the books' : c.difference < 0 ? 'Short by' : 'Extra cash'}</span><b>{Math.abs(c.difference) <= 0.005 ? '✓' : money(Math.abs(c.difference))}</b>
        </div>
        <div className="dc-actions"><Btn onClick={() => printZ({ ...d, lines: c.lines || [], opening: c.opening, expected: c.expected }, c)}>Print Z-report</Btn></div>
      </section>
    </div>
  );
}

function ReopenDialog({ c, admin, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [busy, run] = useAction();
  const submit = async (e) => {
    e?.preventDefault();
    await run(() => api('dayclose.reopen', { account_id: c.account_id, date: c.date, reason, password }), `${c.account_name} reopened for ${fdate(c.date)}`);
    onClose(); onDone();
  };
  return (
    <Modal open size="sm" title={`Reopen ${c.account_name} — ${fdate(c.date)}`} onClose={onClose}
      footer={<><Btn onClick={onClose}>Keep it closed</Btn><Btn kind="primary" busy={busy} disabled={!reason.trim() || !password} onClick={submit}>Reopen the day</Btn></>}>
      <form className="form" onSubmit={submit}>
        <p className="muted">Entries for this day can be added and changed again. The count stays in the history, marked reopened; close the day again when you are done.</p>
        <Field label="Reason" wide><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. an expense was missed" required /></Field>
        <Field label={admin ? 'Your password' : 'Admin password'} wide hint="Required to reopen a closed day."><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
      </form>
    </Modal>
  );
}

function History({ d }) {
  return (
    <section className="card" style={{ marginTop: 12 }}>
      <div className="card-head"><h2>Previous closings — {d.account.name}</h2></div>
      {d.history.length ? (
        <div className="dt-scroll"><table className="dc-hist">
          <thead><tr><th>Day</th><th>Closed by</th><th className="r">Expected</th><th className="r">Counted</th><th className="r">Difference</th><th>Note</th></tr></thead>
          <tbody>{d.history.map((h) => (
            <tr key={h.id}><td>{fdate(h.date)}</td><td>{h.closed_by}</td><td className="r num">{money(h.expected, false)}</td><td className="r num">{money(h.counted, false)}</td>
              <td className="r num"><Badge tone={Math.abs(h.difference) <= 0.005 ? 'ok' : h.difference < 0 ? 'bad' : 'info'}>{Math.abs(h.difference) <= 0.005 ? '0' : sign(h.difference)}</Badge></td>
              <td className="muted">{h.note || '—'}{h.adjusted ? ' · balance corrected' : ''}{h.reopened ? ` · reopened by ${h.reopened_by}: ${h.reopen_reason}` : ''}</td></tr>
          ))}</tbody>
        </table></div>
      ) : <Empty compact icon="receipt" title="No closings yet">Closed days for this account will be listed here.</Empty>}
    </section>
  );
}

/** Z-report: one page with the day's money movement and the count. */
function printZ(d, c) {
  const s = useStore.getState().settings;
  const rows = (d.lines || []).map((l) => `<tr><td>${l.direction === 'in' ? '+' : '−'} ${esc(l.label)} (${l.count})</td><td class="r">${l.direction === 'in' ? '' : '−'}${esc(money(l.amount, false))}</td></tr>`).join('');
  const noteRows = FACES.filter((f) => Number(c.notes?.[f]) > 0).map((f) => `<tr><td>Tk ${f} × ${Number(c.notes[f])}</td><td class="r">${esc(money(f * Number(c.notes[f]), false))}</td></tr>`).join('');
  const diff = Number(c.difference) || 0;
  printHtml(`<style>body{font:13px/1.45 sans-serif;max-width:340px;margin:0 auto;color:#000}h1{font-size:17px;margin:0}h2{font-size:14px;margin:12px 0 4px;border-bottom:1px solid #000}table{width:100%;border-collapse:collapse}td{padding:2px 0}.r{text-align:right}.b td{font-weight:700;border-top:1px solid #000}.c{text-align:center}</style>
  <div class="c"><h1>${esc(s.shop_name || 'Karvio')}</h1><div>${esc(s.shop_address || '')}</div><b>Z-REPORT — DAY CLOSE</b><div>${esc(d.account.name)} · ${esc(fdate(d.date))}</div></div>
  <h2>Money in and out</h2><table><tr><td>Opening balance</td><td class="r">${esc(money(d.opening, false))}</td></tr>${rows}<tr class="b"><td>Expected</td><td class="r">${esc(money(d.expected, false))}</td></tr></table>
  ${noteRows ? `<h2>Notes and coins</h2><table>${noteRows}</table>` : ''}
  <h2>Count</h2><table><tr><td>Counted</td><td class="r">${esc(money(c.counted, false))}</td></tr><tr class="b"><td>${Math.abs(diff) <= 0.005 ? 'Difference' : diff < 0 ? 'Short' : 'Extra'}</td><td class="r">${esc(money(Math.abs(diff), false))}</td></tr></table>
  ${c.note ? `<p>Note: ${esc(c.note)}</p>` : ''}
  <p>${c.closed_by ? `Closed by ${esc(c.closed_by)} · ${esc(fdatetime(c.closed_at))}` : `Printed ${esc(new Date().toLocaleString())} (not closed yet)`}</p><p>Signature: ____________________</p>`);
}
