import { useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { firstPhone, invoiceMessage, waUrl } from '../lib/whatsapp';
import { Btn } from './ui';

/**
 * Opens WhatsApp with the customer's number and the invoice message (with the customer link) filled in;
 * the person only presses Send. No WhatsApp API is used. `data` is a sale detail ({ sale, customer }).
 */
export default function WhatsAppBtn({ data, link, onLink, size }) {
  const [busy, setBusy] = useState(false);
  const toast = useStore((s) => s.toast);
  const s = data?.sale;
  if (!s || !s.customer_id || s.status === 'cancelled') return null;
  const send = async () => {
    // The tab is opened first: a tab opened after waiting for the server is blocked as a pop-up.
    const win = window.open('', '_blank');
    setBusy(true);
    try {
      const l = link || await api('sale.link', { id: s.id });
      onLink?.(l);
      const url = waUrl(firstPhone(data.customer?.phones), invoiceMessage(useStore.getState().settings, s, data.customer, l.url));
      if (win) { try { win.opener = null; } catch { /* not needed */ } win.location.href = url; } else window.location.href = url;
    } catch (e) { win?.close(); toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return <Btn className="btn-wa" size={size} busy={busy} onClick={send} title="Opens WhatsApp with this customer's number and the invoice link filled in. You press Send.">Send on WhatsApp</Btn>;
}
