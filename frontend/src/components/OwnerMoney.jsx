import { useState } from 'react';
import { monthStart, today, money, fdate } from '../lib/format';
import { useApi, Btn, Badge, ErrorBox, Empty, Loading, Tabs } from './ui';

const PERIODS = { month: ['This month', () => ({ from: monthStart(), to: today() })], year: ['This year', () => ({ from: today().slice(0, 4) + '-01-01', to: today() })], all: ['All time', () => ({ from: '', to: '' })] };

/** Cash, bank & MFS → Owner's money: what the owner put into the shop and took out, apart from sales and expenses. */
export default function OwnerMoney({ onEntry, version }) {
  const [period, setPeriod] = useState('year');
  const q = useApi('owner.money', PERIODS[period][1](), [period, version]);
  const d = q.data;
  if (q.loading && !d) return <Loading label="Reading the owner's money" />;
  if (q.error && !d) return <ErrorBox error={q.error} onRetry={q.reload} />;
  const n = (c) => `${c} ${c === 1 ? 'entry' : 'entries'}`;
  return (
    <>
      <div className="om-bar">
        <Tabs tabs={Object.entries(PERIODS).map(([k, v]) => [k, v[0]])} value={period} onChange={setPeriod} />
        <span className="spacer" />
        <Btn onClick={() => onEntry('withdraw')}>Owner took money out</Btn>
        <Btn kind="primary" onClick={() => onEntry('deposit')}>Owner put money in</Btn>
      </div>
      <ErrorBox error={q.error} onRetry={q.reload} />
      <div className="om-kpis">
        <div className="card"><span>Put in (capital)</span><b className="ok">{money(d.put_in)}</b><small>{n(d.count_in)}</small></div>
        <div className="card"><span>Taken out (drawings)</span><b className="warn">{money(d.taken_out)}</b><small>{n(d.count_out)}</small></div>
        <div className="card"><span>Net invested so far</span><b>{money(d.invested)}</b><small>everything put in − everything taken out</small></div>
        {d.profit !== undefined && <div className="card"><span>Net profit in this period</span><b>{money(d.profit)}</b><small>after expenses</small></div>}
      </div>
      <section className="card">
        {d.rows.length ? (
          <div className="dt-scroll"><table className="dc-hist">
            <thead><tr><th>Date</th><th>Type</th><th>Account</th><th>Note</th><th className="r">Amount</th><th className="r">Net invested</th></tr></thead>
            <tbody>{d.rows.map((r) => (
              <tr key={r.id}><td>{fdate(r.date)}</td><td><Badge tone={r.kind === 'in' ? 'ok' : 'warn'}>{r.kind === 'in' ? 'Put in' : 'Taken out'}</Badge></td><td>{r.account}</td><td className="muted">{r.note || '—'}</td>
                <td className="r num">{r.kind === 'in' ? '+ ' : '− '}{money(r.amount)}</td><td className="r num">{money(r.invested)}</td></tr>
            ))}</tbody>
          </table></div>
        ) : <Empty compact icon="wallet" title="Nothing in this period">Record it when the owner puts money into the shop or takes money out.</Empty>}
        <p className="muted sess-note">These entries change the account balance but never count as sales, expenses or profit. To cancel one, open the account's ledger. Cash-count corrections from Day close are not listed here.</p>
      </section>
    </>
  );
}
