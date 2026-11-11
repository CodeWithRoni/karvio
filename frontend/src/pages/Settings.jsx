import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { api, getApiConfig, setApiConfig, testConnection, isOffline, getToken } from '../lib/api';
import { DEFAULT_API_URL } from '../config';
import { fdatetime } from '../lib/format';
import DataTable from '../components/DataTable';
import { PageHead, Btn, Field, useAction, Tabs, useApi, Badge } from '../components/ui';
import { DASH_CARDS, hiddenCards } from '../lib/dashboardCards';
import { PAPERS, TEMPLATES, printInvoice } from '../lib/receipt';
import { PRESETS, matchPreset } from '../lib/smsPresets';
import SmsFieldBuilder from '../components/SmsFieldBuilder';
import { gatewayError } from '../lib/smsGateway';
import { DatabaseTab } from '../components/DatabaseTools';

export default function Settings() {
  const can = useStore((s) => s.can);
  const offline = isOffline();
  const admin = useStore((s) => s.user?.role === 'admin');
  const owner = useStore((s) => s.user?.owner === true); // the Administrator account only — not every admin
  const [tab, setTab] = useState(can('settings') ? 'shop' : offline ? 'me' : 'api');
  const tabs = [...(can('settings') ? [['shop', 'Shop'], ['invoice', 'Invoice'], ['dashboard', 'Dashboard'], ...(!offline ? [['sms', 'SMS gateway']] : [])] : []), ...(offline ? admin ? [['local', 'Offline data & backup']] : [] : [['api', 'API connection']]), ...(admin && can('settings') ? [['books', 'Close books']] : []), ['me', 'My password'], ...(owner ? [['database', 'Database']] : [])];
  return (
    <>
      <PageHead title="Settings"><Tabs tabs={tabs} value={tab} onChange={setTab} /></PageHead>
      {tab === 'shop' && <ShopSettings />}
      {tab === 'invoice' && <InvoiceSettings />}
      {tab === 'dashboard' && <DashboardSettings />}
      {tab === 'sms' && <SmsSettings />}
      {tab === 'api' && <ApiSettings />}
      {tab === 'local' && <OfflineSettings />}
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

/* ---------------- Close books: nothing dated on or before this day can be entered or cancelled ---------------- */
function BooksSettings() {
  const { f, setF, save, busy } = useSettingsForm(['books_locked_until']);
  const d = new Date(); d.setDate(d.getDate() - 1);
  const yesterday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return (
    <div className="card form">
      <Field label="Books closed up to" wide hint="After you have checked a month, close it: purchases, payments, expenses and account entries dated on or before this day can no longer be added, and nothing from then can be cancelled. Leave empty to keep every day open.">
        <input type="date" max={yesterday} value={f.books_locked_until || ''} onChange={(e) => setF({ ...f, books_locked_until: e.target.value })} />
      </Field>
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

function InvoiceSettings() {
  const { f, setF, bind, save, busy } = useSettingsForm(['invoice_template', 'invoice_paper', 'invoice_custom_width', 'invoice_custom_height', 'invoice_note', 'shop_footer', 'receipt_width']);
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
              <small>{k === 'classic' ? 'Dark header, boxed tables' : k === 'modern' ? 'Colour banner, teal accents' : k === 'business' ? 'Centred letterhead, grey bill bar (A4)' : 'Clean lines, no shading'}</small>
            </button>
          ))}
        </div>
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

function SmsSettings() {
  const { f, setF, bind, save, busy } = useSettingsForm(['sms_enabled', 'sms_method', 'sms_url', 'sms_body', 'sms_body_type', 'sms_api_key', 'sms_sender_id', 'sms_number_format', 'sms_template', 'sms_repair_template', 'sms_technician_template', 'sms_headers', 'sms_invoice_link', 'invoice_link_base']);
  const [builderVersion, setBuilderVersion] = useState(0);
  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [preview, setPreview] = useState('sms_template');
  const saved = useStore(s=>s.settings);
  const dirty = Object.keys(f).some(k=>String(f[k]||'')!==String(saved[k]||''));
  const [mappingError, setMappingError] = useState('');
  const configError = mappingError || gatewayError(f);
  const linkOn = f.sms_invoice_link !== 'false'; // on unless switched off
  const [phone, setPhone] = useState('');
  const preset = matchPreset(f);
  const [tbusy, run] = useAction();
  const log = useApi('sms.log', {}, [], {refreshMs:5000});
  const sampleLink = `${linkBaseOf(f.invoice_link_base)}#/i/Ab12Cd34Ef56Gh78Ij90Kl`;
  let sample = (f[preview] || '').replace(/\{(\w+)\}/g, (m, k) => ({ name: 'Rahim', shop: useStore.getState().settings.shop_name, items: 'Kingston 512GB SSD x1, Cat6 Cable x15', invoice: 'INV-000123', total: '5,250', paid: '5,000', due: '250', device:'Laptop', job:'REP-000123', advance:'500', technician:'Karim', problem:'No display', phone:'01700000000', date: new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka'}).format(new Date()), link: linkOn ? sampleLink : '' }[k] ?? m));
  if (preview==='sms_template' && linkOn && !/\{link\}/.test(f.sms_template || '')) sample += ` Invoice: ${sampleLink}`;
  if (!linkOn) sample = sample.replace(/\s*(View|Invoice|Link):?\s*$/i, '');
  const parts = smsParts(sample);
  return (
    <div className="split">
      <div className="card form">
        <label className="check wide"><input type="checkbox" checked={f.sms_enabled === 'true'} onChange={(e) => setF({ ...f, sms_enabled: String(e.target.checked) })} /> Send an SMS after every sale that has a named customer</label>
        <p className="muted wide" style={{ margin: 0 }}>Walk-in sales never trigger an SMS. Gateway credentials stay in your shop backend and are hidden from users without Settings permission.</p>
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
        <Field label="3. Sale message template" wide hint="Placeholders: {name} {shop} {items} {invoice} {total} {paid} {due} {date} {link}"><textarea {...bind('sms_template')} /></Field>
        <Field label="Repair completed message" wide hint="Sent to the customer when a repair job is marked Completed. Placeholders: {name} {device} {job} {shop} {total} {advance} {due}"><textarea {...bind('sms_repair_template')} /></Field>
        <Field label="Technician job message" wide hint="Sent to the technician when a repair job is given to them. Placeholders: {technician} {job} {device} {problem} {name} {phone} {shop}"><textarea {...bind('sms_technician_template')} /></Field>
        <div className="wide sms-link">
          <label className="check"><input type="checkbox" checked={linkOn} onChange={(e) => setF({ ...f, sms_invoice_link: String(e.target.checked) })} /> <b>Add a link to the invoice</b></label>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 12.5 }}>The customer taps it to see (and download) only their own invoice. Each link works for <b>15 days</b>, then it expires. Put <code>{'{link}'}</code> in the template to choose where it goes — otherwise it is added at the end.</p>
          {linkOn && (
            <details style={{ marginTop: 6 }}>
              <summary className="muted" style={{ cursor: 'pointer', fontSize: 12.5 }}>Web address of the invoice page</summary>
              <input {...bind('invoice_link_base')} placeholder={DEFAULT_LINK_BASE} aria-label="Invoice page web address" style={{ marginTop: 6, width: '100%' }} />
              <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>Leave empty to use {DEFAULT_LINK_BASE}. Change it only if Karvio runs on your own domain.</p>
            </details>
          )}
        </div>
        <Field label="Preview message" wide><select aria-label="Preview message" value={preview} onChange={e=>setPreview(e.target.value)}><option value="sms_template">Sale invoice</option><option value="sms_repair_template">Repair completed</option><option value="sms_technician_template">Technician assignment</option></select></Field>
        <div className="wide note sms-preview">Preview ({[...sample].length} characters · estimated {parts.count} SMS{parts.unicode ? ' · Bangla / Unicode' : ''}): {sample}</div>
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
        <DataTable title="SMS log" rows={log.data || []} loading={log.loading} pageSize={15} exportable={false}
          columns={[{ key: 'ts', label: 'Time', value: (r) => fdatetime(r.ts) }, { key: 'phone', label: 'Phone' }, { key: 'status', label: 'Status', render: (r) => <Badge tone={r.status === 'sent' ? 'ok' : r.status==='failed'?'bad':'muted'}>{r.status}</Badge> }, { key: 'response', label: 'Gateway reply', className: 'clip' }]} />
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
    await run(() => api('password.change', f));
    await useStore.getState().logout();
    useStore.getState().toast('Password changed. Sign in again.');
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

const RESET_WORD = 'RESET';
/** Empties the whole shop database (Administrator account only). The server copies the spreadsheet first. */
function DatabaseReset({ onDone }) {
  const [f, setF] = useState({ password: '', confirm: '', keep_settings: false, keep_users: false });
  const [done, setDone] = useState(null);
  const [busy, run] = useAction();
  const offline = isOffline();
  const ready = f.password && f.confirm.trim() === RESET_WORD;
  const reset = async () => {
    if (!ready) return;
    let r; try { r = await run(() => api('database.reset', f), 'Database reset — Karvio is fresh'); } catch { return; } // shown as a message; nothing changed
    // this computer's saved cart and saved PC Builder quotes point at products that no longer exist
    ['erp_pos_draft', 'erp_quotes'].forEach((k) => { try { localStorage.removeItem(k); } catch { /* private mode */ } });
    setF({ password: '', confirm: '', keep_settings: false, keep_users: false });
    setDone(r);
    await useStore.getState().refresh('all').catch(() => {});
    onDone?.();
  };
  return (
    <div className="card form reset-card">
      <h2 className="wide" style={{ margin: 0 }}>Reset the whole database</h2>
      {done && <div className="wide note reset-done" role="status">
        <b>Done — Karvio is fresh.</b>{' '}
        {done.backup ? <>A full safety backup of the old data was saved as <b>{done.backup.name}</b>{done.backup.url ? <> (<a href={done.backup.url} target="_blank" rel="noreferrer">open the copy</a>)</> : null}.</>
          : offline ? 'The previous data file is kept in the data folder on this computer.' : null}
      </div>}
      <div className="wide reset-warn">
        <b>This deletes everything:</b> products and stock, serial numbers, purchases, sales, returns, customers, suppliers, dues and ledgers,
        accounts and their balances, expenses, warranty claims, SMS log, invoice links and history. Invoice numbers start again from 1.
        <div style={{ marginTop: 6 }}>Your Administrator account stays, with the same password. {offline ? 'The previous data file is kept on this computer.' : 'Before deleting, a full safety backup is saved in your backend — if it cannot be saved, nothing is deleted.'}</div>
      </div>
      <label className="check wide"><input type="checkbox" checked={f.keep_settings} onChange={(e) => setF({ ...f, keep_settings: e.target.checked })} /> Keep shop settings (shop name, invoice, SMS gateway, dashboard)</label>
      <label className="check wide"><input type="checkbox" checked={f.keep_users} onChange={(e) => setF({ ...f, keep_users: e.target.checked })} /> Keep the other user accounts</label>
      <Field label="Administrator password" wide><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" /></Field>
      <Field label={`Type ${RESET_WORD} to confirm`} wide><input value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} placeholder={RESET_WORD} autoComplete="off" autoCapitalize="characters" spellCheck={false} /></Field>
      <div className="wide row end"><Btn kind="danger" busy={busy} disabled={!ready} onClick={reset}>Reset database</Btn></div>
    </div>
  );
}
