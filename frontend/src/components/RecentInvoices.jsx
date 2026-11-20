// POS: clicking the empty product search shows the last 50 invoices; picking one opens it in the POS for editing.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { money, fdate } from '../lib/format';

export default function RecentInvoices({ onPick, editingId }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let live = true;
    api('sales.list', { limit: 50, status: 'active' })
      .then((rows) => live && setState({ rows: Array.isArray(rows) ? rows : rows?.rows || [] }), (e) => live && setState({ error: e.message }));
    return () => { live = false; };
  }, []);
  return (
    <div className="ri" role="dialog" aria-label="Recent invoices">
      <div className="ri-head"><b>Last 50 invoices</b><small>Pick one to edit it here</small></div>
      {state.loading ? <div className="ri-msg">Loading invoices…</div> : state.error ? <div className="ri-msg bad">{state.error}</div> : !state.rows.length ? <div className="ri-msg">No invoices yet.</div> : (
        <ul className="ri-list" role="listbox" aria-label="Last 50 invoices">
          {state.rows.map((r) => (
            <li key={r.id} role="option" aria-selected={r.id === editingId} className={r.id === editingId ? 'on' : ''}
              onMouseDown={(e) => { e.preventDefault(); onPick(r); }}>
              <span className="ri-no">{r.invoice_no}</span>
              <span className="ri-who"><b>{r.customer_name || 'Cash sale'}</b><small>{fdate(r.date)}{r.created_at ? ` · ${String(r.created_at).slice(11, 16)}` : ''}{r.user_name ? ` · ${r.user_name}` : ''}</small></span>
              <span className="ri-amt"><b>{money(r.total, false)}</b>{r.due_now > 0.004 ? <small className="due">Due {money(r.due_now, false)}</small> : <small>Paid</small>}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
