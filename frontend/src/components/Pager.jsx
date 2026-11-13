import { useState } from 'react';

/** Rows per page offered under every table. "Custom Range" lets the user type any number from 1 to 1000. */
export const PAGE_SIZES = [10, 20, 50, 100];
export const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 1000;

/** Page numbers to show: first, last and two either side of the current page (0-based). */
export function pageNumbers(cur, pages) {
  return [...new Set([0, pages - 1, cur - 2, cur - 1, cur, cur + 1, cur + 2])].filter((n) => n >= 0 && n < pages).sort((a, b) => a - b);
}

/**
 * Footer for a paged table: "Showing a–b of n", Prev / 1 2 3 / Next, and how many rows per page.
 * page is 0-based. Rendered whenever there is at least one row, so the size can always be changed.
 */
export function Pager({ page, pageSize, total, onPage, onPageSize, label = 'rows' }) {
  const [custom, setCustom] = useState(() => !PAGE_SIZES.includes(pageSize));
  const [draft, setDraft] = useState(String(pageSize));
  if (!total) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const cur = Math.min(page, pages - 1);
  const nums = pageNumbers(cur, pages);
  const applyCustom = (v) => {
    const n = Math.round(Number(v));
    if (n >= 1 && n <= MAX_PAGE_SIZE) onPageSize(n);
    else setDraft(String(pageSize));
  };
  return (
    <div className="pager">
      <span className="muted">Showing {cur * pageSize + 1}–{Math.min((cur + 1) * pageSize, total)} of {total}</span>
      <span className="spacer" />
      <button type="button" disabled={cur === 0} onClick={() => onPage(cur - 1)}>‹ Prev</button>
      {nums.map((n, i) => <span key={n} style={{ display: 'contents' }}>{i > 0 && n - nums[i - 1] > 1 && <span className="gap">…</span>}<button type="button" className={n === cur ? 'on' : ''} onClick={() => onPage(n)} aria-current={n === cur ? 'page' : undefined}>{n + 1}</button></span>)}
      <button type="button" disabled={cur >= pages - 1} onClick={() => onPage(cur + 1)}>Next ›</button>
      <select className="pager-size" aria-label={`How many ${label} per page`} value={custom ? 'custom' : String(pageSize)}
        onChange={(e) => {
          if (e.target.value === 'custom') { setCustom(true); setDraft(String(pageSize)); return; }
          setCustom(false); onPageSize(Number(e.target.value));
        }}>
        {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} Reports</option>)}
        <option value="custom">Custom Range</option>
      </select>
      {custom && <input className="pager-custom" type="number" min="1" max={MAX_PAGE_SIZE} step="1" value={draft} aria-label="Rows per page (custom)" title={`1 to ${MAX_PAGE_SIZE} rows per page — press Enter`}
        onChange={(e) => setDraft(e.target.value)} onBlur={(e) => applyCustom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyCustom(e.currentTarget.value); } }} />}
    </div>
  );
}
