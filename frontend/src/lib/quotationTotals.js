import { round2 } from './format';
// A unit rate may contain fractions of a paisa; only the extended amount is currency-rounded.
export const quotationPrice = n => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 20 });
export function quotationTotals(lines, discount) {
  const d = Number(discount || 0);
  const validLines = lines.every(l => Number.isFinite(Number(l.qty)) && Number(l.qty) > 0 && Number.isFinite(Number(l.price)) && Number(l.price) >= 0);
  const subtotal = round2(lines.reduce((n, l) => n + round2(Number(l.qty) * Number(l.price)), 0));
  const error = !validLines || !Number.isFinite(subtotal) ? 'Enter a valid quantity and price for each part.'
    : !Number.isFinite(d) || d < 0 || d > subtotal ? 'Discount must be between 0 and the subtotal.' : '';
  return { subtotal, discount: d, total: error ? null : round2(subtotal - d), error, valid: !error };
}
