import { userKeys } from './excel.js';
import { daysInPeriod, localParts, replayPeriod } from './stats.js';

export const STATUSES = ['muhlat', 'boglanmadi', 'uchinchi', 'telegram', 'sms', 'muammoli', 'tolandi'];
const EPS = 0.5;

const zeroStatuses = () => Object.fromEntries(STATUSES.map((s) => [s, 0]));

/**
 * Employees' results for the "Xodimlar" view.
 *
 * scope 'today': today's conversations and today's payments/exits (Tashkent time), by hour.
 * scope 'all':   the whole month `period`, by day.
 * A client talked to several times counts once, under its latest status in the range.
 */
export function teamReport(db, { scope, period, now = new Date() }) {
  const today = localParts(now.toISOString());
  if (scope === 'today') period = today.period;
  const inRange = (iso) => {
    const t = localParts(iso);
    return scope === 'today' ? t.date === today.date : t.period === period;
  };
  const bucket = (iso) => (scope === 'today' ? localParts(iso).hour : localParts(iso).day - 1);
  const buckets = scope === 'today' ? 24 : daysInPeriod(period);

  const employees = db.prepare("SELECT id, first_name, last_name FROM users WHERE role = 'xodim' ORDER BY last_name, first_name").all();
  const { state, payments, exits } = replayPeriod(db, period);

  // Contacts are stored in UTC; widen the SQL window by a day on both sides and filter in local time.
  const [y, m] = period.split('-').map(Number);
  const from = new Date(Date.UTC(y, m - 1, 0)).toISOString();
  const to = new Date(Date.UTC(y, m, 2)).toISOString();
  const contacts = db.prepare('SELECT user_id, contract, status, created_at FROM contacts WHERE created_at >= ? AND created_at < ? ORDER BY created_at')
    .all(from, to).filter((c) => inRange(c.created_at));

  const series = () => ({ payments: Array(buckets).fill(0), exits: Array(buckets).fill(0) });
  const total = { talked: 0, statuses: zeroStatuses(), series: series() };

  const rows = employees.map((e) => {
    const keys = userKeys(e);
    const latest = new Map();
    for (const c of contacts) if (c.user_id === e.id) latest.set(c.contract, c.status);
    const statuses = zeroStatuses();
    for (const st of latest.values()) statuses[st]++;

    const mine = (x) => keys.has(x.empKey);
    const myExits = exits.filter((x) => mine(x) && inRange(x.at));
    const s = series();
    for (const p of payments) if (mine(p) && inRange(p.at)) s.payments[bucket(p.at)] += p.amount;
    for (const x of myExits) s.exits[bucket(x.at)]++;

    const active = [...state.values()].filter((c) => mine(c) && c.q > EPS);
    const row = {
      id: e.id,
      name: `${e.last_name} ${e.first_name}`,
      talked: latest.size,
      statuses,
      notTalked: active.filter((c) => !latest.has(c.contract)).length,
      assigned: [...state.values()].filter(mine).length,
      exitCount: myExits.length,
      exitQ: myExits.reduce((a, x) => a + x.q, 0),
      exitR: myExits.reduce((a, x) => a + x.baseR, 0),
      paid: s.payments.reduce((a, b) => a + b, 0),
      series: s,
    };

    total.talked += row.talked;
    for (const st of STATUSES) total.statuses[st] += statuses[st];
    s.payments.forEach((v, i) => { total.series.payments[i] += v; });
    s.exits.forEach((v, i) => { total.series.exits[i] += v; });
    return row;
  });

  return { scope, period, date: today.date, buckets, total, rows };
}
