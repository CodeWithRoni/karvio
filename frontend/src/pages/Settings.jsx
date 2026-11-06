import { useState } from 'react';
import { useStore } from '../lib/store';
import { api, getApiConfig, setApiConfig, testConnection } from '../lib/api';
import { DEFAULT_API_URL } from '../config';
import { fdatetime } from '../lib/format';
import DataTable from '../components/DataTable';
import { PageHead, Btn, Field, useAction, Tabs, useApi, Badge } from '../components/ui';
import { DASH_CARDS, hiddenCards } from '../lib/dashboardCards';
import { PAPERS, TEMPLATES, printInvoice } from '../lib/receipt';

export default function Settings() {
  const can = useStore((s) => s.can);
  const [tab, setTab] = useState(can('settings') ? 'shop' : 'api');
  const tabs = [...(can('settings') ? [['shop', 'Shop'], ['invoice', 'Invoice'], ['dashboard', 'Dashboard'], ['sms', 'SMS gateway']] : []), ['api', 'API connection'], ['me', 'My password']];
  return (
    <>
      <PageHead title="Settings"><Tabs tabs={tabs} value={tab} onChange={setTab} /></PageHead>
      {tab === 'shop' && <ShopSettings />}
      {tab === 'invoice' && <InvoiceSettings />}
      {tab === 'dashboard' && <DashboardSettings />}
      {tab === 'sms' && <SmsSettings />}
      {tab === 'api' && <ApiSettings />}
      {tab === 'me' && <MyPassword />}
    </>
  );
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
  const { f, setF, bind, save, busy } = useSettingsForm(['shop_name', 'shop_phone', 'shop_tel', 'shop_email', 'shop_web', 'shop_social', 'shop_address', 'currency', 'invoice_prefix', 'low_stock_default']);
  return (
    <div className="card form">
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

function InvoiceSettings() {
  const { f, setF, bind, save, busy } = useSettingsForm(['invoice_template', 'invoice_paper', 'invoice_custom_width', 'invoice_note', 'shop_footer', 'receipt_width']);
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
      <div className="wide">
        <span className="field-label">Invoice template</span>
        <div className="tpl-pick" role="radiogroup" aria-label="Invoice template">
          {TEMPLATES.map(([k, label]) => (
            <button type="button" key={k} role="radio" aria-checked={tpl === k} className={`tpl-card ${tpl === k ? 'on' : ''}`} onClick={() => setF({ ...f, invoice_template: k })}>
              <span className={`tpl-thumb t-${k}`}><i /><i /><i /><i /></span>
              <b>{label}</b>
              <small>{k === 'classic' ? 'Dark header, boxed tables' : k === 'modern' ? 'Colour banner, teal accents' : 'Clean lines, no shading'}</small>
            </button>
          ))}
        </div>
      </div>
      <Field label="Paper size" hint="Used by Complete & print in the POS.">
        <select value={paper} onChange={(e) => setF({ ...f, invoice_paper: e.target.value })}>{PAPERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </Field>
      {paper === 'custom' && <Field label="Custom width (mm)" hint="40 – 216 mm. Height grows with the invoice."><input type="number" min="40" max="216" {...bind('invoice_custom_width')} placeholder="e.g. 90" /></Field>}
      <Field label="Thank-you line" wide hint="Centered under the totals."><input {...bind('shop_footer')} placeholder="Thank you for your business!" /></Field>
      <Field label="Footer note" wide hint="Printed at the very bottom, left side, after “Note:”. Leave empty to hide.">
        <textarea {...bind('invoice_note')} rows={3} placeholder="e.g. Goods once sold are not refundable. Warranty does not cover burn or physical damage." />
      </Field>
      {f.invoice_note && <p className="wide muted" style={{ margin: 0 }}>Preview: <b>Note:</b> {f.invoice_note}</p>}
      <div className="wide row end">
        <Btn onClick={sample}>Print a sample</Btn>
        <Btn kind="primary" busy={busy} onClick={saveAll}>Save invoice settings</Btn>
      </div>
      {settings.invoice_paper !== paper && <p className="wide muted" style={{ margin: 0 }}>Not saved yet — the POS still prints on {PAPERS.find((x) => x[0] === (settings.invoice_paper || String(settings.receipt_width || 80)))?.[1]}.</p>}
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

const PRESETS = {
  'BulkSMSBD (GET)': { sms_method: 'GET', sms_url: 'https://bulksmsbd.net/api/smsapi?api_key={api_key}&type=text&number={number}&senderid={sender_id}&message={message}', sms_number_format: 'intl' },
  'Generic JSON POST': { sms_method: 'POST', sms_body_type: 'json', sms_url: 'https://api.example.com/sms/send', sms_body: '{"api_key":"{api_key}","senderid":"{sender_id}","contacts":"{number}","msg":"{message}"}', sms_number_format: 'intl' },
  'Generic form POST': { sms_method: 'POST', sms_body_type: 'form', sms_url: 'https://api.example.com/sms/send', sms_body: 'api_key={api_key}&senderid={sender_id}&number={number}&message={message}', sms_number_format: 'local' }
};

function SmsSettings() {
  const { f, setF, bind, save, busy } = useSettingsForm(['sms_enabled', 'sms_method', 'sms_url', 'sms_body', 'sms_body_type', 'sms_api_key', 'sms_sender_id', 'sms_number_format', 'sms_template']);
  const [phone, setPhone] = useState('');
  const [tbusy, run] = useAction();
  const log = useApi('sms.log', {});
  const sample = (f.sms_template || '').replace(/\{(\w+)\}/g, (m, k) => ({ name: 'Rahim', shop: useStore.getState().settings.shop_name, items: 'Kingston 512GB SSD x1, Cat6 Cable x15', invoice: 'INV-000123', total: '5,250', paid: '5,000', due: '250', date: '2026-11-05' }[k] ?? m));
  return (
    <div className="split">
      <div className="card form">
        <label className="check wide"><input type="checkbox" checked={f.sms_enabled === 'true'} onChange={(e) => setF({ ...f, sms_enabled: String(e.target.checked) })} /> Send an SMS after every sale that has a named customer</label>
        <p className="muted wide" style={{ margin: 0 }}>Walk-in sales never trigger an SMS. The API key is stored in your Google Sheet and never sent to the browser of non-admin users.</p>
        <Field label="Start from a preset" wide>
          <select value="" onChange={(e) => e.target.value && setF({ ...f, ...PRESETS[e.target.value] })}><option value="">Choose a provider template…</option>{Object.keys(PRESETS).map((k) => <option key={k}>{k}</option>)}</select>
        </Field>
        <Field label="Method"><select {...bind('sms_method')}><option>GET</option><option>POST</option></select></Field>
        <Field label="Phone number format"><select {...bind('sms_number_format')}><option value="intl">8801XXXXXXXXX</option><option value="local">01XXXXXXXXX</option></select></Field>
        <Field label="API URL" wide hint="Placeholders: {api_key} {sender_id} {number} {message}"><input {...bind('sms_url')} /></Field>
        {f.sms_method === 'POST' && <>
          <Field label="Body type"><select {...bind('sms_body_type')}><option value="form">Form (x-www-form-urlencoded)</option><option value="json">JSON</option></select></Field>
          <Field label="Request body" wide><textarea {...bind('sms_body')} /></Field>
        </>}
        <Field label="API key"><input type="password" {...bind('sms_api_key')} autoComplete="off" /></Field>
        <Field label="Sender ID"><input {...bind('sms_sender_id')} /></Field>
        <Field label="Message template" wide hint="Placeholders: {name} {shop} {items} {invoice} {total} {paid} {due} {date}"><textarea {...bind('sms_template')} /></Field>
        <div className="wide note">Preview ({sample.length} characters): {sample}</div>
        <div className="wide row end"><Btn kind="primary" busy={busy} onClick={save}>Save SMS settings</Btn></div>
      </div>
      <div className="grid">
        <div className="card">
          <h2 style={{ marginBottom: 10 }}>Send a test SMS</h2>
          <p className="muted">Save your settings first, then test.</p>
          <div className="row"><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" style={{ flex: 1 }} />
            <Btn busy={tbusy} onClick={async () => { await run(() => api('sms.test', { phone }), 'Test SMS sent'); log.reload(); }}>Send test</Btn></div>
        </div>
        <DataTable title="SMS log" rows={log.data || []} loading={log.loading} pageSize={15} exportable={false}
          columns={[{ key: 'ts', label: 'Time', value: (r) => fdatetime(r.ts) }, { key: 'phone', label: 'Phone' }, { key: 'status', label: 'Status', render: (r) => <Badge tone={r.status === 'sent' ? 'ok' : 'bad'}>{r.status}</Badge> }, { key: 'response', label: 'Gateway reply', className: 'clip' }]} />
      </div>
    </div>
  );
}

function ApiSettings() {
  const [cfg, setCfg] = useState(getApiConfig());
  const [busy, run] = useAction();
  const save = async () => {
    const url = (cfg.proxyUrl || cfg.scriptUrl || DEFAULT_API_URL || '').trim();
    const r = await run(() => testConnection(url));
    setApiConfig(cfg);
    useStore.getState().toast(`Connected to ${r.app} v${r.version}`);
  };
  return (
    <div className="card form">
      <p className="muted wide" style={{ margin: 0 }}>Stored on this device only. Change it here after redeploying the Apps Script — no rebuild needed.</p>
      <Field label="Apps Script Web App URL" wide hint="Leave empty to use the built-in server address."><input value={cfg.scriptUrl || ''} onChange={(e) => setCfg({ ...cfg, scriptUrl: e.target.value })} placeholder={DEFAULT_API_URL || 'https://script.google.com/macros/s/…/exec'} /></Field>
      <Field label="Custom proxy domain (optional)" wide hint="When set, requests go here instead of the script URL."><input value={cfg.proxyUrl || ''} onChange={(e) => setCfg({ ...cfg, proxyUrl: e.target.value })} placeholder="https://api.yourshop.com" /></Field>
      <div className="wide row end"><Btn kind="primary" busy={busy} onClick={save}>Test & save</Btn></div>
    </div>
  );
}

function MyPassword() {
  const [f, setF] = useState({ old_password: '', new_password: '', confirm: '' });
  const [busy, run] = useAction();
  const save = async () => {
    if (f.new_password !== f.confirm) return useStore.getState().toast('New passwords do not match', 'err');
    await run(() => api('password.change', f), 'Password changed');
    setF({ old_password: '', new_password: '', confirm: '' });
  };
  return (
    <div className="card form" style={{ maxWidth: 480 }}>
      <Field label="Current password" wide><input type="password" value={f.old_password} onChange={(e) => setF({ ...f, old_password: e.target.value })} autoComplete="current-password" /></Field>
      <Field label="New password" wide><input type="password" value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} autoComplete="new-password" /></Field>
      <Field label="Repeat new password" wide><input type="password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} autoComplete="new-password" /></Field>
      <div className="wide row end"><Btn kind="primary" busy={busy} onClick={save}>Change password</Btn></div>
    </div>
  );
}
