import { COL } from './excel.js';

const EPS = 0.5; // amounts below half a so'm are rounding noise
export const TIME_ZONE = process.env.TZ_NAME || 'Asia/Tashkent';

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
});

/** Local (Tashkent) calendar parts of an ISO timestamp. */
export function localParts(iso) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { period: `${p.year}-${p.month}`, date: `${p.year}-${p.month}-${p.day}`, day: Number(p.day), hour: Number(p.hour) };
}

export function shiftPeriod(period, delta) {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function daysInPeriod(period) {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Replays a month's uploads in order and returns each contract's state plus the payments between files.
 *
 * - The latest 'baseline' upload is the start-of-month portfolio; anything uploaded before it is ignored.
 *   With no baseline the first upload of the month plays that role.
 * - A payment is a drop in R (total unpaid) between two consecutive files.
 * - A contract that disappears from a later file is treated as having paid its overdue (Q) in full.
 * - An exit is a contract whose Q fell to zero (100% paid): it leaves the overdue portfolio.
 */
export function replayPeriod(db, period) {
  const all = db.prepare('SELECT id, kind, uploaded_at FROM uploads WHERE period = ? ORDER BY uploaded_at, id').all(period);
  const baseIdx = all.map((u) => u.kind).lastIndexOf('baseline');
  const uploads = all.slice(Math.max(baseIdx, 0));
  const state = new Map();
  const payments = [];
  const exits = new Map();
  if (!uploads.length) return { uploads, state, payments, exits };
  const exit = (s, at, empKey) => exits.set(s.contract, { at, contract: s.contract, empKey, q: s.q, baseR: s.baseR });

  const rowsStmt = db.prepare('SELECT id, contract, emp_key, q, r FROM rows WHERE upload_id = ? ORDER BY row_no');
  uploads.forEach((u, i) => {
    // A contract listed twice in one file is summed into one entry.
    const cur = new Map();
    for (const row of rowsStmt.all(u.id)) {
      const key = row.contract || `#${row.id}`;
      const prev = cur.get(key);
      cur.set(key, prev ? { ...prev, q: prev.q + row.q, r: prev.r + row.r } : { ...row });
    }

    for (const [contract, row] of cur) {
      const s = state.get(contract);
      if (!s) {
        state.set(contract, {
          contract, rowId: row.id, empKey: row.emp_key, q: row.q, r: row.r,
          baseQ: row.q, baseR: row.r, inBaseline: i === 0, closed: false,
        });
        continue;
      }
      if (s.r - row.r > EPS) payments.push({ at: u.uploaded_at, amount: s.r - row.r, contract, empKey: row.emp_key });
      if (row.q > EPS) exits.delete(contract);
      else if (s.q > EPS) exit(s, u.uploaded_at, row.emp_key);
      Object.assign(s, { rowId: row.id, empKey: row.emp_key, q: row.q, r: row.r, closed: false });
    }

    if (i === 0) return;
    for (const s of state.values()) {
      if (cur.has(s.contract) || s.closed) continue;
      if (s.q > EPS) {
        payments.push({ at: u.uploaded_at, amount: s.q, contract: s.contract, empKey: s.empKey });
        exit(s, u.uploaded_at, s.empKey);
      }
      s.r = Math.max(0, s.r - s.q);
      s.q = 0;
      s.closed = true;
    }
  });
  return { uploads, state, payments, exits: [...exits.values()] };
}

const owned = (keys) => (x) => !keys || keys.has(x.empKey);

export function dashboard(db, period, keys = null) {
  const { uploads, state, payments: allPayments } = replayPeriod(db, period);
  const contracts = [...state.values()].filter(owned(keys));
  const payments = allPayments.filter(owned(keys));

  const start = contracts.filter((c) => c.inBaseline);
  const current = contracts.filter((c) => c.q > EPS);
  const returned = start.filter((c) => c.baseQ > EPS && c.q <= EPS);
  const sum = (list, f) => list.reduce((s, x) => s + f(x), 0);

  const days = Array(daysInPeriod(period)).fill(0);
  const hours = Array(24).fill(0);
  for (const p of payments) {
    const t = localParts(p.at);
    if (t.period === period) days[t.day - 1] += p.amount;
    hours[t.hour] += p.amount;
  }

  const months = [];
  for (let d = -11; d <= 0; d++) {
    const per = shiftPeriod(period, d);
    const amount = d === 0
      ? sum(payments, (p) => p.amount)
      : sum(replayPeriod(db, per).payments.filter(owned(keys)), (p) => p.amount);
    months.push({ period: per, amount });
  }

  return {
    period,
    uploads: uploads.length,
    lastUploadAt: uploads.at(-1)?.uploaded_at ?? null,
    cards: {
      startSum: sum(start, (c) => c.baseR),
      startCount: start.length,
      currentSum: sum(current, (c) => c.r),
      currentCount: current.length,
      returnedSum: sum(returned, (c) => c.baseR),
      returnedCount: returned.length,
      paidSum: sum(payments, (p) => p.amount),
    },
    charts: { days, hours, months },
  };
}

/** Clients of a period in their latest known state, for the employee's list. */
export function clientList(db, period, keys) {
  const { state } = replayPeriod(db, period);
  const cellsStmt = db.prepare('SELECT cells FROM rows WHERE id = ?');
  return [...state.values()].filter(owned(keys)).map((s) => {
    const cells = JSON.parse(cellsStmt.get(s.rowId)?.cells ?? '[]');
    return {
      contract: s.contract,
      client: cells[COL.client] ?? '',
      phone: String(cells[COL.phone] ?? ''),
      overdueDays: cells[COL.overdueDays] ?? '',
      baseQ: s.baseQ, baseR: s.baseR, q: s.q, r: s.r,
      paid: s.q <= EPS,
      closed: s.closed,
    };
  }).sort((a, b) => Number(a.paid) - Number(b.paid) || b.q - a.q);
}
