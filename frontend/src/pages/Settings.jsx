import { clearShopDrafts } from '../lib/shopStorage';
import { useEffect, useState } from 'react';
import { useStore, shopDay } from '../lib/store';
import { api, getApiConfig, setApiConfig, testConnection, isOffline, getToken } from '../lib/api';
import { DEFAULT_API_URL } from '../config';
import { fdatetime, fdate } from '../lib/format';
import DataTable from '../components/DataTable';
import { PageHead, Btn, Field, useAction, Tabs, useApi, Badge, Modal } from '../components/ui';
import { DASH_CARDS, hiddenCards } from '../lib/dashboardCards';
import { PAPERS, TEMPLATES, printInvoice } from '../lib/receipt';
import { PRESETS, matchPreset } from '../lib/smsPresets';
import SmsFieldBuilder from '../components/SmsFieldBuilder';
import { gatewayError } from '../lib/smsGateway';
import { DatabaseTab } from '../components/DatabaseTools';
import DateInput from '../components/DateInput';
import { DEFAULT_WHATSAPP } from '../lib/whatsapp';

export default function Settings() {
  const can = useStore((s) => s.can);
  const offline = isOffline();
  const admin = useStore((s) => s.user?.role === 'admin');
  const owner = useStore((s) => s.user?.owner === true); // the Administrator account only — not every admin
  const [tab, setTab] = useState(can('settings') ? 'shop' : offline ? 'me' : 'api');
  const tabs = [...(can('settings') ? [['shop', 'Shop'], ['invoice', 'Invoice'], ['dashboard', 'Dashboard'], ...(!offline ? [['sms', 'SMS gateway'], ['smsfeatures', 'SMS settings']] : [])] : []), ...(offline ? admin ? [['local', 'Offline data & backup']] : [] : [['api', 'API connection']]), ...(admin && can('settings') ? [['branches', 'Branches'], ['shifts', 'Shift'], ['courier', 'Courier'], ['books', 'Close books']] : []), ['me', 'My password'], ...(owner ? [['database', 'Database']] : [])];
  return (
    <>
      <PageHead title="Settings"><Tabs tabs={tabs} value={tab} onChange={setTab} /></PageHead>
      {tab === 'shop' && <ShopSettings />}
      {tab === 'invoice' && <InvoiceSettings />}
      {tab === 'dashboard' && <DashboardSettings />}
      {tab === 'sms' && <SmsSettings />}
      {tab === 'smsfeatures' && <SmsFeatures />}
      {tab === 'api' && <ApiSettings />}
      {tab === 'local' && <OfflineSettings />}
      {tab === 'branches' && admin && <BranchSettings />}
      {tab === 'shifts' && admin && <ShiftSettings />}
      {tab === 'courier' && admin && <CourierSettings />}
      {tab === 'books' && admin && <BooksSettings />}
      {tab === 'me' && <MyPassword />}
      {tab === 'database' && owner && <DatabaseTab Reset={DatabaseReset} />}
    </>
  );
}

function OfflineSettings() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [busy, run] = useAction();
  const unwrap = (response) => { if (!response.ok) throw new Error(response.error); return response.data; };
  useEffect(() => { window.karvio.storageInfo(getToken()).then((r) => setInfo(unwrap(r))).catch((e) => setError(e.message)); }, []);
  const backup = async () => {
    const result = await run(async () => unwrap(await window.karvio.exportBackup(getToken())));
    if (!result.canceled) useStore.getState().toast('Backup saved');
  };
  const restore = async () => {
    const result = await run(async () => unwrap(await window.karvio.restoreBackup(getToken())));
    if (!result.canceled) { await useStore.getState().logout(); useStore.getState().toast('Backup restored. Sign in again.'); }
  };
  return <div className="card form">
    <h2 className="wide">Saved on this computer</h2>
    <p className="muted wide">Sales, stock, customers and accounts are saved automatically. Your data stays here when the app closes. A previous copy and daily backups are kept as well.</p>
    {error && <div className="errbox wide">{error}</div>}
    {info && <><Field label="Data file" wide><input readOnly value={info.dataFile} /></Field><Field label="Automatic backups" wide><input readOnly value={info.backupDir} /></Field></>}
    <div className="wide row"><Btn kind="primary" busy={busy} onClick={backup}>Save backup</Btn><Btn busy={busy} onClick={restore}>Restore backup</Btn><Btn onClick={() => run(async () => unwrap(await window.karvio.openDataFolder(getToken())))}>Open data folder</Btn></div>
    <p className="muted wide">Keep an extra backup on another drive. SMS delivery needs an internet connection and is unavailable in this offline app.</p>
  </div>;
}

function useSettingsForm(keys) {
  const settings = useStore((s) => s.settings);
  const [f, setF] = useState(Object.fromEntries(keys.map((k) => [k, settings[k] ?? ''])));
  const [busy, run] = useAction();
  const save = async () => {
    const s = await run(() => api('settings.save', { values: f }), 'Settings saved');
    useStore.setState({ settings: s });
  };
  const bind = (k) => ({ value: f[k], onChange: (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? String(e.target.checked) : e.target.value }) });
  return { f, setF, bind, save, busy };
}

function ShopSettings() {
  const { f, setF, bind, save, busy } = useSettingsForm(['shop_name', 'shop_phone', 'shop_tel', 'shop_email', 'shop_web', 'shop_social', 'shop_address', 'currency', 'invoice_prefix', 'low_stock_default', 'shop_logo']);
  return (
    <div className="card form">
      <LogoPicker value={f.shop_logo} onChange={(v) => setF({ ...f, shop_logo: v })} />
      <Field label="Shop name" wide><input {...bind('shop_name')} /></Field>
      <Field label="Phone"><input {...bind('shop_phone')} /></Field>
      <Field label="Tel"><input {...bind('shop_tel')} placeholder="Landline / hotline" /></Field>
      <Field label="Email"><input type="email" {...bind('shop_email')} placeholder="shop@example.com" /></Field>
      <Field label="Website"><input {...bind('shop_web')} placeholder="www.example.com" /></Field>
      <Field label="Social"><input {...bind('shop_social')} placeholder="facebook.com/yourshop" /></Field>
      <Field label="Address" wide hint="Phone, Tel, Email, Website and Social print under the shop name on invoices, receipts, quotations and statements. Leave one empty to hide it."><input {...bind('shop_address')} /></Field>
      <Field label="Currency label"><input {...bind('currency')} placeholder="Tk" /></Field>
      <Field label="Invoice prefix" hint="Applies to new invoices."><input {...bind('invoice_prefix')} /></Field>
      <Field label="Default low-stock alert"><input type="number" {...bind('low_stock_default')} /></Field>

      <div className="wide row end"><Btn kind="primary" busy={busy} onClick={save}>Save settings</Btn></div>
    </div>
  );
}

/** Shop logo: shrunk in the browser (max 480 × 160) so it stays small on every invoice and on the sign-in screen. */
function LogoPicker({ value, onChange }) {
  const toast = useStore((s) => s.toast);
  const pick = (file) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)) return toast('Choose a PNG, JPEG, WebP, GIF or SVG picture', 'err');
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, 480 / img.naturalWidth, 160 / img.naturalHeight);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let data = c.toDataURL('image/png');
      if (data.length > 150000) data = c.toDataURL('image/webp', 0.9);
      if (data.length > 190000) return toast('That picture is too detailed; try a simpler logo', 'err');
      onChange(data);
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('Could not read that picture', 'err'); };
    img.src = url;
  };
  return (
    <div className="wide logo-pick">
      <span className="field-label">Shop logo</span>
      <div className="logo-row">
        <div className="logo-previews">
          {/* The logo always sits on white (menu chip, sign-in screen and paper), so the preview does too. */}
          <div className={`logo-box ${value ? 'paper' : ''}`} title="As it appears on invoices, the menu and the sign-in screen">{value ? <img src={value} alt="Shop logo" /> : <span className="muted">No logo<br /><small>600 × 200 px</small></span>}</div>
        </div>
        <div className="logo-actions">
          <label className="btn">Choose picture<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} /></label>
          {value && <Btn onClick={() => onChange('')}>Remove</Btn>}
          <small className="muted logo-help">
            <b>Best size:</b> a wide logo about <b>600 × 200 px</b> (3 : 1), or a square one at least <b>300 × 300 px</b>. PNG with a transparent background looks best;
            JPEG, WebP, GIF and SVG also work. Keep the edges tight (no extra empty space). Larger pictures are shrunk automatically to fit within 480 × 160 px.
            It prints on invoices and receipts and shows on the sign-in screen and menu. Save settings to keep it.
          </small>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Branches: add branches, who works where, which account belongs to which branch ---------------- */
function BranchSettings() {
  const q = useApi('branches.get', {}, []);
  const [edit, setEdit] = useState(null);
  const [ub, setUb] = useState(null);
  const [ab, setAb] = useState(null);
  const [busy, run] = useAction();
  const d = q.data;
  useEffect(() => { if (d) { setUb(d.user_branches); setAb(d.account_branches); } }, [d]);
  const saveBranch = async () => {
    const r = await run(() => api('branch.save', edit), edit.id ? 'Branch saved' : `Branch ${edit.name} added`);
    if (r) { setEdit(null); q.reload(); useStore.getState().boot(); }
  };
  const saveAssign = async () => { const r = await run(() => api('branch.assign', { users: ub, accounts: ab }), 'Saved'); if (r) { q.reload(); useStore.getState().boot(); } };
  if (!d) return <div className="card">{q.error ? q.error : 'Loading…'}</div>;
  const open = d.list.filter((b) => b.active);
  return (
    <>
      <section className="card">
        <div className="card-head"><h2>Branches</h2><Btn kind="primary" onClick={() => setEdit({ name: '', address: '', phone: '', active: true })}>+ Add branch</Btn></div>
        {!d.on && <p className="muted">Branches are off. When you add the first branch, your shop as it is today becomes the <b>Main Branch</b> (with all its stock) and the new branch is added beside it. Then move stock with Branch transfer.</p>}
        {d.list.length > 0 && <table className="dc-hist"><thead><tr><th>Branch</th><th>Address</th><th>Phone</th><th className="r">Stock</th><th /></tr></thead>
          <tbody>{d.list.map((b) => <tr key={b.id}><td><b>{b.name}</b> {b.main && <Badge tone="ok">Main</Badge>}{!b.active && <Badge tone="muted">closed</Badge>}</td><td>{b.address}</td><td>{b.phone}</td><td className="r num">{d.stock_text ? d.stock_text[b.id] || 0 : d.stock_units[b.id] || 0}</td>
            <td className="r"><Btn size="sm" onClick={() => setEdit({ ...b })}>Edit</Btn></td></tr>)}</tbody></table>}
      </section>
      {d.on && ub && ab && <div className="dc-grid" style={{ marginTop: 12 }}>
        <section className="card">
          <div className="card-head"><h2>Who works where</h2></div>
          <p className="muted" style={{ marginTop: 0 }}>A user fixed to a branch sells its stock, uses its accounts and sees only its invoices. "Any branch" users pick the branch at the top of the menu.</p>
          <table className="dc-hist"><tbody>{d.users.map((u) => <tr key={u.id}><td>{u.name} <small className="muted">{u.role}</small></td>
            <td><select value={ub[u.id] || ''} onChange={(e) => setUb({ ...ub, [u.id]: e.target.value })} aria-label={`Branch of ${u.name}`}><option value="">Any branch</option>{open.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></td></tr>)}</tbody></table>
        </section>
        <section className="card">
          <div className="card-head"><h2>Accounts of each branch</h2></div>
          <p className="muted" style={{ marginTop: 0 }}>Each branch's cash drawer and accounts. "Shared" accounts (e.g. the main bank) can be used by every branch.</p>
          <table className="dc-hist"><tbody>{d.accounts.map((a) => <tr key={a.id}><td>{a.name} <small className="muted">{a.type}</small></td>
            <td><select value={ab[a.id] || ''} onChange={(e) => setAb({ ...ab, [a.id]: e.target.value })} aria-label={`Branch of ${a.name}`}><option value="">Shared</option>{open.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></td></tr>)}</tbody></table>
        </section>
        <div className="row end" style={{ gridColumn: '1 / -1' }}><Btn kind="primary" busy={busy} onClick={saveAssign}>Save users & accounts</Btn></div>
      </div>}
      {edit && <Modal open size="sm" title={edit.id ? `Edit ${edit.name}` : 'Add a branch'} onClose={() => setEdit(null)}
        footer={<><Btn onClick={() => setEdit(null)}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={saveBranch} disabled={!edit.name.trim()}>Save branch</Btn></>}>
        <div className="form">
          <Field label="Branch name" wide><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={80} aria-label="Branch name" /></Field>
          <Field label="Address" wide><input value={edit.address || ''} onChange={(e) => setEdit({ ...edit, address: e.target.value })} aria-label="Branch address" /></Field>
          <Field label="Phone" wide><input value={edit.phone || ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} aria-label="Branch phone" /></Field>
          {edit.id && !edit.main && <label className="check wide"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Open (a branch with stock cannot be closed)</label>}
          {edit.main && <p className="muted wide" style={{ margin: 0 }}>This is the <b>Main Branch</b> — your shop's own stock and history. It can be renamed but not closed.</p>}
        </div>
      </Modal>}
    </>
  );
}

/* ---------------- Courier: API keys for Steadfast, Pathao and RedX (online orders) ---------------- */
const COURIER_FIELDS = {
  steadfast: [['courier_steadfast_key', 'API key'], ['courier_steadfast_secret', 'Secret key', true]],
  pathao: [['courier_pathao_client_id', 'Client ID'], ['courier_pathao_client_secret', 'Client secret', true], ['courier_pathao_username', 'Merchant email'], ['courier_pathao_password', 'Merchant password', true], ['courier_pathao_store_id', 'Store ID']],
  redx: [['courier_redx_token', 'API access token', true]]
};
function CourierSettings() {
  const keys = [...Object.values(COURIER_FIELDS).flat().map((x) => x[0]), 'courier_pathao_sandbox', 'courier_redx_sandbox'];
  const { f, setF, save, busy } = useSettingsForm(keys);
  const [testing, setTesting] = useState('');
  const test = async (courier) => {
    setTesting(courier);
    try { const r = await api('courier.call', { op: 'test', courier }); useStore.getState().toast(`${courier === 'steadfast' ? 'Steadfast' : courier === 'pathao' ? 'Pathao' : 'RedX'} keys work${r.balance !== null && r.balance !== undefined ? ` · balance Tk ${r.balance}` : ''}`); }
    catch (e) { useStore.getState().toast(e.message, 'err'); }
    finally { setTesting(''); }
  };
  const block = (id, title, hint, sandbox) => (
    <section className="card form courier-card" key={id}>
      <div className="card-head wide"><h2>{title}</h2><Btn size="sm" busy={testing === id} onClick={() => test(id)}>Test the keys</Btn></div>
      <p className="muted wide" style={{ margin: 0 }}>{hint}</p>
      {COURIER_FIELDS[id].map(([k, label, secret]) => <Field key={k} label={label}><input type={secret ? 'password' : 'text'} autoComplete="off" value={f[k] || ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} aria-label={`${title} ${label}`} /></Field>)}
      {sandbox && <label className="check wide"><input type="checkbox" checked={f[sandbox] === 'true'} onChange={(e) => setF({ ...f, [sandbox]: String(e.target.checked) })} /> Sandbox (test account — no real parcels)</label>}
    </section>
  );
  return (
    <>
      <p className="muted">With the keys here, online orders are booked with the courier from Karvio and their status is checked from here. Save first, then test. Staff never see these keys.</p>
      <div className="courier-grid">
        {block('steadfast', 'Steadfast', 'Steadfast merchant panel → API: the API key and secret key.')}
        {block('pathao', 'Pathao', 'Pathao merchant panel → Developers API: client ID and secret, your merchant login and the store ID.', 'courier_pathao_sandbox')}
        {block('redx', 'RedX', 'RedX merchant panel → Developer API: the access token.', 'courier_redx_sandbox')}
      </div>
      <div className="row end" style={{ marginTop: 12 }}><Btn kind="primary" busy={busy} onClick={save}>Save courier keys</Btn></div>
    </>
  );
}

/* ---------------- Shift: how cashiers open and close the cash drawer ---------------- */
function ShiftSettings() {
  const { f, setF, save, busy } = useSettingsForm(['shift_mode', 'shift_required']);
  const mode = f.shift_mode === 'shared' ? 'shared' : 'cashier';
  const options = [['cashier', 'Each cashier opens their own shift', 'Every cashier counts their own cash. Short or over is shown per cashier.'],
    ['shared', 'One shared shift per drawer', 'Everyone sells from the same drawer. One person opens and closes it.']];
  return (
    <div className="card form">
      <Field label="How shifts work" wide hint="Shifts that are already open finish the way they were opened.">
        <div className="sh-modes" role="radiogroup" aria-label="How shifts work">
          {options.map(([v, t, d]) => (
            <label key={v} className={`sh-mode ${mode === v ? 'on' : ''}`}>
              <input type="radio" name="shift_mode" value={v} checked={mode === v} onChange={() => setF({ ...f, shift_mode: v })} />
              <span><b>{t}</b><small>{d}</small></span>
            </label>
          ))}
        </div>
      </Field>
      <label className="check wide"><input type="checkbox" checked={f.shift_required === 'true'} onChange={(e) => setF({ ...f, shift_required: String(e.target.checked) })} /> <span><b>Open a shift before selling</b> — Point of sale stays locked until a shift is open. Turn off to make shifts optional.</span></label>
      <div className="wide row end"><Btn kind="primary" busy={busy} onClick={save}>Save</Btn></div>
    </div>
  );
}

/* ---------------- Close books: nothing dated on or before this day can be entered or cancelled ---------------- */
function BooksSettings() {
  const { f, setF, save, busy } = useSettingsForm(['books_locked_until', 'day_close_lock']);
  const yesterday = shopDay(-1); // the shop's yesterday (server time zone), not this computer's clock
  return (
    <div className="card form">
      <Field label="Books closed up to" wide hint="After you have checked a month, close it: purchases, payments, expenses and account entries dated on or before this day can no longer be added, and nothing from then can be cancelled. Leave empty to keep every day open.">
        <DateInput max={yesterday} value={f.books_locked_until || ''} onChange={(e) => setF({ ...f, books_locked_until: e.target.value })} />
      </Field>
      <label className="check wide"><input type="checkbox" checked={f.day_close_lock !== 'false'} onChange={(e) => setF({ ...f, day_close_lock: String(e.target.checked) })} /> <span><b>Lock a day when it is closed</b> — after Day close, money dated that day can no longer be added, changed or cancelled in that account until an admin reopens the day.</span></label>
      <div className="wide row end">
        {f.books_locked_until && <Btn onClick={() => setF({ ...f, books_locked_until: '' })}>Reopen all days</Btn>}
        <Btn kind="primary" busy={busy} onClick={save}>Save</Btn>
      </div>
    </div>
  );
}

/* ---------------- Invoice: template, paper size and footer note ---------------- */
const SAMPLE = {
  sale: { invoice_no: 'INV-000123', date: new Date().toISOString(), created_at: new Date().toISOString(), customer_name: 'Mehedi Hasan', user_name: 'Admin', subtotal: 7700, discount: 200, total: 7500, paid: 7000, due: 500, status: 'active', payments: [{ account_name: 'Cash', amount: 5000 }, { account_name: 'bKash', amount: 2000 }] },
  items: [
    { name: 'ROUTER DUAL BAND TP LINK C54', unit: 'pcs', qty: 1, price: 2200, total: 2200, serials: 'RT22C54A0012', warranty_days: 365, warranty_expiry: new Date(Date.now() + 365 * 864e5).toISOString(), warranty_type: 'serial' },
    { name: 'Kingston 512GB NVMe SSD', unit: 'pcs', qty: 1, price: 4800, total: 4800, warranty_days: 1095, warranty_expiry: new Date(Date.now() + 1095 * 864e5).toISOString(), warranty_type: 'invoice' },
    { name: 'Cat6 Cable', unit: 'meter', qty: 10, price: 70, total: 700 }
  ],
  customer: { phones: '01303393871', addresses: 'BERA BAZAR, PABNA', balance: 500 }
};

/** One row of the Link validity card: a number of days, or Lifetime (stored as "life"). */
function LinkDays({ label, hint, value, def, onChange }) {
  const life = String(value || '').toLowerCase() === 'life';
  const days = life ? '' : (value === undefined || value === null || value === '' ? String(def) : String(value));
  return (
    <div className="lv-row">
      <div className="lv-name"><span>{label}</span><small className="muted">{hint}</small></div>
      <div className="lv-ctl">
        <div className="seg" role="radiogroup" aria-label={`${label} validity`}>
          <button type="button" role="radio" aria-checked={!life} className={!life ? 'on' : ''} onClick={() => life && onChange(String(def))}>Days</button>
          <button type="button" role="radio" aria-checked={life} className={life ? 'on' : ''} onClick={() => onChange('life')}>Lifetime</button>
        </div>
        {life ? <span className="lv-life">Never expires</span>
          : <label className="lv-days"><input type="number" min="1" max="3650" step="1" value={days} onChange={(e) => onChange(e.target.value)} aria-label={`${label} — days valid`} /> days</label>}
      </div>
    </div>
  );
}

function InvoiceSettings() {
  const { f, setF, bind, save, busy } = useSettingsForm(['invoice_template', 'invoice_paper', 'invoice_custom_width', 'invoice_custom_height', 'invoice_note', 'shop_footer', 'receipt_width', 'invoice_qr', 'invoice_link_days', 'quote_link_days', 'invoice_link_base']);
  const settings = useStore((s) => s.settings);
  const paper = f.invoice_paper || String(f.receipt_width || 80);
  const tpl = f.invoice_template || 'classic';
  const saveAll = () => { if (paper === '58' || paper === '80') f.receipt_width = paper; return save(); };
  // Try the unsaved choices: print the sample with them, then restore the saved settings.
  const sample = () => {
    const saved = useStore.getState().settings;
    useStore.setState({ settings: { ...saved, ...f, invoice_paper: paper } });
    try { printInvoice(SAMPLE); } finally { setTimeout(() => useStore.setState({ settings: saved }), 1500); }
  };
  return (
    <div className="card form">
      <div className="wide inv-top">
        <div>
        <span className="field-label">Invoice template</span>
        <div className="tpl-pick" role="radiogroup" aria-label="Invoice template">
          {TEMPLATES.map(([k, label]) => (
            <button type="button" key={k} role="radio" aria-checked={tpl === k} className={`tpl-card ${tpl === k ? 'on' : ''}`} onClick={() => setF({ ...f, invoice_template: k })}>
              <span className={`tpl-thumb t-${k}`}><i /><i /><i /><i /></span>
              <b>{label}</b>
              <small>{k === 'classic' ? 'Dark header, boxed tables' : k === 'modern' ? 'Colour banner, teal accents' : k === 'business' ? 'Centred letterhead, grey bill bar (A4)' : 'Clean lines, no shading'}</small>
            </button>
          ))}
        </div>
        </div>
        <section className="link-valid" aria-label="Link validity">
          <b className="lv-title">Link validity</b>
          <small className="muted">How long a link sent to a customer keeps working. New links only — links already sent keep their date.</small>
          <LinkDays label="Online invoice link" hint="Sent with the sale SMS or shared from Sales" value={f.invoice_link_days} def={15} onChange={(v) => setF({ ...f, invoice_link_days: v })} />
          <LinkDays label="Quotation link" hint="Sent by SMS from the PC builder / Quotation" value={f.quote_link_days} def={3} onChange={(v) => setF({ ...f, quote_link_days: v })} />
          <details className="lv-base"><summary className="muted">Web address of the invoice page</summary>
            <input value={f.invoice_link_base || ''} onChange={(e) => setF({ ...f, invoice_link_base: e.target.value })} placeholder={DEFAULT_LINK_BASE} aria-label="Invoice page web address" /></details>
        </section>
      </div>
      <Field label="Paper size" hint="Used by Complete & print in the POS.">
        <select value={paper} onChange={(e) => setF({ ...f, invoice_paper: e.target.value })}>{PAPERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </Field>
      {paper === 'custom' && <>
        <Field label="Width (mm)" hint="40 – 216 mm"><input type="number" min="40" max="216" {...bind('invoice_custom_width')} placeholder="e.g. 90" /></Field>
        <Field label="Height (mm)" hint="Leave empty to fit the invoice"><input type="number" min="40" max="1000" {...bind('invoice_custom_height')} placeholder="Auto" /></Field>
      </>}
      <Field label="Thank-you line" wide hint="Centered under the totals."><input {...bind('shop_footer')} placeholder="Thank you for your business!" /></Field>
      <Field label="Footer note" wide hint="Printed at the very bottom, left side, after “Note:”. Leave empty to hide.">
        <textarea {...bind('invoice_note')} rows={3} placeholder="e.g. Goods once sold are not refundable. Warranty does not cover burn or physical damage." />
      </Field>
      {f.invoice_note && <p className="wide muted" style={{ margin: 0 }}>Preview: <b>Note:</b> {f.invoice_note}</p>}
      <label className="check wide"><input type="checkbox" checked={f.invoice_qr !== 'false'} onChange={(e) => setF({ ...f, invoice_qr: String(e.target.checked) })} /> Print a QR code with the invoice number (scan it in Advanced search to find the invoice for warranty, service or returns)</label>
      <div className="wide row end">
        <Btn onClick={sample}>Print a sample</Btn>
        <Btn kind="primary" busy={busy} onClick={saveAll}>Save invoice settings</Btn>
      </div>
      {settings.invoice_paper !== paper && <p className="wide muted" style={{ margin: 0 }}>Not saved yet — the POS still prints on {settings.invoice_paper === 'custom' ? `custom ${settings.invoice_custom_width || 80} mm${Number(settings.invoice_custom_height) > 0 ? ` × ${settings.invoice_custom_height} mm` : ''}` : PAPERS.find((x) => x[0] === (settings.invoice_paper || String(settings.receipt_width || 80)))?.[1]}.</p>}
    </div>
  );
}

/* ---------------- Dashboard: which cards to show ---------------- */
function DashboardSettings() {
  const settings = useStore((s) => s.settings);
  const [hidden, setHidden] = useState(() => hiddenCards(settings));
  const [busy, run] = useAction();
  const toggle = (k) => setHidden((h) => (h.includes(k) ? h.filter((x) => x !== k) : [...h, k]));
  const save = async () => { const s = await run(() => api('settings.save', { values: { dashboard_hidden: JSON.stringify(hidden) } }), 'Dashboard updated'); useStore.setState({ settings: s }); };
  return (
    <div className="card">
      <p className="muted" style={{ marginTop: 0 }}>Tick the cards to show on the Dashboard. Unticked cards are hidden for everyone.</p>
      <div className="dash-pick">
        {DASH_CARDS.map(([k, label]) => (
          <label key={k} className={`check dash-opt ${hidden.includes(k) ? '' : 'on'}`}><input type="checkbox" checked={!hidden.includes(k)} onChange={() => toggle(k)} /> {label}</label>
        ))}
      </div>
      <div className="row end" style={{ marginTop: 14, gap: 8 }}>
        <Btn onClick={() => setHidden([])}>Show all</Btn>
        <Btn kind="primary" busy={busy} onClick={save}>Save dashboard</Btn>
      </div>
    </div>
  );
}

const DEFAULT_LINK_BASE = 'https://codewithroni.github.io/karvio/';
const linkBaseOf = (v) => {
  const b = String(v || '').trim();
  return (/^https?:\/\//i.test(b) ? b : DEFAULT_LINK_BASE).replace(/[#?].*$/, '').replace(/\/*$/, '/');
};
/** How many SMS a message takes: 160 / 153 per part in English, 70 / 67 in Bangla (Unicode). */
export function smsParts(text) {
  const unicode = /[^\x00-\x7F]/.test(text);
  const n = [...text].length, one = unicode ? 70 : 160, multi = unicode ? 67 : 153;
  return { unicode, count: n <= one ? 1 : Math.ceil(n / multi) };
}

const DEFAULT_QUOTE_SMS = 'Dear {name}, your quotation from {shop}: {title}, total {total}. View it here (valid {days} days): {link}';
function SmsSettings() {
  const { f, setF, bind, save, busy } = useSettingsForm(['sms_enabled', 'sms_method', 'sms_url', 'sms_body', 'sms_body_type', 'sms_api_key', 'sms_sender_id', 'sms_number_format', 'sms_headers']);
  const [builderVersion, setBuilderVersion] = useState(0);
  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const saved = useStore(s=>s.settings);
  const dirty = Object.keys(f).some(k=>String(f[k]||'')!==String(saved[k]||''));
  const [mappingError, setMappingError] = useState('');
  const configError = mappingError || gatewayError(f);
  const [phone, setPhone] = useState('');
  const preset = matchPreset(f);
  const [tbusy, run] = useAction();
  const log = useApi('sms.log', {}, [], {refreshMs:5000});
  return (
    <div className="split">
      <div className="card form">
        <label className="check wide"><input type="checkbox" checked={f.sms_enabled === 'true'} onChange={(e) => setF({ ...f, sms_enabled: String(e.target.checked) })} /> <b>SMS gateway on</b> — the main switch: when it is off, no SMS is sent at all</label>
        <p className="muted wide" style={{ margin: 0 }}>Which SMS go out (sale, repair, service, quotation, due reminder, daily summary) and their messages are in the <b>SMS settings</b> tab. Gateway credentials stay in your shop backend and are hidden from users without Settings permission.</p>
        <Field label="1. Choose your gateway" wide>
          {/* The list shows only real providers. "Choose…" / "Custom" are status labels for the closed box,
              added (hidden) only while they are the current state, so they never appear as dead rows in the list. */}
          <select value={preset} aria-label="SMS provider preset" onChange={(e) => { if(PRESETS[e.target.value]) {setF({ ...f, sms_body:'', sms_body_type:'form', ...PRESETS[e.target.value] });setBuilderVersion(v=>v+1);setMappingError('');setTestResult(null);} }}>
            {preset === '' && <option value="" hidden>Choose a provider template…</option>}
            {Object.keys(PRESETS).map((k) => <option key={k} value={k}>{k}</option>)}
            {preset === 'custom' && <option value="custom" hidden>Custom settings (my own)</option>}
          </select>
        </Field>
        <p className="muted wide sms-provider-note">{preset.startsWith('Generic') || preset==='custom' ? 'Custom gateway: enter your provider’s URL and match its request fields below. Switching a template changes the draft only; save when ready.' : preset.startsWith('OneCodeSoft') ? 'Use the API address from your OneCodeSoft dashboard. The authorization header and JSON fields are prepared for you.' : 'BulkSMSBD uses a GET request. Enter your API key and approved Sender ID below.'}</p>
        <Field label="API URL" wide hint="Use the full HTTPS endpoint supplied by your SMS provider."><input aria-label="API URL" {...bind('sms_url')} placeholder="https://your-provider.com/api/send" spellCheck={false} /></Field>
        <Field label="2. API key"><div className="row"><input aria-label="API key" type={showKey?'text':'password'} {...bind('sms_api_key')} autoComplete="off" /><Btn size="sm" aria-label={showKey?'Hide API key':'Show API key'} onClick={()=>setShowKey(v=>!v)}>{showKey?'Hide':'Show'}</Btn></div></Field>
        <Field label="Sender ID" hint="Use the sender name or ID approved by your provider."><input {...bind('sms_sender_id')} /></Field>
        <Field label="Phone number format"><select {...bind('sms_number_format')}><option value="intl">8801XXXXXXXXX — international</option><option value="local">01XXXXXXXXX — local</option></select></Field>
        {f.sms_method==='POST' && (preset.startsWith('Generic') || preset==='custom') && <SmsFieldBuilder key={builderVersion+':'+f.sms_body_type} body={f.sms_body} type={f.sms_body_type} onChange={(body,error)=>{setF({...f,sms_body:body});setMappingError(error);}} />}
        <details className="wide sms-advanced">
          <summary>Advanced request settings</summary>
          <p className="muted">For custom authentication, GET requests or a provider-specific request format. Available values: {'{api_key} {sender_id} {number} {message}'}</p>
          <div className="form">
            <Field label="Method"><select {...bind('sms_method')}><option>GET</option><option>POST</option></select></Field>
            {f.sms_method==='POST'&&<>
              <Field label="Body type"><select {...bind('sms_body_type')}><option value="form">Form</option><option value="json">JSON</option></select></Field>
              <Field label="Request body" wide><textarea value={f.sms_body} onChange={e=>{setF({...f,sms_body:e.target.value});setBuilderVersion(v=>v+1);setMappingError('');}} rows={5} spellCheck={false} /></Field>
            </>}
            <Field label="Request headers (optional)" wide hint="One header per line. Example: Authorization: Bearer {api_key}"><textarea {...bind('sms_headers')} rows={2} spellCheck={false} /></Field>
          </div>
        </details>
        {configError&&<p className="wide sms-warn" role="status">{configError}</p>}
        <div className="wide row end"><span className="muted">{dirty?'Unsaved changes':'Settings saved'}</span><Btn kind="primary" disabled={!!configError || !dirty} busy={busy} onClick={()=>save().catch(()=>{})}>Save SMS settings</Btn></div>
      </div>
      <div className="grid">
        <div className="card">
          <h2 style={{ marginBottom: 10 }}>Send a test SMS</h2>
          <p className="muted">{dirty?'Save your changes before testing.':'Send one real SMS using your saved settings. Provider charges may apply.'}</p>
          <div className="row"><input aria-label="Test SMS phone number" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" style={{ flex: 1 }} />
            <Btn busy={tbusy} disabled={dirty || !!configError || !/^\+?\d{10,15}$/.test(phone.replace(/[\s-]/g,''))} onClick={async () => {try{const result=await run(()=>api('sms.test',{phone:phone.replace(/[\s-]/g,'')}));setTestResult(result);log.reload();}catch(error){setTestResult({status:'failed',response:error.message});}}}>Send test</Btn></div>
        </div>
        {testResult&&<div className="card" role="status"><Badge tone={testResult.status==='sent'?'ok':'muted'}>{testResult.status || (testResult.ok?'sent':'unknown')}</Badge><p>{testResult.status==='queued'?'Queued for delivery. Check the SMS log for the final result.':testResult.response || 'Check the SMS log for delivery details.'}</p></div>}
        <DataTable title="SMS log" rows={log.data || []} loading={log.loading} exportable={false}
          columns={[{ key: 'ts', label: 'Time', value: (r) => fdatetime(r.ts) }, { key: 'phone', label: 'Phone' }, { key: 'status', label: 'Status', render: (r) => <Badge tone={r.status === 'sent' ? 'ok' : r.status==='failed'?'bad':'muted'}>{r.status}</Badge> }, { key: 'response', label: 'Gateway reply', className: 'clip' }]} />
      </div>
    </div>
  );
}

/** Daily summary SMS: today's sales, profit, expenses, dues and cash, sent to the owner every evening. */
/* ---------------- SMS settings: one card per SMS the ERP can send, each with its own switch and message ---------------- */
const DEFAULT_DUE_SMS = 'Dear {name}, your due at {shop} is Tk {due}. Please pay at your earliest convenience. Thank you. {shop_phone}';
const SMS_SAMPLE = { name: 'Rahim', shop: 'Your Shop', items: 'Router x1', invoice: 'INV-000123', total: '2,500', paid: '2,000', due: '500', date: '19 Nov 2026', link: 'https://…/#/i/Ab12Cd',
  device: 'Laptop', job: 'JOB-000045', advance: '500', technician: 'Karim', problem: 'No display', phone: '01712345678', service: 'CC Camera Installation', details: '4 cameras', address: 'Mirpur 10',
  note: 'Done', title: 'Gaming PC', days: '3', shop_phone: '01812345678', staff: 'Rafiq', kind: 'Purchase', details: 'Global Brand, Tk 19,000', no: 'APR-000012', branch: 'Main Branch' };
const DEFAULT_APPROVAL_SMS = '{staff} sent a {kind} for approval: {details}. Open Karvio → Approval. {shop}';
const SMS_CARDS = [
  { on: 'sms_on_sale', tpl: 'sms_template', title: 'Sale invoice SMS', who: 'To the customer after every sale with a named customer (cash sales never get one).', vars: '{name} {shop} {items} {invoice} {total} {paid} {due} {date} {link}', link: true },
  { on: 'sms_on_due_reminder', tpl: 'sms_due_template', title: 'Due reminder SMS', who: 'Sent from Collection → Remind, to the customers you tick.', vars: '{name} {due} {shop} {shop_phone}', def: DEFAULT_DUE_SMS },
  { on: 'sms_on_quote', tpl: 'sms_quote_template', title: 'Quotation SMS', who: 'Quotation → Send to customer.', quoteLink: true, vars: '{name} {shop} {title} {total} {days} {link}', def: DEFAULT_QUOTE_SMS },
  { on: 'sms_on_repair_done', tpl: 'sms_repair_template', title: 'Repair completed SMS', who: 'To the customer when a repair job is marked Completed — and the same SMS to the admin / manager numbers below.', vars: '{name} {device} {job} {shop} {total} {advance} {due}', numbers: 'sms_repair_done_numbers', numbersOptional: true },
  { on: 'sms_on_repair_tech', tpl: 'sms_technician_template', title: 'Repair — technician assigned', who: 'To the technician when a repair job is given to them.', vars: '{technician} {job} {device} {problem} {name} {phone} {shop}' },
  { on: 'sms_on_service_tech', tpl: 'sms_service_tech_template', title: 'Service — technician assigned', who: 'To the technician when a service job is given to them.', vars: '{technician} {job} {service} {details} {name} {phone} {address} {shop}' },
  { on: 'sms_on_service_done', tpl: 'sms_service_done_template', title: 'Service done — to admin / manager', who: 'When the technician presses Work done.', vars: '{job} {service} {name} {phone} {address} {technician} {note} {shop}', numbers: 'sms_service_done_numbers' },
  { on: 'sms_on_approval', tpl: 'sms_approval_template', title: 'Approval request — to admins', who: 'When a staff member sends work to the Approval menu (Users & Roles → Needs admin approval).', vars: '{staff} {kind} {details} {no} {branch} {shop}', def: DEFAULT_APPROVAL_SMS, numbers: 'sms_approval_numbers' },
];
function SmsFeatures() {
  const gateway = useStore((s) => s.settings.sms_enabled === 'true');
  return (
    <>
      {!gateway && <p className="sms-warn" role="status">The SMS gateway is off, so nothing is sent. Turn it on in the <b>SMS gateway</b> tab.</p>}
      <div className="smsf-grid">
        {SMS_CARDS.map((c) => <SmsCard key={c.on} c={c} gateway={gateway} />)}
        <div className="smsf-daily"><DailySummary /></div>
        <WhatsAppCard />
      </div>
    </>
  );
}
function SmsCard({ c, gateway }) {
  const keys = [c.on, c.tpl, ...(c.numbers ? [c.numbers] : [])];
  const { f, setF, bind, save, busy } = useSettingsForm(keys);
  const saved = useStore((s) => s.settings);
  const dirty = keys.some((k) => String(f[k] || '') !== String(saved[k] || ''));
  const on = f[c.on] !== 'false';
  const linkDays = (v, def) => (String(v || '').toLowerCase() === 'life' ? 0 : Number(v) || def);
  const qDays = linkDays(saved.quote_link_days, 3), iDays = linkDays(saved.invoice_link_days, 15);
  const sample = String(f[c.tpl] || c.def || '').replace(/\{(\w+)\}/g, (m, k) => (k === 'days' && c.quoteLink ? (qDays || 'unlimited') : SMS_SAMPLE[k] ?? m));
  const nums = c.numbers ? String(f[c.numbers] || '').split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean).length : 0;
  const lifeNote = (d) => (d ? `works for ${d} day${d === 1 ? '' : 's'}` : 'never expires');
  const parts = smsParts(sample);
  return (
    <section className={`card smsf-card ${on ? 'on' : 'off'}`}>
      <div className="smsf-head">
        <div><h2>{c.title}</h2><p className="muted">{c.who}{c.quoteLink && ` The link ${lifeNote(qDays)} (Settings → Invoice → Link validity).`}{c.link && ` {link} adds the invoice link — it ${lifeNote(iDays)} (Settings → Invoice → Link validity).`}</p></div>
        <label className="tgl" title={on ? 'On' : 'Off'}><input type="checkbox" checked={on} onChange={(e) => setF({ ...f, [c.on]: String(e.target.checked) })} aria-label={`${c.title} on`} /><span /></label>
      </div>
      <Field label="Message" wide hint={`Placeholders: ${c.vars}`}><textarea rows={3} {...bind(c.tpl)} placeholder={c.def || ''} aria-label={`${c.title} message`} disabled={!on} /></Field>
      {c.numbers && <Field label={<>Send to admin / manager <span className={`sms-count ${nums > 20 ? 'over' : ''}`}>{nums} / 20</span></>} wide
        hint={`${c.numbersOptional ? 'Optional — ' : ''}1 to 20 mobile numbers, separated by commas. Every number gets this SMS.`}>
        <textarea rows={2} {...bind(c.numbers)} placeholder="01XXXXXXXXX, 01XXXXXXXXX, 01XXXXXXXXX" inputMode="tel" aria-label={`${c.title} numbers`} disabled={!on} /></Field>}
      {sample && <div className="note sms-preview">Preview ({[...sample].length} characters · {parts.count} SMS{parts.unicode ? ' · Bangla' : ''}): {sample}</div>}
      <div className="row end smsf-foot"><Badge tone={on && gateway ? 'ok' : on ? 'warn' : 'muted'}>{on ? (gateway ? 'Sending' : 'On — gateway off') : 'Off'}</Badge><span className="spacer" />
        <Btn kind="primary" size="sm" disabled={!dirty} busy={busy} onClick={() => save().catch(() => {})}>{dirty ? 'Save' : 'Saved'}</Btn></div>
    </section>
  );
}
function WhatsAppCard() {
  const { bind, save, busy, f } = useSettingsForm(['whatsapp_template']);
  const saved = useStore((s) => s.settings);
  return (
    <section className="card smsf-card on">
      <div className="smsf-head"><div><h2>WhatsApp invoice message</h2><p className="muted">Send on WhatsApp opens WhatsApp with this message filled in — no SMS cost.</p></div></div>
      <Field label="Message" wide hint="Placeholders: {name} {shop} {invoice} {total} {paid} {due} {link} {shop_phone}"><textarea rows={5} {...bind('whatsapp_template')} aria-label="WhatsApp invoice message" /></Field>
      <div className="row end smsf-foot"><span className="spacer" /><Btn kind="primary" size="sm" disabled={String(f.whatsapp_template || '') === String(saved.whatsapp_template || '')} busy={busy} onClick={() => save().catch(() => {})}>Save</Btn></div>
    </section>
  );
}

function DailySummary() {
  const { f, setF, save, busy } = useSettingsForm(['daily_summary_enabled', 'daily_summary_phones', 'daily_summary_hour']);
  const gateway = useStore((st) => st.settings.sms_enabled === 'true');
  const pv = useApi('summary.preview', {});
  const [sending, run] = useAction();
  const on = f.daily_summary_enabled === 'true';
  const dsCount = String(f.daily_summary_phones || '').split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean).length;
  return (
    <div className="card ds-card">
      <div className="card-head"><h2>Daily summary to the owner</h2>{pv.data?.last_sent && <span className="muted">Last sent {fdate(pv.data.last_sent)}</span>}</div>
      <div className="ds-grid">
        <div className="form" style={{ alignContent: 'start' }}>
          <label className="check wide"><input type="checkbox" checked={on} onChange={(e) => setF({ ...f, daily_summary_enabled: String(e.target.checked) })} /> Send today's summary by SMS every evening</label>
          <Field label={<>Phone numbers <span className={`sms-count ${dsCount > 20 ? 'over' : ''}`}>{dsCount} / 20</span></>} wide hint="1 to 20 mobile numbers, separated by commas. Every number gets the summary."><textarea rows={2} inputMode="tel" value={f.daily_summary_phones || ''} onChange={(e) => setF({ ...f, daily_summary_phones: e.target.value })} placeholder="01XXXXXXXXX, 01XXXXXXXXX" aria-label="Daily summary phone numbers" /></Field>
          <Field label="Send at"><select value={f.daily_summary_hour || '21'} onChange={(e) => setF({ ...f, daily_summary_hour: e.target.value })}>{[17, 18, 19, 20, 21, 22, 23].map((h) => <option key={h} value={h}>{h > 12 ? h - 12 : h}:00 PM</option>)}</select></Field>
          {!gateway && <p className="wide muted" style={{ margin: 0 }}>Turn on and save the SMS gateway above first.</p>}
          <div className="wide row" style={{ gap: 8, justifyContent: 'flex-end' }}>
            <Btn busy={sending} disabled={!gateway} onClick={async () => { await run(() => api('summary.send', {}), 'Summary queued — check the SMS log'); pv.reload(); }}>Send now</Btn>
            <Btn kind="primary" busy={busy} onClick={async () => { await save(); pv.reload(); }}>Save</Btn>
          </div>
          <p className="wide muted" style={{ margin: 0, fontSize: 12.5 }}>Sent once a day, within 15 minutes after the chosen time (Supabase shops). Each SMS is charged by your provider.</p>
        </div>
        <div><span className="field-label">Today's message</span><pre className="ds-preview">{pv.data?.text || (pv.loading ? 'Loading…' : pv.error || '')}</pre></div>
      </div>
    </div>
  );
}

function ApiSettings() {
  const [cfg, setCfg] = useState(getApiConfig());
  const [busy, run] = useAction();
  const save = async () => {
    // The old Apps Script address field is gone: saving here always uses the built-in server (or the proxy).
    const next = { ...cfg, scriptUrl: '' };
    const url = (next.proxyUrl || DEFAULT_API_URL || '').trim();
    const r = await run(() => testConnection(url));
    setApiConfig(next); setCfg(next);
    useStore.getState().toast(`Connected to ${r.app} v${r.version}`);
  };
  return (
    <div className="card form">
      <p className="muted wide" style={{ margin: 0 }}>Karvio connects to its built-in server by itself. Stored on this device only.</p>
      <Field label="Custom proxy domain (optional)" wide hint="When set, requests go here instead of the built-in server."><input value={cfg.proxyUrl || ''} onChange={(e) => setCfg({ ...cfg, proxyUrl: e.target.value })} placeholder="https://api.yourshop.com" /></Field>
      <div className="wide row end"><Btn kind="primary" busy={busy} onClick={save}>Test & save</Btn></div>
    </div>
  );
}

function MyPassword() {
  const [f, setF] = useState({ old_password: '', new_password: '', confirm: '' });
  const [busy, run] = useAction();
  const save = async () => {
    if (f.new_password !== f.confirm) return useStore.getState().toast('New passwords do not match', 'err');
    await run(() => api('password.change', f));
    await useStore.getState().logout();
    useStore.getState().toast('Password changed. Sign in again.');
  };
  return (
    <div className="card form" style={{ maxWidth: 480 }}>
      <Field label="Current password" wide><input type="password" value={f.old_password} onChange={(e) => setF({ ...f, old_password: e.target.value })} autoComplete="current-password" /></Field>
      <Field label="New password" wide hint="At least 12 characters."><input type="password" minLength={12} value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} autoComplete="new-password" /></Field>
      <Field label="Repeat new password" wide><input type="password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} autoComplete="new-password" /></Field>
      <div className="wide row end"><Btn kind="primary" busy={busy} onClick={save}>Change password</Btn></div>
    </div>
  );
}

const RESET_WORD = 'RESET';
/** Empties the whole shop database (Administrator account only). The server copies the spreadsheet first. */
function DatabaseReset({ onDone }) {
  const blank = { password: '', confirm: '', keep_settings: false, keep_users: false };
  const [f, setF] = useState(blank);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(null);
  const [busy, run] = useAction();
  const offline = isOffline();
  const ready = f.password && f.confirm.trim() === RESET_WORD;
  const reset = async () => {
    if (!ready) return;
    let r; try { r = await run(() => api('database.reset', f), 'Database reset — Karvio is fresh'); } catch { return; } // shown as a message; nothing changed
    // this computer's saved cart and saved PC Builder quotes point at products that no longer exist
    if (!clearShopDrafts()) useStore.getState().toast('Database changed, but saved carts could not be cleared. Clear this site’s saved data before opening POS.', 'err');
    setF(blank); setOpen(false);
    setDone(r);
    await useStore.getState().refresh('all').catch(() => {});
    onDone?.();
  };
  return (
    <div className="card form db-card db-danger">
      <div className="wide db-card-head"><span className="db-ic bad" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /><path d="M10 11v6M14 11v6" /></svg></span><h2>Reset Database</h2></div>
      {done && <div className="wide note reset-done" role="status">
        <b>Done — Karvio is fresh.</b>{' '}
        {done.backup ? <>A full safety backup of the old data was saved as <b>{done.backup.name}</b>{done.backup.url ? <> (<a href={done.backup.url} target="_blank" rel="noreferrer">open the copy</a>)</> : null}.</>
          : offline ? 'The previous data file is kept in the data folder on this computer.' : null}
      </div>}
      <div className="wide row end db-card-foot"><Btn kind="danger" onClick={() => setOpen(true)}>Reset Database</Btn></div>
      {open && (
        <Modal open size="md" title="Reset the whole database" onClose={() => { setOpen(false); setF(blank); }}
          footer={<><Btn onClick={() => { setOpen(false); setF(blank); }}>Cancel</Btn><Btn kind="danger" busy={busy} disabled={!ready} onClick={reset}>Delete everything</Btn></>}>
          <div className="form">
            <div className="wide reset-warn">
              <b>This deletes everything:</b> products and stock, serial numbers, purchases, sales, returns, customers, suppliers, dues and ledgers,
              accounts and their balances, expenses, warranty claims, saved quotations, online orders, approval requests, SMS log, invoice links and history. Invoice numbers start again from 1.
              <div style={{ marginTop: 6 }}>Your Administrator account stays, with the same password. {offline ? 'The previous data file is kept on this computer.' : 'Before deleting, a full safety backup is saved in your backend — if it cannot be saved, nothing is deleted.'}</div>
            </div>
            <label className="check wide"><input type="checkbox" checked={f.keep_settings} onChange={(e) => setF({ ...f, keep_settings: e.target.checked })} /> Keep shop settings (shop name, invoice, SMS gateway, dashboard)</label>
            <label className="check wide"><input type="checkbox" checked={f.keep_users} onChange={(e) => setF({ ...f, keep_users: e.target.checked })} /> Keep the other user accounts</label>
            <Field label="Administrator password" wide><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" /></Field>
            <Field label={`Type ${RESET_WORD} to confirm`} wide><input value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} placeholder={RESET_WORD} autoComplete="off" autoCapitalize="characters" spellCheck={false} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
