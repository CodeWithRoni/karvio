import { useEffect, useMemo, useState } from 'react';
import { money, fdate, qty as fqty } from '../lib/format';
import { exportExcel, exportPdf, printTable } from '../lib/export';
import { Empty, Loading } from './ui';

/**
 * Dense data table with search, sort, pagination and Excel / PDF / Print export.
 * columns: [{ key, label, type: 'text'|'money'|'num'|'date', render?(row), value?(row), sum?, className? }]
 * selectable: tick rows; Excel / PDF / Print then export only the ticked rows.
 * docExport: { excel(rows), pdf(rows), print(rows) } — full documents (e.g. invoices) for the ticked rows.
 */
export default function DataTable({ columns, rows, loading, title = 'Export', exportable = true, searchable = true, pageSize = 50, onRowClick, empty, totals: totalsProp, toolbar, rowClass, selectable = exportable, docExport, sumFilter }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(() => new Set());
  useEffect(() => { setSel(new Set()); }, [rows]);
  const [sort, setSort] = useState(null);
  const sortColumn = sort && columns.find((c) => c.key === sort.key && !c.noSort);
  useEffect(() => { if (sort && !sortColumn) setSort(null); }, [sort, sortColumn]);
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
    if (sortColumn) {
      const c = sortColumn;
      const get = (row) => (c.value ? c.value(row) : row[c.key]);
      const numeric = c.type === 'money' || c.type === 'num';
      r = [...r].sort((a, b) => {
        const x = get(a), y = get(b);
        const d = numeric ? (Number(x) || 0) - (Number(y) || 0) : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true });
        return sort.dir * d;
      });
    }
    return r;
  }, [rows, q, sort, sortColumn, columns]);

  const totals = useMemo(() => {
    if (totalsProp !== undefined) return totalsProp;
    if (!columns.some((c) => c.sum)) return null;
    const t = {};
    columns.forEach((c) => { if (c.sum) t[c.key] = filtered.filter((r) => !sumFilter || sumFilter(r)).reduce((a, r) => a + (Number(c.value ? c.value(r) : r[c.key]) || 0), 0); });
    return t;
  }, [filtered, columns, totalsProp, sumFilter]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const slice = filtered.slice(cur * pageSize, cur * pageSize + pageSize);
  const expCols = columns.filter((c) => !c.noExport);
  const picked = filtered.filter((r) => sel.has(r));
  const allOnPage = slice.length > 0 && slice.every((r) => sel.has(r));
  const toggle = (r) => setSel((s0) => { const s1 = new Set(s0); if (s1.has(r)) s1.delete(r); else s1.add(r); return s1; });
  const togglePage = () => setSel((s0) => { const s1 = new Set(s0); slice.forEach((r) => (allOnPage ? s1.delete(r) : s1.add(r))); return s1; });
  // Ticked rows win; with nothing ticked the whole (filtered) table is exported.
  const outRows = picked.length ? picked : filtered;
  const outTotals = picked.length && totals ? Object.fromEntries(Object.keys(totals).map((k) => { const c = columns.find((x) => x.key === k); return [k, picked.filter((r) => !sumFilter || sumFilter(r)).reduce((a, r) => a + (Number(c && c.value ? c.value(r) : r[k]) || 0), 0)]; })) : totals;
  const run = (kind) => {
    if (picked.length && docExport && docExport[kind]) return download(() => docExport[kind](picked));
    if (kind === 'excel') return download(() => exportExcel(title, expCols, outRows, outTotals));
    if (kind === 'pdf') return download(() => exportPdf(title, expCols, outRows, outTotals));
    return download(() => printTable(title, expCols, outRows, outTotals));
  };
  const nums = [...new Set([0, pages - 1, cur - 2, cur - 1, cur, cur + 1, cur + 2])].filter((n) => n >= 0 && n < pages).sort((a, b) => a - b);

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
            {exportable && selectable && <span className="muted dt-selinfo">{picked.length ? <>{picked.length} selected <button className="link" onClick={() => setSel(new Set())}>Clear</button></> : 'Tick rows to export only those'}</span>}
            {exportable && (
              <div className="seg" role="group" aria-label="Export">
                <button disabled={exporting} onClick={() => run('excel')} title={picked.length ? 'Excel of the selected rows' : 'Download Excel'}>Excel</button>
                <button disabled={exporting} onClick={() => run('pdf')} title={picked.length ? 'PDF of the selected rows' : 'Download PDF'}>{exporting ? 'Preparing…' : 'PDF'}</button>
                <button disabled={exporting} onClick={() => run('print')} title={picked.length ? 'Print the selected rows' : 'Print'}>Print</button>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="dt-scroll">
        <table>
          <thead>
            <tr>
              {selectable && <th style={{ width: 36 }}><input type="checkbox" className="dt-check" checked={allOnPage} onChange={togglePage} aria-label="Select all rows on this page" /></th>}
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
              <tr key={row.id || i} onClick={onRowClick ? () => onRowClick(row) : undefined} className={`${onRowClick ? 'click' : ''} ${rowClass ? rowClass(row) : ''} ${sel.has(row) ? 'picked' : ''}`}
                tabIndex={onRowClick ? 0 : undefined} onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(row) : undefined}>
                {selectable && <td onClick={(e) => e.stopPropagation()}><input type="checkbox" className="dt-check" checked={sel.has(row)} onChange={() => toggle(row)} aria-label="Select row" /></td>}
                {columns.map((c) => <td key={c.key} className={`${c.type === 'money' || c.type === 'num' ? 'r num' : ''} ${c.className || ''}`}>{fmt(c, row)}</td>)}
              </tr>
            ))}
          </tbody>
          {totals && filtered.length > 0 && (
            <tfoot>
              <tr>{selectable && <td />}{columns.map((c, i) => <td key={c.key} className={c.type === 'money' || c.type === 'num' ? 'r num' : ''}>{i === 0 ? 'Total' : totals[c.key] !== undefined ? (c.type === 'money' ? money(totals[c.key], false) : fqty(totals[c.key])) : ''}</td>)}</tr>
            </tfoot>
          )}
        </table>
        {loading && <Loading />}
        {!loading && !filtered.length && (empty || <Empty title={q ? 'No rows match your search' : 'No records for this view'} />)}
      </div>
      {pages > 1 && (
        <div className="pager">
          <span className="muted">Showing {cur * pageSize + 1}–{Math.min((cur + 1) * pageSize, filtered.length)} of {filtered.length}</span>
          <span className="spacer" />
          <button disabled={cur === 0} onClick={() => setPage(cur - 1)}>‹ Prev</button>
          {nums.map((n, i) => <span key={n} style={{ display: 'contents' }}>{i > 0 && n - nums[i - 1] > 1 && <span className="gap">…</span>}<button className={n === cur ? 'on' : ''} onClick={() => setPage(n)} aria-current={n === cur ? 'page' : undefined}>{n + 1}</button></span>)}
          <button disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next ›</button>
        </div>
      )}
    </div>
  );
}
