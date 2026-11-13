import { quotationPrice } from '../lib/quotationTotals';
// What a customer sees when they open the quotation link from their SMS: one quotation, read-only, no sign-in.
// The link works for 3 days; then the shop's system deletes the quotation.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { money, fdate, fdatetime } from '../lib/format';
import { printQuotation } from '../lib/receipt';

export default function PublicQuote({ token }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    setD(null); setErr('');
    api('quote.public', { token })
      .then((r) => {
        if (!live) return;
        if (r.expired || !r.quote) { setErr(r.message || 'This quotation link has expired or is not valid. Please contact the shop for a new quotation.'); return; }
        // nobody signed in on this device: let the quotation formatting use this shop's settings (currency, name)
        if (!useStore.getState().user) useStore.setState((st) => ({ settings: { ...st.settings, ...r.shop } }));
        setD(r);
        document.title = `Quotation ${r.quote.no} — ${r.shop.shop_name || 'Karvio'}`;
      })
      .catch((e) => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [token]);

  if (err && !d) {
    return (
      <div className="pubinv-wrap"><div className="pubinv pubinv-msg">
        <div className="pubinv-ico" aria-hidden="true">⌛</div>
        <h1>Quotation not available</h1>
        <p>{err}</p>
      </div></div>
    );
  }
  if (!d) return <div className="pubinv-wrap"><div className="pubinv pubinv-msg"><div className="pubinv-spin" aria-label="Loading quotation" /></div></div>;

  const q = d.quote, shop = d.shop;
  const contacts = [shop.shop_phone, shop.shop_tel, shop.shop_email, shop.shop_web].filter(Boolean);
  const print = () => {
    try { printQuotation({ title: q.title, customer: q.customer, phone: q.phone, lines: q.lines, discount: q.discount, note: q.note, validDays: q.valid_days, no: q.no, date: q.date, storedTotals: { subtotal: q.subtotal, discount: q.discount, total: q.total } }); }
    catch (e) { setErr(e.message); }
  };
  return (
    <div className="pubinv-wrap">
      <article className="pubinv" aria-label={`Quotation ${q.no}`}>
        <header className="pubinv-shop">
          <h1>{shop.shop_name || 'Quotation'}</h1>
          {shop.shop_address && <div>{shop.shop_address}</div>}
          {contacts.length > 0 && <div className="pubinv-contacts">{contacts.map((x) => <span key={x}>{x}</span>)}</div>}
        </header>

        <section className="pubinv-head">
          <div><small>Quotation</small><b>{q.no}</b></div>
          <div><small>Date</small><b>{fdate(q.date)}</b></div>
          <div className="pubinv-status"><span className="pi-tag ok">Valid {q.valid_days} days</span></div>
        </section>

        <section className="pubinv-to">
          <small>Prepared for</small>
          <b>{q.customer || 'Customer'}</b>
          <div>{q.title}</div>
        </section>

        <section className="pubinv-items">
          {q.lines.map((l, n) => (
            <div className="pi-item" key={n}>
              <div className="pi-name">{l.group && <div className="pi-war">{l.group}</div>}<b>{l.name}</b>
                {l.warranty && <div className="pi-war">Warranty: {l.warranty}</div>}
              </div>
              <div className="pi-qty">{l.qty} × {quotationPrice(l.price)}</div>
              <div className="pi-amt">{money(l.total, false)}</div>
            </div>
          ))}
        </section>

        <section className="pubinv-tot">
          <div><span>Subtotal</span><span>{money(q.subtotal, false)}</span></div>
          {Number(q.discount) > 0 && <div><span>Discount</span><span>-{money(q.discount, false)}</span></div>}
          <div className="g"><span>Grand total</span><span>{money(q.total)}</span></div>
        </section>
        {q.note && <p className="pubinv-note"><b>Notes:</b> {q.note}</p>}
        <p className="pubinv-note">Prices may change with market rates after the validity period. Stock is not reserved until an order is confirmed.</p>

        <div className="pubinv-actions">
          <button type="button" className="pi-btn primary" onClick={print}>Print / Save PDF</button>
        </div>
        {err && <p className="pubinv-err">{err}</p>}
        <footer className="pubinv-foot">
          This private link works until <b>{fdatetime(d.expires_at)}</b>, then the quotation is deleted. Save a PDF if you need to keep it.
        </footer>
      </article>
    </div>
  );
}
