import { esc } from './export';

export function deliveryChallanHtml({ order, items, settings, booking, date, bookedBy }) {
  const name = settings.shop_name || 'Karvio';
  const address = settings.shop_address || '';
  const customer = order.customer || {};
  const party = (label, partyName, partyAddress, phone) => `
    <section><h3>${label}</h3><div class="party-body"><b>${esc(partyName)}</b>
    <div>${esc(partyAddress)}</div><div>${esc(phone)}</div></div></section>`;
  const box = (type, label) => `<span><i>${booking === type ? '&#10003;' : ''}</i>${label}</span>`;

  return `<style>
    @page { size: A4; margin: 12mm; }
    body { margin: 8px; background: white; color: #111; font: 14px Arial, 'Hind Siliguri', sans-serif; }
    .challan { max-width: 720px; margin: 0 auto; border: 1px solid #101827; padding: 16px; overflow-wrap: anywhere; }
    header { text-align: center; border-bottom: 1px solid #101827; padding-bottom: 10px; }
    h1 { margin: 0 0 5px; font-size: clamp(22px, 5vw, 34px); }
    h2 { width: fit-content; margin: 14px auto 8px; padding: 6px 16px; text-align: center; background: #0b1b30; color: white; font-size: 21px; }
    .ref { text-align: center; margin-bottom: 14px; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 18px; }
    section { border: 1px solid #101827; border-radius: 4px; overflow: hidden; }
    h3 { margin: 0; padding: 5px 8px; background: #e2e5eb; font-size: 14px; }
    .party-body { padding: 7px 8px; line-height: 1.4; }
    .party-body b { font-size: 16px; }
    table { border-collapse: collapse; width: 100%; table-layout: fixed; }
    th, td { border: 1px solid #101827; padding: 7px 5px; }
    th { background: #0b1b30; color: white; }
    td:first-child, td:last-child { text-align: center; }
    tr, section { break-inside: avoid; }
    .details { break-inside: avoid; }
    .meta, .booking { display: flex; flex-wrap: wrap; gap: 8px 16px; margin-top: 14px; padding: 8px; background: #e2e5eb; border-radius: 4px; }
    .meta span { flex: 1 1 130px; }
    .booking span { display: inline-flex; align-items: center; gap: 5px; }
    .booking i { display: inline-grid; place-items: center; border: 1px solid #101827; width: 14px; height: 14px; font-style: normal; }
    footer { display: flex; justify-content: space-between; align-items: start; gap: 12px; margin-top: 48px; font-size: 12px; }
    .signature { border-top: 1px solid #101827; padding-top: 3px; width: 28%; text-align: center; }
    * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  </style>
  <article class="challan">
    <header><h1>${esc(name)}</h1><div>${esc(address)}</div></header>
    <h2>DELIVERY CHALLAN</h2>
    <div class="ref">Order ${esc(order.no)}${order.invoice_no ? ` · Invoice ${esc(order.invoice_no)}` : ''}</div>
    <div class="parties">
      ${party('From', name, address, settings.shop_phone || settings.shop_tel)}
      ${party('To', customer.name, [customer.address, customer.area].filter(Boolean).join(', '), customer.phone)}
    </div>
    <table>
      <colgroup><col style="width:9%"><col style="width:46%"><col style="width:32%"><col style="width:13%"></colgroup>
      <thead><tr><th>SL</th><th>Product Information</th><th>Serial Number (SN)</th><th>Qty</th></tr></thead>
      <tbody>${items.map((item, index) => `<tr><td>${index + 1}</td><td>${esc(item.name)}</td><td>${esc(item.serials || '—')}</td><td>${esc(item.qty)}</td></tr>`).join('')}</tbody>
    </table>
    <div class="details">
      <div class="meta">
        <span>Courier: <b>${esc(order.courier?.label || order.courier_label || '—')}</b></span>
        <span>Booking by: <b>${esc(bookedBy || '—')}</b></span>
        ${order.courier?.tracking ? `<span>Tracking: <b>${esc(order.courier.tracking)}</b></span>` : ''}
      </div>
      <div class="booking"><b>Booking Type</b>${box('cash', 'Cash Booking')}${box('due', 'Due Booking')}</div>
      <footer><div class="signature">Prepared By</div><div class="signature">Received By</div><div>Date: ${esc(date || '________')}</div></footer>
    </div>
  </article>`;
}
