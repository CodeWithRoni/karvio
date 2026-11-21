import { roundDecimal } from './round';
import { splitList } from './format';

export const DEFAULT_WHATSAPP = 'Assalamu Alaikum {name},\nThank you for shopping at {shop}.\nInvoice: {invoice}\nTotal: Tk {total} · Paid: Tk {paid} · Due: Tk {due}\nView / download your invoice:\n{link}\n{shop_phone}';
const lakh = (v) => (roundDecimal(v, 2)).toLocaleString('en-IN', { maximumFractionDigits: 2 });

/** A Bangladeshi mobile number in the form WhatsApp wants (8801XXXXXXXXX); '' when it is not a usable number. */
export function waNumber(phone) {
  const d = String(phone || '').replace(/[^0-9]/g, '');
  if (/^8801\d{9}$/.test(d)) return d;
  if (/^01\d{9}$/.test(d)) return '88' + d;
  if (/^1\d{9}$/.test(d)) return '880' + d;
  return d.length >= 10 && !d.startsWith('0') ? d : '';
}
export const waUrl = (phone, text) => `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;
export const firstPhone = (phones) => splitList(phones || '')[0] || '';

/** The invoice message for a customer, from the wording in Settings. */
export function invoiceMessage(settings, sale, customer, link) {
  const tpl = settings.whatsapp_template || DEFAULT_WHATSAPP;
  // Due is what is still owed now; Paid is the rest of the total (at the sale, advance used and collected later), so the two add up.
  const due = Math.max(roundDecimal(Number(sale.due_now ?? sale.due) || 0, 2), 0);
  const vars = { name: customer?.name || sale.customer_name || '', shop: settings.shop_name || '', invoice: sale.invoice_no, total: lakh(sale.total), paid: lakh(Math.max((Number(sale.total) || 0) - due, 0)),
    due: lakh(due), link: link || '', shop_phone: firstPhone(settings.shop_phone || settings.shop_tel) };
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)).replace(/\n{3,}/g, '\n\n').trim();
}
