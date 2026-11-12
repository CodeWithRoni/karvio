// Keep different selling units separate; services have no physical inventory.
export function stockQuantityTotal(rows, key) {
  const units = new Map();
  for (const row of rows) {
    if (row.service) continue;
    const unit = row.unit || 'pcs';
    units.set(unit, (units.get(unit) || 0) + (Number(row[key]) || 0));
  }
  if (units.size === 1 && units.has('pcs')) return units.get('pcs');
  return [...units].map(([unit, n]) => n.toLocaleString('en-IN', { maximumFractionDigits: 4 }) + ' ' + unit).join(' · ') || 0;
}
export function stockMoneyTotal(rows, priceKey) {
  return rows.reduce((sum, row) => sum + (row.service ? 0 : (Number(row.stock) || 0) * (Number(row[priceKey]) || 0)), 0);
}
