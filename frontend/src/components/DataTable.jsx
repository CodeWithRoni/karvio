import { useMemo, useState } from 'react';
import { money, fdate, qty as fqty } from '../lib/format';
import { exportExcel, exportPdf, printTable } from '../lib/export';
import { Empty, Loading, Btn } from './ui';

/**
 * Dense data table with search, sort, pagination and Excel / PDF / Print export.
 * columns: [{ key, label, type: 'text'|'money'|'num'|'date', render?(row), value?(row), sum?, className? }]
 */
export default function DataTable({ columns, rows, loading, title = 'Export', exportable = true, searchable = true, pageSize = 50, onRowClick, empty, totals: totalsProp, toolbar, rowClass }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const download = async (fn) => {
    if (exporting) return;
    setExporting(true);
    try { await fn(); }
    catch (e) { const { useStore } = await import('../lib/store'); useStore.getState().toast(`Export failed: ${e.message}`, 'err'); }
    finally { setExporting(false); }
  };

  const filtered = useMemo(() => {
    let r = rows || [];
    if (q) {
      const ql = q.toLowerCase();
      r = r.filter((row) => columns.some((c) => String(c.value ? c.value(row) : row[c.key] ?? '').toLowerCase().includes(ql)));
    }
    if (sort) {
      const c = columns.find((x) => x.key === sort.key);
      const get = (row) => (c.value ? c.value(row) : row[c.key]);
      const numeric = c.type === 'money' || c.type === 'num';
      r = [...r].sort((a, b) => {
        const x = get(a), y = get(b);
        const d = numeric ? (Number(x) || 0) - (Number(y) || 0) : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true });
        return sort.dir * d;
      });
    }
    return r;
  }, [rows, q, sort, columns]);

  const totals = useMemo(() => {
    if (totalsProp !== undefined) return totalsProp;
    if (!columns.some((c) => c.sum)) return null;
    const t = {};
    columns.forEach((c) => { if (c.sum) t[c.key] = filtered.reduce((a, r) => a + (Number(c.value ? c.value(r) : r[c.key]) || 0), 0); });
    return t;
  }, [filtered, columns, totalsProp]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const slice = filtered.slice(cur * pageSize, cur * pageSize + pageSize);
  const expCols = columns.filter((c) => !c.noExport);

  const fmt = (c, row) => {
    if (c.render) return c.render(row);
    const v = c.value ? c.value(row) : row[c.key];
    if (v === undefined || v === null || v === '') return '';
    if (c.type === 'money') return money(v, false);
    if (c.type === 'num') return fqty(v);
    if (c.type === 'date') return fdate(v);
    return String(v);
  };

  return (
    <div className="dt">
      {(searchable || exportable || toolbar) && (
        <div className="dt-bar">
          {searchable && <input className="dt-search" type="search" placeholder="Search this table" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} aria-label="Search table" />}
          <div className="dt-tools">
            {toolbar}
            {exportable && (
              <div className="seg" role="group" aria-label="Export">
                <button disabled={exporting} onClick={() => download(() => exportExcel(title, expCols, filtered, totals))} title="Download Excel">Excel</button>
                <button disabled={exporting} onClick={() => download(() => exportPdf(title, expCols, filtered, totals))} title="Download PDF">{exporting ? 'Preparing…' : 'PDF'}</button>
                <button disabled={exporting} onClick={() => download(() => printTable(title, expCols, filtered, totals))} title="Print">Print</button>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="dt-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`${c.type === 'money' || c.type === 'num' ? 'r' : ''} ${c.className || ''}`}
                  aria-sort={sort?.key === c.key ? (sort.dir > 0 ? 'ascending' : 'descending') : undefined}>
                  {c.noSort ? c.label : (
                    <button onClick={() => setSort((s) => (s?.key === c.key ? (s.dir > 0 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 }))}>
                      {c.label}{sort?.key === c.key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((row, i) => (
              <tr key={row.id || i} onClick={onRowClick ? () => onRowClick(row) : undefined} className={`${onRowClick ? 'click' : ''} ${rowClass ? rowClass(row) : ''}`}
                tabIndex={onRowClick ? 0 : undefined} onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(row) : undefined}>
                {columns.map((c) => <td key={c.key} className={`${c.type === 'money' || c.type === 'num' ? 'r num' : ''} ${c.className || ''}`}>{fmt(c, row)}</td>)}
              </tr>
            ))}
          </tbody>
          {totals && filtered.length > 0 && (
            <tfoot>
              <tr>{columns.map((c, i) => <td key={c.key} className={c.type === 'money' || c.type === 'num' ? 'r num' : ''}>{i === 0 ? 'Total' : totals[c.key] !== undefined ? (c.type === 'money' ? money(totals[c.key], false) : fqty(totals[c.key])) : ''}</td>)}</tr>
            </tfoot>
          )}
        </table>
        {loading && <Loading />}
        {!loading && !filtered.length && (empty || <Empty title={q ? 'No rows match your search' : 'No records for this view'} />)}
      </div>
      {pages > 1 && (
        <div className="dt-pager">
          <span>{filtered.length} rows · page {cur + 1} of {pages}</span>
          <Btn size="sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Previous</Btn>
          <Btn size="sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</Btn>
        </div>
      )}
    </div>
  );
}
