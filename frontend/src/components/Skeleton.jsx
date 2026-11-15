// Grey placeholders shown while a page loads, shaped like what is coming (instead of a blank page).
export const Bone = ({ w = '100%', h = 12, r = 6, style }) => <span className="bone" style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />;

/** Table placeholder: header row of labels (optional) and `rows` grey lines. */
export function TableSkeleton({ rows = 8, cols = 6, label = 'Loading' }) {
  const widths = ['70%', '55%', '85%', '45%', '60%', '75%'];
  return (
    <div className="skeleton" role="status" aria-live="polite" aria-label={label}>
      <span className="sr-only">{label}…</span>
      <table className="sk-table">
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>{Array.from({ length: cols }, (_, c) => <td key={c}><Bone w={widths[(r + c) % widths.length]} /></td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Dashboard placeholder: KPI cards, a chart and a panel. */
export function DashboardSkeleton() {
  return (
    <div className="skeleton" role="status" aria-live="polite" aria-label="Loading dashboard">
      <span className="sr-only">Loading dashboard…</span>
      <div className="page-head"><div><Bone w={180} h={26} /><Bone w={140} h={12} style={{ marginTop: 10 }} /></div></div>
      <div className="kpis">{Array.from({ length: 5 }, (_, i) => <div className="kpi" key={i}><Bone w="50%" /><Bone w="70%" h={24} style={{ margin: '10px 0' }} /><Bone w="40%" /></div>)}</div>
      <div className="dash-duo">
        <div className="card"><Bone w={180} h={16} /><Bone h={190} r={10} style={{ marginTop: 16 }} /></div>
        <div className="card"><Bone w={140} h={16} />{Array.from({ length: 5 }, (_, i) => <Bone key={i} h={36} r={10} style={{ marginTop: 10 }} />)}</div>
      </div>
    </div>
  );
}
