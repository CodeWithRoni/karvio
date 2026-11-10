import { round2 } from './format';

// Match the server's cumulative invoice-discount and partial-return allocations.
export function returnValue(sale, items, lines) {
  let gross = 0, allocated = 0, result = 0;
  items.forEach((item, index) => {
    gross += Number(item.total) || 0;
    const through = sale.subtotal > 0 ? round2(sale.total * gross / sale.subtotal) : 0;
    const net = item.net_total ?? round2(through - allocated);
    allocated = through;
    const quantity = Number(lines[index]?.qty) || 0;
    if (quantity <= 0) return;
    const returned = Number(item.returned_qty) || 0;
    const used = Number(item.returned_value) || 0;
    result += Math.max(0, round2(Math.min(net - used, round2(net * (returned + quantity) / item.qty) - used)));
  });
  return round2(result);
}
