import { api } from './api';
// Keep every selected invoice while respecting the server's per-request bound.
export async function salesDetails(rows) {
  const result = [];
  for (let i = 0; i < rows.length; i += 200) {
    const ids = rows.slice(i, i + 200).map((r) => r.id);
    const batch = await api('sales.details', { ids });
    if (!Array.isArray(batch) || batch.length !== ids.length || batch.some((d, j) => d.sale?.id !== ids[j]))
      throw new Error('The server returned incomplete invoices. No export was created.');
    result.push(...batch);
  }
  return result;
}
