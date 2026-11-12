import { api } from './api';
// Bounded requests preserve every selected party, or fail before creating an export.
export async function partyStatements(action, ids) {
  const result = [];
  for (let i = 0; i < ids.length; i += 300) {
    const selected = ids.slice(i, i + 300);
    const batch = await api(action, { ids: selected });
    if (!Array.isArray(batch) || batch.length !== selected.length || batch.some((d, j) => d.info?.id !== selected[j]))
      throw new Error('The server returned incomplete statements. No export was created.');
    result.push(...batch);
  }
  return result;
}
