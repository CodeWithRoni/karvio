// Settings → Online shop: Google Drive set-up (Karvio Shop › Images + Karvio Shop Database), payments and delivery.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { Btn, Field, useAction, useApi, Loading, ErrorBox } from './ui';

export const SHOP_SITE = 'https://codewithroni.github.io/karvio-shop/';
const KEYS = ['shop_enabled', 'shop_cod', 'shop_bkash', 'shop_bkash_number', 'shop_bkash_type', 'shop_delivery_inside', 'shop_delivery_outside', 'shop_inside_label', 'shop_notice', 'shop_site_url'];
const defaults = { shop_enabled: 'false', shop_cod: 'true', shop_bkash: 'true', shop_bkash_number: '', shop_bkash_type: 'personal', shop_delivery_inside: '60', shop_delivery_outside: '120', shop_inside_label: 'Inside the city', shop_notice: '', shop_site_url: SHOP_SITE };

export default function OnlineShopSettings() {
  const { settings, refresh, user } = useStore();
  const info = useApi('shop.admin', {});
  const [f, setF] = useState(() => Object.fromEntries(KEYS.map((k) => [k, settings[k] ?? defaults[k]])));
  useEffect(() => { setF(Object.fromEntries(KEYS.map((k) => [k, settings[k] ?? defaults[k]]))); }, [settings]);
  const [busy, run] = useAction();
  const on = (k) => f[k] === 'true';
  const flip = (k) => (e) => setF({ ...f, [k]: e.target.checked ? 'true' : 'false' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const d = info.data;
  const site = f.shop_site_url || SHOP_SITE;
  const phoneOk = !f.shop_bkash_number || /^01[3-9]\d{8}$/.test(f.shop_bkash_number.replace(/\D/g, ''));

  const setup = async () => { try { await run(() => api('shop.setup', {}), 'Online shop folder is ready in your Google Drive'); await Promise.all([info.reload(), refresh('settings', 'products')]); } catch { /* shown */ } };
  const save = async () => {
    if (!phoneOk) return useStore.getState().toast('Write the bKash number as 01XXXXXXXXX', 'err');
    try { await run(() => api('settings.save', { values: f }), 'Online shop settings saved'); await refresh('settings'); info.reload(); } catch { /* shown */ }
  };

  if (info.loading && !d) return <div className="card"><Loading label="Checking the online shop" /></div>;
  if (!d) return <ErrorBox error={info.error} onRetry={info.reload} />;
  return (
    <div className="shopset">
      <div className="card">
        <div className="card-head"><h2>Online shop</h2><a className="link" href={site} target="_blank" rel="noreferrer">Open the shop website ↗</a></div>
        {!d.google ? <p className="muted">The online shop works with the online (Google) version of Karvio.</p> : !d.ready ? <>
          <p>Karvio makes a folder <b>Karvio Shop</b> in your Google Drive with an <b>Images</b> folder for product pictures and a <b>Karvio Shop Database</b> sheet for online orders, plus a <b>Delivery charge</b> item for the POS.</p>
          {user?.role === 'admin' ? <Btn kind="primary" busy={busy} onClick={setup}>Set up Google Drive folder</Btn> : <p className="muted">Ask an admin to set it up.</p>}
        </> : <>
          <div className="shopset-stats">
            <div><span>On the website</span><b>{d.web_products}</b><small>products · tick “Show on the online shop” in a product</small></div>
            <div><span>Orders</span><b>{d.orders}</b><small>{d.new_orders} new · <Link className="link" to="/orders">Online Orders</Link></small></div>
            <div><span>Google Drive</span><b className="shopset-links"><a className="link" href={d.folder_url} target="_blank" rel="noreferrer">Karvio Shop folder</a><a className="link" href={d.images_url} target="_blank" rel="noreferrer">Images</a><a className="link" href={d.db_url} target="_blank" rel="noreferrer">Shop database</a></b></div>
          </div>
          {user?.role === 'admin' && <p className="muted" style={{ fontSize: 12.5, margin: '10px 0 0' }}>Something deleted in Drive by mistake? <button type="button" className="link" disabled={busy} onClick={setup}>Run the set-up again</button> — it only adds what is missing.</p>}
        </>}
      </div>

      {d.ready && <div className="card form">
        <label className="check wide shopset-open"><input type="checkbox" checked={on('shop_enabled')} onChange={flip('shop_enabled')} /> <b>Shop is open</b> — customers can see products and place orders</label>
        <h3 className="wide">Payment</h3>
        <label className="check wide"><input type="checkbox" checked={on('shop_cod')} onChange={flip('shop_cod')} /> Cash on delivery</label>
        <label className="check wide"><input type="checkbox" checked={on('shop_bkash')} onChange={flip('shop_bkash')} /> bKash — customer sends money first and types the Transaction ID (TrxID)</label>
        {on('shop_bkash') && <>
          <Field label="Your bKash number" error={phoneOk ? undefined : 'Write it as 01XXXXXXXXX'}><input value={f.shop_bkash_number} onChange={set('shop_bkash_number')} placeholder="01XXXXXXXXX" inputMode="numeric" /></Field>
          <Field label="bKash account type" hint="Personal: customers use Send Money. Merchant: customers use Payment.">
            <select value={f.shop_bkash_type} onChange={set('shop_bkash_type')}><option value="personal">Personal (Send Money)</option><option value="merchant">Merchant (Payment)</option></select>
          </Field>
        </>}
        <h3 className="wide">Delivery charge</h3>
        <Field label="Near area name" hint="Shown to customers, e.g. Inside Pabna"><input value={f.shop_inside_label} onChange={set('shop_inside_label')} /></Field>
        <Field label="Near area charge (Tk)"><input type="number" min="0" value={f.shop_delivery_inside} onChange={set('shop_delivery_inside')} /></Field>
        <Field label="Everywhere else (Tk)"><input type="number" min="0" value={f.shop_delivery_outside} onChange={set('shop_delivery_outside')} /></Field>
        <h3 className="wide">Website</h3>
        <Field label="Notice on the website (optional)" wide hint="A short line at the top, e.g. Eid offer: free delivery in Bera"><input value={f.shop_notice} onChange={set('shop_notice')} maxLength={160} /></Field>
        <Field label="Shop website address" wide><input value={f.shop_site_url} onChange={set('shop_site_url')} placeholder={SHOP_SITE} /></Field>
        <p className="muted wide" style={{ margin: 0, fontSize: 12.5 }}>Shop name, phone and address come from Settings → Shop. Prices are the retail prices in Karvio.</p>
        <div className="wide row end"><Btn kind="primary" busy={busy} onClick={save}>Save</Btn></div>
      </div>}
    </div>
  );
}
