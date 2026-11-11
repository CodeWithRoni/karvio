import { api } from './api';
// Respect the server bound without silently dropping any selected document.
export async function purchaseDetails(ids) {
  const result = [];
  for (let i = 0; i < ids.length; i += 200) {
    const batchIds = ids.slice(i, i + 200);
    const batch = await api('purchases.details', { ids: batchIds });
    if (!Array.isArray(batch) || batch.length !== batchIds.length || batch.some((d, j) => d.purchase?.id !== batchIds[j]))
      throw new Error('The server returned incomplete purchases. No export was created.');
    result.push(...batch);
  }
  return result;
}
