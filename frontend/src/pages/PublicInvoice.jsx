// What a customer sees when they open the invoice link from their SMS: one invoice, read-only, no sign-in.
// The link stops working after 15 days (the server deletes it).
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { money, qty as fqty, fdate, splitList } from '../lib/format';

const sers = (v) => splitList(String(v || '').replace(/\n/g, ','));

export default function PublicInvoice({ token }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let live = true;
    setD(null); setErr('');
    api('invoice.public', { token })
      .then((r) => {
        if (!live) return;
        // nobody signed in on this device: let the invoice formatting use this shop's settings (currency, template)
        if (!useStore.getState().user) useStore.setState((st) => ({ settings: { ...st.settings, ...r.shop } }));
        setD(r);
        document.title = `Invoice ${r.sale.invoice_no} — ${r.shop.shop_name || 'Karvio'}`;
      })
      .catch((e) => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [token]);

  const doc = d && { sale: d.sale, items: d.items, customer: d.customer, returns: d.returns };
  const download = async (kind) => {
    setBusy(kind);
    try {
      const m = await import('../lib/salesDocs');
      if (kind === 'pdf') await m.pdfSales([doc], `invoice-${d.sale.invoice_no}.pdf`);
      else await m.printSales([doc], 'a4');
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };

  if (err && !d) {
    return (
      <div className="pubinv-wrap"><div className="pubinv pubinv-msg">
        <div className="pubinv-ico" aria-hidden="true">⌛</div>
        <h1>Link not available</h1>
        <p>{err}</p>
      </div></div>
    );
  }
  if (!d) return <div className="pubinv-wrap"><div className="pubinv pubinv-msg"><div className="pubinv-spin" aria-label="Loading invoice" /></div></div>;

  const s = d.sale, shop = d.shop, c = d.customer;
  const walkIn = !s.customer_id || /^walk-?in/i.test(String(s.customer_name || '').trim());
  const cancelled = s.status === 'cancelled';
  const due = Number(s.due) || 0;
  const contacts = [shop.shop_phone, shop.shop_tel, shop.shop_email, shop.shop_web].filter(Boolean);
  return (
    <div className="pubinv-wrap">
      <article className="pubinv" aria-label={`Invoice ${s.invoice_no}`}>
        <header className="pubinv-shop">
          <h1>{shop.shop_name || 'Invoice'}</h1>
          {shop.shop_address && <div>{shop.shop_address}</div>}
          {contacts.length > 0 && <div className="pubinv-contacts">{contacts.map((x) => <span key={x}>{x}</span>)}</div>}
        </header>

        <section className="pubinv-head">
          <div><small>Invoice</small><b>{s.invoice_no}</b></div>
          <div><small>Date</small><b>{fdate(s.date)}</b></div>
          <div className="pubinv-status">
            {cancelled ? <span className="pi-tag bad">Cancelled</span> : due > 0.004 ? <span className="pi-tag warn">Due {money(due)}</span> : <span className="pi-tag ok">Paid</span>}
          </div>
        </section>
        {cancelled && <div className="pubinv-cx">This invoice was cancelled{s.cancel_reason ? ` — ${s.cancel_reason}` : ''}.</div>}

        <section className="pubinv-to">
          <small>Bill to</small>
          <b>{walkIn ? 'Cash customer' : s.customer_name}</b>
          {!walkIn && c?.phones && <div>{splitList(c.phones).join(', ')}</div>}
        </section>

        <section className="pubinv-items">
          {d.items.map((i, n) => {
            const sn = sers(i.serials);
            return (
              <div className="pi-item" key={i.id || n}>
                <div className="pi-name"><b>{i.name}</b>
                  {sn.length > 0 && <div className="pi-sn">S/N: {sn.join(', ')}</div>}
                  {i.warranty_expiry && <div className="pi-war">Warranty till {fdate(i.warranty_expiry)}{i.warranty_type === 'invoice' ? ' · keep this invoice' : ''}</div>}
                  {Number(i.returned_qty) > 0 && <div className="pi-war">Returned: {fqty(i.returned_qty)}</div>}
                </div>
                <div className="pi-qty">{fqty(i.qty, i.unit)} × {money(i.price, false)}</div>
                <div className="pi-amt">{money(i.total, false)}</div>
              </div>
            );
          })}
        </section>

        <section className="pubinv-tot">
          <div><span>Subtotal</span><span>{money(s.subtotal, false)}</span></div>
          {Number(s.discount) > 0 && <div><span>Discount</span><span>-{money(s.discount, false)}</span></div>}
          <div className="g"><span>Total</span><span>{money(s.total)}</span></div>
          {(s.payments || []).map((p, k) => <div key={k} className="sm"><span>Paid · {p.account_name || 'Payment'}</span><span>{money(p.amount, false)}</span></div>)}
          {Number(s.credit_used) > 0 && <div className="sm"><span>Advance used</span><span>{money(s.credit_used, false)}</span></div>}
          <div><span>Paid</span><span>{money(s.paid, false)}</span></div>
          {due > 0.004 && <div className="due"><span>Due</span><span>{money(due)}</span></div>}
          {due > 0.004 && s.next_payment_date && <div className="sm"><span>Next payment date</span><span>{fdate(s.next_payment_date)}</span></div>}
        </section>
        {d.returns?.length > 0 && <p className="pubinv-note">Returns: {d.returns.map((r) => `${r.return_no} (${money(r.total, false)}${r.status === 'cancelled' ? ', cancelled' : ''})`).join(', ')}</p>}
        {(shop.invoice_note || shop.shop_footer) && <p className="pubinv-note">{shop.invoice_note || shop.shop_footer}</p>}

        <div className="pubinv-actions">
          <button type="button" className="pi-btn primary" onClick={() => download('pdf')} disabled={!!busy}>{busy === 'pdf' ? 'Preparing…' : 'Download PDF'}</button>
          <button type="button" className="pi-btn" onClick={() => download('print')} disabled={!!busy}>{busy === 'print' ? 'Opening…' : 'Print'}</button>
        </div>
        {err && <p className="pubinv-err">{err}</p>}
        <footer className="pubinv-foot">
          This private link works until <b>{fdate(d.expires_at)}</b>, then it is deleted. Please download the PDF if you need to keep the invoice.
        </footer>
      </article>
    </div>
  );
}
