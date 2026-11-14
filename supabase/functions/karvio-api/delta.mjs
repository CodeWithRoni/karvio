// Only changed records cross the database boundary. Legacy runtime rows remain
// available to the business engine until its action-specific query migration.
export function tableDeltas(snapshot, changes) {
  const result = {};
  for (const [table, records] of Object.entries(changes)) {
    const key = table === 'Settings' ? 'key' : 'id';
    const before = new Map((snapshot.tables[table] || []).map(row => [row[key], row]));
    const upsert = [];
    for (const row of records) {
      const previous = before.get(row[key]);
      if (!previous || Object.keys(row).some(k => row[k] !== previous[k])) upsert.push(row);
      before.delete(row[key]);
    }
    const remove = [...before.keys()];
    if (upsert.length || remove.length) result[table] = { upsert, remove };
  }
  return result;
}
