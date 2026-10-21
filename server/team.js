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
 *
 * - Statuses: each client counts once, under the latest status the employee set in the range.
 * - Talked: a client counts once if the employee wrote at least one note in the range
 *   (ten notes in a day are still one conversation). A status without a note is not a conversation.
 * - Not talked: the employee's unpaid clients without a note in the range.
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

  // Stored in UTC; widen the SQL window by a day on both sides and filter in local time.
  const [y, m] = period.split('-').map(Number);
  const from = new Date(Date.UTC(y, m - 1, 0)).toISOString();
  const to = new Date(Date.UTC(y, m, 2)).toISOString();
  const inWindow = (table, cols) => db.prepare(`SELECT ${cols} FROM ${table} WHERE created_at >= ? AND created_at < ? ORDER BY id`)
    .all(from, to).filter((x) => inRange(x.created_at));
  const statusLog = inWindow('status_log', 'user_id, contract, status, created_at');
  const notes = inWindow('notes', 'user_id, contract, created_at');

  const series = () => ({ payments: Array(buckets).fill(0), exits: Array(buckets).fill(0) });
  const total = { talked: 0, statuses: zeroStatuses(), series: series() };

  const rows = employees.map((e) => {
    const keys = userKeys(e);
    const latest = new Map();
    for (const c of statusLog) if (c.user_id === e.id) latest.set(c.contract, c.status);
    const statuses = zeroStatuses();
    for (const st of latest.values()) statuses[st]++;
    const talked = new Set(notes.filter((n) => n.user_id === e.id).map((n) => n.contract));

    const mine = (x) => keys.has(x.empKey);
    const myExits = exits.filter((x) => mine(x) && inRange(x.at));
    const s = series();
    for (const p of payments) if (mine(p) && inRange(p.at)) s.payments[bucket(p.at)] += p.amount;
    for (const x of myExits) s.exits[bucket(x.at)]++;

    const active = [...state.values()].filter((c) => mine(c) && c.q > EPS);
    const row = {
      id: e.id,
      name: `${e.last_name} ${e.first_name}`,
      talked: talked.size,
      statuses,
      notTalked: active.filter((c) => !talked.has(c.contract)).length,
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
