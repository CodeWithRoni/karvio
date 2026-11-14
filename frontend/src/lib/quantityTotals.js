// Quantities with different physical units must never be added together.
export function quantityTotal(rows, key = 'qty') {
  const units = {};
  rows.forEach(row => {
    const values = key === 'item_quantities' ? row.item_quantities || {} : { [row.unit || 'pcs']: Number(row[key]) || 0 };
    Object.entries(values).forEach(([unit, value]) => { units[unit] = (units[unit] || 0) + (Number(value) || 0); });
  });
  return Object.keys(units).sort().map(unit => (Math.round((units[unit] + Number.EPSILON) * 10000) / 10000) + ' ' + unit).join(' · ');
}
