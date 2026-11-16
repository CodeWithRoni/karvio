import { useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { money, splitList } from '../lib/format';
import { Modal, Btn } from './ui';
import { waNumber, waUrl } from '../lib/whatsapp';

export const DEFAULT_DUE_SMS = 'Dear {name}, your due at {shop} is Tk {due}. Please pay at your earliest convenience. Thank you. {shop_phone}';
const lakh = (v) => (Math.round((Number(v) || 0) * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
/** SMS parts: 160 letters per SMS (153 when split); Bangla letters count 70 (67 when split). */
const parts = (t) => { const uni = /[^\x00-\x7F]/.test(t), one = uni ? 70 : 160, many = uni ? 67 : 153; return t.length <= one ? 1 : Math.ceil(t.length / many); };

/** Due reminder SMS to the ticked customers, with each customer's own message shown before sending. */
export default function DueReminder({ customers, onClose }) {
  const settings = useStore((s) => s.settings);
  const [tpl, setTpl] = useState(settings.sms_due_template || DEFAULT_DUE_SMS);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const shopPhone = splitList(settings.shop_phone || settings.shop_tel || '')[0] || '';
  const rows = customers.map((c) => {
    const phone = splitList(c.phones || '')[0] || '', due = Number(c.balance) || 0;
    const why = due <= 0.004 ? 'nothing due' : !phone ? 'no phone number' : '';
    return { ...c, phone, due, why, text: why ? '' : fill(tpl, { name: c.name, due: lakh(due), shop: settings.shop_name || '', shop_phone: shopPhone }) };
  });
  const ready = rows.filter((r) => !r.why), smsOff = settings.sms_enabled !== 'true';
  const send = async () => {
    setBusy(true);
    try {
      const r = await api('customer.remind', { ids: ready.map((x) => x.id), template: tpl.trim() });
      useStore.setState((st) => ({ settings: { ...st.settings, sms_due_template: tpl.trim() } }));
      setDone(r);
      useStore.getState().toast(`Due reminder sent to ${r.sent} customer${r.sent === 1 ? '' : 's'}${r.failed ? `, ${r.failed} failed` : ''}`, r.failed ? 'err' : 'ok');
    } catch (e) { useStore.getState().toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const status = (id) => done?.results.find((x) => x.id === id);
  const title = `Send due reminder — ${ready.length} customer${ready.length === 1 ? '' : 's'}`;

  return (
    <Modal open size="md" title={title} onClose={onClose}
      footer={done ? <Btn kind="primary" onClick={onClose}>Done</Btn> : <><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!ready.length || !tpl.trim() || smsOff} onClick={send}>Send {ready.length} SMS</Btn></>}>
      {smsOff && <div className="note remind-off" role="alert">The SMS gateway is off. Turn it on in Settings → SMS to send reminders.</div>}
      <label className="field">
        <span className="field-label">Message</span>
        <textarea rows={3} value={tpl} maxLength={480} disabled={!!done} onChange={(e) => setTpl(e.target.value)} aria-label="Reminder message" />
        <span className="field-hint">{'{name}'}, {'{due}'}, {'{shop}'} and {'{shop_phone}'} fill in for each customer{ready[0] ? ` · about ${parts(ready[0].text)} SMS each` : ''}{tpl !== DEFAULT_DUE_SMS && !done && <> · <button type="button" className="link" onClick={() => setTpl(DEFAULT_DUE_SMS)}>Use the standard message</button></>}</span>
      </label>
      <div className="remind-head">Preview</div>
      <div className="remind-list">
        {rows.map((r) => {
          const s = status(r.id);
          return (
            <div key={r.id} className={`remind-row ${r.why ? 'skip' : ''}`}>
              <div className="remind-top"><b>{r.name}</b>
                <span className="muted">{r.phone || 'no phone'} · due <b className="remind-due">{money(r.due)}</b>
                  {s && <span className={`badge ${s.status === 'failed' ? 'badge-bad' : s.status === 'skipped' ? 'badge-muted' : 'badge-ok'}`}>{s.status === 'skipped' ? 'skipped' : s.status === 'failed' ? 'failed' : 'sent'}</span>}
                </span>
              </div>
              <div className="remind-text">{r.why ? `Skipped — ${r.why}.` : r.text}</div>
              {!r.why && waNumber(r.phone) && <a className="remind-wa" href={waUrl(r.phone, r.text)} target="_blank" rel="noreferrer">Send this one on WhatsApp instead</a>}
            </div>
          );
        })}
      </div>
      <div className="muted remind-foot">Customers with nothing due or without a phone number are skipped. Each send is written to the SMS log and the activity log.</div>
    </Modal>
  );
}
