import { round2 } from './format';
// Match purchaseCreate_'s cumulative currency allocation of the invoice discount.
export function purchasePricing(lines, discount) {
  const gross = lines.map(l => round2((Number(l.qty) || 0) * (Number(l.cost) || 0)));
  const subtotal = round2(gross.reduce((a,b) => a+b,0));
  const d = Number(discount == null || discount === '' ? 0 : discount);
  const error = !Number.isFinite(d) || d < 0 || d > subtotal ? 'Purchase discount must be between 0 and the subtotal.' : '';
  const total = error ? 0 : round2(subtotal-d);
  let through=0,allocated=0;
  const lineCosts=gross.map(amount=>{through+=amount;const next=subtotal>0?round2(total*through/subtotal):0;const cost=round2(next-allocated);allocated=next;return cost;});
  return {subtotal,total,discount:d,error,valid:!error,lineCosts};
}
