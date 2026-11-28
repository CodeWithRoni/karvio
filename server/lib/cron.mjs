// The five-field cron schedules Karvio's migrations register (minute hour day month weekday, in UTC),
// matched by the server in place of pg_cron. Supports *, numbers, ranges a-b, lists a,b and steps */n or a-b/n.
const LIMITS = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];

function field(text, [min, max]) {
  const set = new Set();
  for (const part of text.split(',')) {
    const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part.trim());
    if (!m) throw new Error(`Invalid cron field "${text}"`);
    let [lo, hi] = m[1] === '*' ? [min, max] : m[1].split('-').map(Number);
    if (hi === undefined) hi = m[2] ? max : lo;
    const step = m[2] ? Number(m[2]) : 1;
    if (lo < min || hi > max || lo > hi || step < 1) throw new Error(`Invalid cron field "${text}"`);
    for (let v = lo; v <= hi; v += step) set.add(v);
  }
  return set;
}

/** Parse "*\/5 11-17 * * *" once; the result's matches(date) checks one UTC minute. */
export function parseCron(expr) {
  const parts = String(expr).trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Invalid cron schedule "${expr}"`);
  const [minute, hour, day, month, weekday] = parts.map((p, i) => field(p, LIMITS[i]));
  if (weekday.has(7)) weekday.add(0);
  const anyDay = parts[2] === '*', anyWeekday = parts[4] === '*';
  return {
    matches(date) {
      if (!minute.has(date.getUTCMinutes()) || !hour.has(date.getUTCHours()) || !month.has(date.getUTCMonth() + 1)) return false;
      const d = day.has(date.getUTCDate()), w = weekday.has(date.getUTCDay());
      // As in cron: when both day-of-month and weekday are restricted, either one may match.
      return anyDay && anyWeekday ? true : anyDay ? w : anyWeekday ? d : d || w;
    },
  };
}
