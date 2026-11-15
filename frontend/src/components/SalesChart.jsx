import { useState } from 'react';
import { money } from '../lib/format';

/** Last-14-days chart: a bar per day for sales, a line for profit (when the user may see profit). Hover or focus a day for the figures. */
export default function SalesChart({ series = [] }) {
  const [hover, setHover] = useState(-1);
  const W = 640, H = 210, left = 44, bottom = 22, top = 10;
  const showProfit = series.some((x) => x.profit !== undefined);
  const raw = Math.max(1, ...series.map((x) => x.sales), ...(showProfit ? series.map((x) => x.profit || 0) : []));
  // A round top for the scale (1, 2 or 5 × a power of ten), split into four steps.
  const mag = 10 ** Math.floor(Math.log10(raw));
  const max = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((m) => m >= raw) || raw;
  const n = Math.max(1, series.length), slot = (W - left) / n, bw = Math.min(30, slot * 0.62);
  const y = (v) => top + (H - top - bottom) * (1 - Math.max(0, v) / max);
  const short = (v) => (v >= 1e7 ? `${+(v / 1e7).toFixed(1)}cr` : v >= 1e5 ? `${+(v / 1e5).toFixed(1)}L` : v >= 1e3 ? `${+(v / 1e3).toFixed(1)}k` : String(Math.round(v)));
  const cx = (i) => left + slot * i + slot / 2;
  const pts = series.map((x, i) => `${cx(i)},${y(x.profit || 0)}`).join(' ');
  const h = series[hover];
  return (
    <div className="sales-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sales for the last 14 days" onMouseLeave={() => setHover(-1)}>
        {[0, 1, 2, 3, 4].map((k) => {
          const v = (max * k) / 4, yy = y(v);
          return <g key={k}><line x1={left} x2={W} y1={yy} y2={yy} className="grid" /><text x={left - 6} y={yy + 3.5} textAnchor="end" className="axis">{short(v)}</text></g>;
        })}
        {series.map((x, i) => {
          const yy = y(x.sales), today = i === series.length - 1;
          return (
            <g key={x.date} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(-1)} tabIndex={0} aria-label={`${x.date}: ${money(x.sales)}, ${x.invoices} invoices`}>
              <rect x={left + slot * i} y={top} width={slot} height={H - top - bottom} className="hit" />
              <rect x={cx(i) - bw / 2} y={yy} width={bw} height={Math.max(x.sales ? 2 : 0, H - bottom - yy)} rx="4" className={`bar ${today ? 'today' : ''} ${hover === i ? 'on' : ''}`} />
              <text x={cx(i)} y={H - 6} textAnchor="middle" className="axis">{Number(x.date.slice(8))}</text>
            </g>
          );
        })}
        {showProfit && <polyline points={pts} className="profit-line" />}
        {showProfit && series.map((x, i) => <circle key={x.date} cx={cx(i)} cy={y(x.profit || 0)} r={hover === i ? 4 : 2.6} className="profit-dot" />)}
      </svg>
      {h && (
        <div className="chart-tip" style={{ left: `${(cx(hover) / W) * 100}%` }}>
          <b>{h.date.slice(8)}/{h.date.slice(5, 7)}</b>
          <span>Sales {money(h.sales)} · {h.invoices} inv</span>
          {h.profit !== undefined && <span>Profit {money(h.profit)}</span>}
        </div>
      )}
    </div>
  );
}
