import { money, fdate } from '../lib/format';
import { exportExcel, exportPdf, printTable } from '../lib/export';

const isoDates = /(\d{4}-\d{2}-\d{2})/g;
const human = (s) => String(s || '').replace(isoDates, (d) => fdate(d));
/** Accounting style: negatives in brackets, e.g. (1,250). */
const amt = (v) => (v === undefined || v === null ? '' : v < 0 ? `(${money(-v, false)})` : money(v, false));

/** Profit & loss / Balance sheet from the server: sections, lines, subtotals and a double-ruled grand total. */
export default function Statement({ s, shopName }) {
  const cols = s.columns.map((c) => ({ ...c, label: human(c.label) }));
  const flat = s.lines.filter((l) => l.kind !== 'section').map((l) => ({ line: `${'  '.repeat(l.indent || 0)}${l.label}`, ...Object.fromEntries(cols.map((c) => [c.key, l.values?.[c.key] ?? 0])) }));
  const xcols = [{ key: 'line', label: s.title }, ...cols.map((c) => ({ key: c.key, label: c.label, type: 'money' }))];
  const title = `${s.title} — ${cols[0].label}`;
  const m = s.margins;
  return (
    <section className="card statement">
      <div className="card-head">
        <h2>{shopName} — {s.title}</h2>
        <div className="seg" role="group" aria-label="Export">
          <button onClick={() => exportExcel(title, xcols, flat)}>Excel</button>
          <button onClick={() => exportPdf(title, xcols, flat)}>PDF</button>
          <button onClick={() => printTable(title, xcols, flat)}>Print</button>
        </div>
      </div>
      <table className="st-table">
        <thead><tr><th />{cols.map((c) => <th key={c.key} className="r">{c.label}</th>)}</tr></thead>
        <tbody>
          {s.lines.map((l, i) => l.kind === 'section'
            ? <tr key={i} className={`st-section ind-${l.indent || 0}`}><td colSpan={cols.length + 1}>{l.label}</td></tr>
            : (
              <tr key={i} className={`st-${l.kind} ind-${l.indent || 0}`}>
                <td>{l.label}</td>
                {cols.map((c) => { const v = l.values?.[c.key]; return <td key={c.key} className={`r num ${l.kind === 'grand' && v < 0 ? 'down' : ''}`}>{l.kind === 'grand' ? (v < 0 ? `(${money(-v)})` : money(v)) : amt(v)}</td>; })}
              </tr>
            ))}
        </tbody>
      </table>
      {m && <p className="muted st-note">Gross margin {m.current?.gross ?? 0}% · net margin {m.current?.net ?? 0}%{m.previous ? ` (previous: ${m.previous.gross}% · ${m.previous.net}%)` : ''}. Figures come from the same sales, returns, stock and expenses as the other reports.</p>}
      {s.note && <p className="muted st-note">{s.note}</p>}
    </section>
  );
}
