import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { money, fdatetime } from '../lib/format';
import { printHtml, esc } from '../lib/export';
import { useApi, PageHead, Btn, Field, ErrorBox, Badge, Empty, Loading, useAction, Modal, Tabs } from '../components/ui';
import DayClose from './DayClose';

// Bangladeshi notes and coins, largest first.
export const FACES = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
const sign = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + money(Math.abs(v), false);
const off = (v) => Math.abs(Number(v) || 0) > 0.005;
const notesTotal = (notes) => FACES.reduce((s, f) => s + f * (Number(notes[f]) || 0), 0);
const anyNotes = (notes) => FACES.some((f) => Number(notes[f]) > 0);

/** Shift & day close: open a shift with the counted drawer cash, close it by counting; the day close lives here too. */
export default function Shifts() {
  const can = useStore((s) => s.can);
  const [params, setParams] = useSearchParams();
  const tabs = [['open', 'Open shifts'], ['history', 'Shift history'], ...(can('accounts') ? [['dayclose', 'Day close']] : [])];
  const tab = tabs.some((t) => t[0] === params.get('tab')) ? params.get('tab') : 'open';
  const q = useApi('shifts.list', {}, []);
  const [opening, setOpening] = useState(false);
  const [closing, setClosing] = useState(null);
  const d = q.data;
  const head = (
    <PageHead title="Shift & day close" sub="Open a shift with the cash in the drawer, close it by counting — the system shows if cash is short or over.">
      <Tabs tabs={tabs} value={tab} onChange={(v) => setParams(v === 'open' ? {} : { tab: v }, { replace: true })} />
      {tab !== 'dayclose' && d && <Btn kind="primary" onClick={() => setOpening(true)}>▶ Open shift</Btn>}
    </PageHead>
  );
  if (tab === 'dayclose') return <>{head}<DayClose /></>;
  if (q.loading && !d) return <>{head}<Loading label="Reading shifts" /></>;
  if (q.error && !d) return <>{head}<ErrorBox error={q.error} onRetry={q.reload} /></>;
  return (
    <>
      {head}
      <ErrorBox error={q.error} onRetry={q.reload} />
      {tab === 'open' ? <>
        <div className="sh-stats">
          <div className="card"><span>Open shifts</span><b className="num">{d.stats.open}</b></div>
          <div className="card"><span>Cash in drawers now</span><b className="num">{money(d.stats.in_drawers)}</b></div>
          <div className="card"><span>Closed today</span><b className="num">{d.stats.closed_today}</b></div>
          <div className="card"><span>Short / over today</span><b className={`num ${d.stats.difference_today < -0.005 ? 'bad' : d.stats.difference_today > 0.005 ? 'warn' : ''}`}>{off(d.stats.difference_today) ? (d.stats.difference_today < 0 ? '− ' : '+ ') + money(Math.abs(d.stats.difference_today)) : money(0)}</b></div>
        </div>
        {d.open.length ? <div className="sh-open">{d.open.map((s) => <OpenCard key={s.id} s={s} onClose={() => setClosing(s)} />)}</div>
          : <Empty icon="receipt" title="No shift is open">{d.required ? 'Selling needs an open shift — open one to start.' : 'Open a shift with the cash in the drawer to start counting.'}</Empty>}
        <section className="card" style={{ marginTop: 12 }}>
          <div className="card-head"><h2>Recent closed shifts</h2></div>
          <ShiftTable rows={d.history.slice(0, 8)} />
        </section>
      </> : (
        <section className="card"><div className="card-head"><h2>Shift history</h2><span className="muted">{d.can_all ? 'All cashiers' : 'Your shifts'}</span></div><ShiftTable rows={d.history} /></section>
      )}
      {opening && <OpenShift accounts={d.accounts} mode={d.mode} onClose={() => setOpening(false)} onDone={q.reload} />}
      {closing && <CloseShift s={closing} onClose={() => setClosing(null)} onDone={q.reload} />}
    </>
  );
}

function OpenCard({ s, onClose }) {
  return (
    <section className="card">
      <div className="card-head"><h2>{s.user} — {s.account_name}</h2><Badge tone="ok">{s.no} · open since {fdatetime(s.opened_at)}</Badge></div>
      <Breakdown s={s} />
      <div className="dc-actions"><Btn onClick={() => printShift(s, null)}>Print X-report</Btn><Btn kind="primary" onClick={onClose}>■ Close shift</Btn></div>
    </section>
  );
}

function Breakdown({ s, counted }) {
  return (
    <div className="dc-sum">
      <div><span>Opening cash (counted)</span><b className="num">{money(s.opening, false)}</b></div>
      {(s.lines || []).map((l) => <div key={l.type + l.direction} className="dc-line"><span>{l.direction === 'in' ? '+' : '−'} {l.label} <small>({l.count})</small></span><b className="num">{l.direction === 'in' ? '' : '−'}{money(l.amount, false)}</b></div>)}
      {!(s.lines || []).length && <div className="dc-line"><span className="muted">No money moved in or out yet</span><b /></div>}
      <div className="dc-big"><span>Should be in the drawer</span><b className="num">{money(s.expected)}</b></div>
      {counted !== undefined && <div className="dc-big"><span>Counted</span><b className="num">{counted === null ? '—' : money(counted)}</b></div>}
    </div>
  );
}

function ShiftTable({ rows }) {
  if (!rows.length) return <Empty compact icon="receipt" title="No closed shifts yet">Closed shifts will be listed here.</Empty>;
  return (
    <div className="dt-scroll"><table className="dc-hist">
      <thead><tr><th>Shift</th><th>Cashier</th><th>Drawer</th><th>Opened → closed</th><th className="r">Opening</th><th className="r">Expected</th><th className="r">Counted</th><th className="r">Difference</th><th>Note</th><th /></tr></thead>
      <tbody>{rows.map((h) => (
        <tr key={h.id}><td>{h.no}</td><td>{h.user}{h.closed_by !== h.user ? <small className="muted"> · closed by {h.closed_by}</small> : ''}</td><td>{h.account_name}</td>
          <td>{fdatetime(h.opened_at)} → {fdatetime(h.closed_at)}</td><td className="r num">{money(h.opening, false)}</td><td className="r num">{money(h.expected, false)}</td><td className="r num">{money(h.counted, false)}</td>
          <td className="r num"><Badge tone={!off(h.difference) ? 'ok' : h.difference < 0 ? 'bad' : 'info'}>{!off(h.difference) ? '✓ 0' : sign(h.difference)}</Badge></td>
          <td className="muted">{h.note || '—'}{h.adjusted ? ' · balance corrected' : ''}</td>
          <td><Btn size="sm" onClick={() => printShift(h, h)}>Print</Btn></td></tr>
      ))}</tbody>
    </table></div>
  );
}

function NotesBox({ notes, setNotes, label = 'Count by notes (optional)' }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="sh-notes">
      <button type="button" className="sh-notes-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? '▾' : '▸'} {label}</button>
      {open && <div className="sh-notes-grid">{FACES.map((f) => (
        <label key={f}><span>Tk {f}</span>
          <input type="number" min="0" step="1" inputMode="numeric" value={notes[f] ?? ''} placeholder="0" aria-label={`Number of Tk ${f}`}
            onChange={(e) => setNotes({ ...notes, [f]: e.target.value.replace(/[^0-9]/g, '') })} onWheel={(e) => e.currentTarget.blur()} /></label>
      ))}</div>}
      <div className="sh-notes-total"><span>Counted from notes</span><b className="num">{money(notesTotal(notes))}</b></div>
    </div>
  );
}

/** Open a shift: pick the drawer, count the cash. Used on this page and from the POS. */
export function OpenShift({ accounts, mode, onClose, onDone }) {
  const user = useStore((s) => s.user);
  const cash = accounts.filter((a) => a.type === 'cash');
  const [accountId, setAccountId] = useState((cash[0] || accounts[0] || {}).id || '');
  const [notes, setNotes] = useState({});
  const [manual, setManual] = useState('');
  const [note, setNote] = useState('');
  const [busy, run] = useAction();
  const acc = accounts.find((a) => a.id === accountId);
  const fromNotes = anyNotes(notes);
  const opening = fromNotes ? notesTotal(notes) : manual === '' ? null : Number(manual);
  const prev = acc?.last_counted;
  const submit = async () => {
    await run(() => api('shift.open', { account_id: accountId, opening, notes: fromNotes ? notes : {}, note }), `Shift opened with ${money(opening)}`);
    onClose(); onDone?.();
  };
  return (
    <Modal open size="lg" title="Open shift" onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!accountId || opening === null || !(opening >= 0)} onClick={submit}>▶ Open shift with {money(opening || 0)}</Btn></>}>
      <div className="sh-two">
        <Field label="Cash drawer"><select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Cash drawer">
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type.toUpperCase()})</option>)}</select></Field>
        <Field label="Opening cash in drawer"><input type="number" min="0" step="any" value={fromNotes ? notesTotal(notes) : manual} disabled={fromNotes} onChange={(e) => setManual(e.target.value)} aria-label="Opening cash in drawer" placeholder="0" /></Field>
      </div>
      <p className="muted sh-hint">{mode === 'shared' ? 'One shared shift for this drawer' : <>Cashier: <b>{user?.name}</b></>}
        {prev !== null && prev !== undefined && <> · The last close of this drawer left <b>{money(prev)}</b>{opening !== null && (off(opening - prev) ? <b className={opening < prev ? 'bad' : 'warn'}> — {opening < prev ? 'short' : 'over'} by {money(Math.abs(opening - prev))}</b> : <> — matches</>)}.</>}</p>
      <NotesBox notes={notes} setNotes={setNotes} />
      <Field label="Note" wide><input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></Field>
    </Modal>
  );
}

/** Close a shift: count the drawer, compare with what should be there, explain any difference. */
export function CloseShift({ s, onClose, onDone }) {
  const [notes, setNotes] = useState({});
  const [manual, setManual] = useState('');
  const [note, setNote] = useState('');
  const [adjust, setAdjust] = useState(true);
  const [busy, run] = useAction();
  const fromNotes = anyNotes(notes);
  const counted = fromNotes ? notesTotal(notes) : manual === '' ? null : Number(manual);
  const diff = useMemo(() => (counted === null ? null : Math.round((counted - s.expected) * 100) / 100), [counted, s.expected]);
  const isOff = diff !== null && off(diff);
  const submit = async () => {
    const rec = await run(() => api('shift.close', { id: s.id, counted, notes: fromNotes ? notes : {}, note, adjust: isOff && adjust }), `${s.no} closed`);
    onClose(); onDone?.(rec);
  };
  return (
    <Modal open size="lg" title={`Close shift — ${s.user} · ${s.account_name}`} onClose={onClose}
      footer={<><Btn onClick={() => printShift(s, { counted, difference: diff, notes, note })} disabled={counted === null}>Print Z-report</Btn><Btn onClick={onClose}>Cancel</Btn>
        <Btn kind="primary" busy={busy} disabled={counted === null || (isOff && !note.trim())} onClick={submit}>■ Close shift</Btn></>}>
      <div className="sh-close">
        <div>
          <NotesBox notes={notes} setNotes={setNotes} />
          <Field label="Counted total"><input type="number" min="0" step="any" value={fromNotes ? notesTotal(notes) : manual} disabled={fromNotes} onChange={(e) => setManual(e.target.value)} aria-label="Counted total" placeholder="0" /></Field>
        </div>
        <div>
          <Breakdown s={s} counted={counted} />
          {diff !== null && <div className={`dc-diff ${!isOff ? 'ok' : diff < 0 ? 'short' : 'over'}`}><span>{!isOff ? 'Matches' : diff < 0 ? 'Short by' : 'Extra cash'}</span><b>{isOff ? money(Math.abs(diff)) : '✓'}</b></div>}
          {isOff && <>
            <Field label="Note (required when there is a difference)"><input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Gave change from personal wallet" /></Field>
            <label className="check" style={{ marginTop: 10 }}><input type="checkbox" checked={adjust} onChange={(e) => setAdjust(e.target.checked)} />
              Correct the balance to the counted amount (books a {diff < 0 ? 'withdrawal' : 'deposit'} of {money(Math.abs(diff))})</label>
          </>}
        </div>
      </div>
    </Modal>
  );
}

/** X-report (shift still open, c = null) or Z-report (closed or being closed). */
function printShift(s, c) {
  const st = useStore.getState().settings || {};
  const rows = (s.lines || []).map((l) => `<tr><td>${l.direction === 'in' ? '+' : '−'} ${esc(l.label)} (${l.count})</td><td class="r">${l.direction === 'in' ? '' : '−'}${esc(money(l.amount, false))}</td></tr>`).join('');
  const notes = c?.notes || {};
  const noteRows = FACES.filter((f) => Number(notes[f]) > 0).map((f) => `<tr><td>Tk ${f} × ${Number(notes[f])}</td><td class="r">${esc(money(f * Number(notes[f]), false))}</td></tr>`).join('');
  const diff = Number(c?.difference) || 0;
  printHtml(`<style>body{font:13px/1.45 sans-serif;max-width:340px;margin:0 auto;color:#000}h1{font-size:17px;margin:0}h2{font-size:14px;margin:12px 0 4px;border-bottom:1px solid #000}table{width:100%;border-collapse:collapse}td{padding:2px 0}.r{text-align:right}.b td{font-weight:700;border-top:1px solid #000}.c{text-align:center}</style>
  <div class="c"><h1>${esc(st.shop_name || 'Karvio')}</h1><div>${esc(st.shop_address || '')}</div><b>${c ? 'Z-REPORT — SHIFT CLOSE' : 'X-REPORT — SHIFT SO FAR'}</b><div>${esc(s.no)} · ${esc(s.user)} · ${esc(s.account_name)}</div><div>Opened ${esc(fdatetime(s.opened_at))}</div></div>
  <h2>Money in and out</h2><table><tr><td>Opening cash</td><td class="r">${esc(money(s.opening, false))}</td></tr>${rows}<tr class="b"><td>Should be in the drawer</td><td class="r">${esc(money(s.expected, false))}</td></tr></table>
  ${noteRows ? `<h2>Notes and coins</h2><table>${noteRows}</table>` : ''}
  ${c && c.counted !== null && c.counted !== undefined ? `<h2>Count</h2><table><tr><td>Counted</td><td class="r">${esc(money(c.counted, false))}</td></tr><tr class="b"><td>${!off(diff) ? 'Difference' : diff < 0 ? 'Short' : 'Extra'}</td><td class="r">${esc(money(Math.abs(diff), false))}</td></tr></table>` : ''}
  ${c?.note ? `<p>Note: ${esc(c.note)}</p>` : ''}
  <p>${c?.closed_by ? `Closed by ${esc(c.closed_by)} · ${esc(fdatetime(c.closed_at))}` : `Printed ${esc(new Date().toLocaleString())}${c ? ' (not closed yet)' : ''}`}</p><p>Signature: ____________________</p>`);
}
