import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { money, fdate, today, addDays } from '../lib/format';
import { Btn, ErrorBox, Loading, PageHead, useApi } from '../components/ui';
import DataTable from '../components/DataTable';
import DateInput from '../components/DateInput';
import DocViewer from '../components/DocViewer';
import PartyPicker from '../components/PartyPicker';
import { waUrl, firstPhone } from '../lib/whatsapp';
import { LEDGER_TXT, tagOf, balText, periodText, rowText, subText, statementPaper, listPaper, printLedger, pdfLedger, excelLedger, ledgerMessage } from '../lib/ledgerDocs';

/**
 * Customer / Supplier Ledger Report (admin only). No one chosen: every party in the period. One chosen: the full ledger
 * with each invoice's items and serial numbers, the account money went through, adjustments with their reason and dues
 * by age. Print and PDF give the paper statement; Excel and WhatsApp are also here.
 */
const TONE = { s: 'info', c: 'ok', r: 'bad', a: 'warn' };
const PERIODS = [['today', 'Today'], ['month', 'This month'], ['last', 'Last month'], ['year', 'This year'], ['all', 'All time'], ['custom', 'Custom']];
function range(p, custom) {
  const t = today(), m = t.slice(0, 8) + '01';
  if (p === 'today') return { from: t, to: t };
  if (p === 'month') return { from: m, to: t };
  if (p === 'last') { const end = addDays(m, -1); return { from: end.slice(0, 8) + '01', to: end }; }
  if (p === 'year') return { from: t.slice(0, 5) + '01-01', to: t };
  if (p === 'custom') return custom;
  return { from: '', to: '' };
}
const ENTRIES = { customer: [['all', 'All entries'], ['sale', 'Sales'], ['payment', 'Collections'], ['return', 'Returns'], ['adjust', 'Adjustments']], supplier: [['all', 'All entries'], ['sale', 'Purchases'], ['payment', 'Payments'], ['return', 'Returns'], ['adjust', 'Adjustments / rebates']] };

export default function LedgerReport({ kind }) {
  const L = LEDGER_TXT[kind];
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const accounts = useStore((s) => s.accounts) || [];
  const partyId = params.get('party') || '';
  const [period, setPeriod] = useState(partyId ? 'all' : 'month');
  const [custom, setCustom] = useState({ from: today().slice(0, 8) + '01', to: today() });
  const [f, setF] = useState({ entry: 'all', account: '', ref: '', items: true, serials: true, dueOnly: false, hideZero: true, overdue: false });
  const [doc, setDoc] = useState(null);
  const shownKind = useRef(kind);
  useEffect(() => { if (shownKind.current !== kind) { shownKind.current = kind; setPeriod(partyId ? 'all' : 'month'); setF((x) => ({ ...x, entry: 'all', account: '', ref: '' })); } }, [kind]);
  const { from, to } = range(period, custom);
  const req = { kind, party_id: partyId, from, to, ...(partyId ? { entry: f.entry, account: f.account, ref: f.ref.trim(), due_only: f.dueOnly } : {}) };
  const rep = useApi('ledger.report', req, [JSON.stringify(req)]);
  const d = rep.data && rep.data.kind === kind && (!!rep.data.party === !!partyId) ? rep.data : null;
  const setParty = (id) => setParams(id ? { party: id } : {}, { replace: true });
  const listRows = useMemo(() => (d && !d.party ? d.rows.filter((r) => (!f.hideZero || Math.abs(r.closing) > 0.004 || Math.abs(r.sales) > 0.004 || Math.abs(r.paid) > 0.004) && (!f.overdue || (r.oldest_days ?? -1) > 30)) : []), [d, f.hideZero, f.overdue]);
  const name = d?.party ? d.party.name : `${L.who}s`;
  const file = `${kind}-ledger-${(d?.party?.name || 'all').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${today()}`;
  const paper = () => (d.party ? statementPaper(kind, d, { items: f.items, serials: f.serials }) : listPaper(kind, d, listRows));
  const t = d?.totals;
  const sendWa = () => window.open(waUrl(firstPhone(d.party.phones), ledgerMessage(kind, d)), '_blank');

  return (
    <>
      <PageHead title={`${L.who} Ledger Report`} sub={`Every ${L.who.toLowerCase()}, or one ${L.who.toLowerCase()} in full — ${kind === 'customer' ? 'sales, collections, returns and adjustments' : 'purchases, payments, returns, rebates and adjustments'}.`}>
        <Btn disabled={!d} onClick={() => printLedger(paper())}>Print</Btn>
        <Btn disabled={!d} onClick={() => pdfLedger(paper(), `${file}.pdf`)}>PDF</Btn>
        <Btn disabled={!d} onClick={() => excelLedger(kind, d, listRows, `${file}.xlsx`)}>Excel</Btn>
        {d?.party && <Btn disabled={!firstPhone(d.party.phones)} title={firstPhone(d.party.phones) ? 'Send the balance on WhatsApp' : 'No phone number saved'} onClick={sendWa}>WhatsApp</Btn>}
      </PageHead>

      <section className="card lr-filter" aria-label="Filters">
        <div className={`lr-filters ${partyId ? '' : 'all'}`}>
          <label className="lr-f"><span>{L.who}</span><PartyPicker kind={kind} value={partyId} onChange={setParty} allowAll label={L.who} /></label>
          <label className="lr-f"><span>Period</span>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period">{PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
          {partyId && <>
            <label className="lr-f"><span>Entry type</span><select value={f.entry} onChange={(e) => setF({ ...f, entry: e.target.value })} aria-label="Entry type">{ENTRIES[kind].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="lr-f"><span>{kind === 'customer' ? 'Received in' : 'Paid from'}</span><select value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })} aria-label="Account"><option value="">Any account</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            <label className="lr-f"><span>Invoice / voucher no</span><input value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} placeholder={kind === 'customer' ? 'e.g. INV-000123' : 'e.g. PUR-000042'} aria-label="Invoice or voucher no" /></label>
          </>}
        </div>
        <div className="lr-fx">
          <div className="lr-chips" role="group" aria-label="Quick period">{PERIODS.map(([v, l]) => <button key={v} type="button" className={period === v ? 'on' : ''} aria-pressed={period === v} onClick={() => setPeriod(v)}>{l}</button>)}</div>
          {period === 'custom' && <div className="daterange"><DateInput value={custom.from} max={custom.to || today()} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label="From date" /><span>to</span><DateInput value={custom.to} min={custom.from} max={today()} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label="To date" /></div>}
          <span className="spacer" />
          {partyId
            ? <>
              <label className="check"><input type="checkbox" checked={f.items} onChange={(e) => setF({ ...f, items: e.target.checked })} /> Show items of each invoice</label>
              <label className="check"><input type="checkbox" checked={f.serials} disabled={!f.items} onChange={(e) => setF({ ...f, serials: e.target.checked })} /> Show serial numbers</label>
              <label className="check"><input type="checkbox" checked={f.dueOnly} onChange={(e) => setF({ ...f, dueOnly: e.target.checked })} /> Only invoices with due</label>
            </>
            : <>
              <label className="check"><input type="checkbox" checked={f.hideZero} onChange={(e) => setF({ ...f, hideZero: e.target.checked })} /> Hide zero balance</label>
              <label className="check"><input type="checkbox" checked={f.overdue} onChange={(e) => setF({ ...f, overdue: e.target.checked })} /> Only overdue (30+ days)</label>
            </>}
          <Btn size="sm" onClick={() => { setPeriod(partyId ? 'all' : 'month'); setF({ entry: 'all', account: '', ref: '', items: true, serials: true, dueOnly: false, hideZero: true, overdue: false }); }}>Reset</Btn>
        </div>
      </section>

      <ErrorBox error={rep.error} onRetry={rep.reload} />
      {!d && rep.loading && <Loading />}
      {d && (
        <div className="lr-stats" aria-label="Totals">
          <Stat label="Opening" value={money(t.opening, false)} sub={from ? `on ${fdate(from)}` : 'start'} />
          <Stat label={L.sales} value={money(t.sales, false)} sub={`${t.invoices} ${t.invoices === 1 ? 'invoice' : 'invoices'}`} />
          <Stat label="Returns" value={t.returns ? `− ${money(t.returns, false)}` : '0'} sub={t.return_count ? `${t.return_count} ${t.return_count === 1 ? 'return' : 'returns'}` : 'none'} tone={t.returns ? 'bad' : ''} />
          <Stat label={L.paid} value={t.paid ? `− ${money(t.paid, false)}` : '0'} sub={`${t.payments} ${t.payments === 1 ? 'payment' : 'payments'}`} tone="ok" />
          <Stat label="Adjusted" value={t.adjusted ? `${t.adjusted > 0 ? '−' : '+'} ${money(Math.abs(t.adjusted), false)}` : '0'} sub={t.adjust_count ? `${t.ded ? `deducted ${money(t.ded, false)}` : ''}${t.ded && t.add ? ' · ' : ''}${t.add ? `added ${money(t.add, false)}` : ''}` : 'none'} tone="la" />
          <Stat label="Closing" value={money(Math.abs(t.closing), false)} sub={t.closing > 0.004 ? L.owes : t.closing < -0.004 ? L.adv : 'settled'} tone="warn" />
        </div>
      )}

      {d && !d.party && (
        <section className="card">
          <div className="card-head"><b>All {L.who.toLowerCase()}s · {periodText(from, to)}</b><span className="muted" style={{ fontSize: 12.5 }}>Click a {L.who.toLowerCase()} to open the full ledger</span></div>
          <DataTable title={`${L.who} ledger summary`} rows={listRows} exportable={false} onRowClick={(r) => setParty(r.party_id)} empty={`No ${L.who.toLowerCase()}s to show`}
            columns={[
              { key: 'name', label: L.who, render: (r) => <b>{r.name}</b> }, { key: 'phone', label: 'Phone' },
              { key: 'opening', label: 'Opening', type: 'money', sum: true }, { key: 'sales', label: L.sales, type: 'money', sum: true },
              { key: 'paidret', label: `${L.paid} + returns`, type: 'money', sum: true, value: (r) => r.paid + r.returns },
              { key: 'adjusted', label: 'Adjusted', type: 'money', sum: true }, { key: 'closing', label: L.closing, type: 'money', sum: true },
              { key: 'oldest_days', label: 'Oldest due', type: 'num', value: (r) => r.oldest_days ?? -1, render: (r) => (r.oldest_days == null ? '—' : <span style={{ color: r.oldest_days > 30 ? 'var(--bad)' : undefined }}>{r.oldest_days} days</span>) }
            ]} />
        </section>
      )}

      {d?.party && (
        <>
          <section className="card">
            <div className="card-head">
              <div className="lr-who"><b>{d.party.name}</b><span className="muted">{[firstPhone(d.party.phones), String(d.party.address || '').split('|')[0]].filter(Boolean).join(' · ')}</span><span className="muted">{periodText(from, to)}</span><span className="muted">Balance now <b style={{ color: 'var(--text)' }}>{balText(kind, d.party.balance)}</b></span></div>
              <div className="row"><Btn size="sm" onClick={() => nav(`/${kind}-ledger-adjustment?party=${d.party.id}`)}>Adjust</Btn><Btn size="sm" onClick={() => setParty('')}>← All {L.who.toLowerCase()}s</Btn></div>
            </div>
            <div className="dt-scroll">
              <table className="lr-list">
                <thead><tr><th>Date</th><th>Voucher</th><th>Particulars</th><th className="r">Debit</th><th className="r">Credit</th><th className="r">Balance</th></tr></thead>
                <tbody>
                  {f.entry === 'all' && !f.account && !f.ref.trim() && !f.dueOnly && <tr className="op"><td>{from ? fdate(from) : ''}</td><td /><td>Opening balance</td><td /><td /><td className="r">{money(t.opening, false)}</td></tr>}
                  {d.rows.map((r) => {
                    const [tag, c] = tagOf(kind, r.type), sub = subText(r), docType = { sale: 'sale', purchase: 'purchase', sreturn: 'sreturn', preturn: 'preturn' }[r.type];
                    const items = f.items && r.items?.length ? [...r.items.map((i) => [`${i.name}${f.serials && i.serials?.length ? ` · SN ${i.serials.join(', ')}` : ''}`, `${i.qty} × ${money(i.price, false)}`, money(i.total, false)]), ...(r.discount > 0 ? [['Discount', '', `− ${money(r.discount, false)}`]] : [])] : [];
                    return (
                      <Fragment key={r.id}>
                        <tr>
                          <td>{fdate(r.date)}</td>
                          <td>{docType ? <button className="link" onClick={() => setDoc({ type: docType, id: r.ref_id })}>{r.ref_no}</button> : r.ref_no}</td>
                          <td><span className={`badge badge-${TONE[c]} lr-tag`}>{tag}</span>{rowText(kind, r)}{sub && <span className="lr-sub">{sub}</span>}</td>
                          <td className="r">{r.debit ? money(r.debit, false) : ''}</td><td className="r">{r.credit ? money(r.credit, false) : ''}</td><td className="r"><b>{money(r.balance, false)}</b></td>
                        </tr>
                        {items.map((x, i) => <tr key={i} className={`it ${i === items.length - 1 ? 'last' : ''}`}><td colSpan={3}>{x[0]}</td><td className="r" colSpan={2}>{x[1]}</td><td className="r">{x[2]}</td></tr>)}
                      </Fragment>
                    );
                  })}
                  {!d.rows.length && <tr><td colSpan={6} className="muted">No entries {d.all_rows ? 'match these filters' : 'in this period'}</td></tr>}
                  <tr className="tot"><td colSpan={3}>Totals {d.rows.length === d.all_rows ? 'for the period' : `· ${d.rows.length} of ${d.all_rows} entries`}</td><td className="r">{money(d.rows.reduce((a, r) => a + r.debit, 0), false)}</td><td className="r">{money(d.rows.reduce((a, r) => a + r.credit, 0), false)}</td><td className="r">{money(t.closing, false)}</td></tr>
                </tbody>
              </table>
            </div>
          </section>
          <div className="lr-stats lr-age" aria-label="Dues by age">
            <Stat label="Due 0–30 days" value={money(d.aging.buckets.d30, false)} />
            <Stat label="31–60 days" value={money(d.aging.buckets.d60, false)} />
            <Stat label="61–90 days" value={money(d.aging.buckets.d90, false)} />
            <Stat label="90+ days" value={money(d.aging.buckets.over90, false)} tone={d.aging.buckets.over90 > 0 ? 'bad' : ''} />
            <Stat label={`${L.invoices} with due`} value={d.aging.invoices.length ? d.aging.invoices.slice(0, 3).map((i) => i.invoice_no).join(', ') : 'none'} sub={[d.aging.invoices.length > 3 ? `+${d.aging.invoices.length - 3} more` : '', d.aging.other > 0.004 ? `not on an invoice ${money(d.aging.other, false)}` : ''].filter(Boolean).join(' · ')} small />
          </div>
        </>
      )}
      {doc && <DocViewer doc={doc} onClose={() => setDoc(null)} />}
    </>
  );
}

function Stat({ label, value, sub, tone, small }) {
  return <div className={`lr-stat ${tone ? 'tone-' + tone : ''}`}><span>{label}</span><b className={small ? 'small' : ''}>{value}</b>{sub !== undefined && <small>{sub || ' '}</small>}</div>;
}
