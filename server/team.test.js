import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.js';
import { localParts } from './stats.js';
import { teamReport } from './team.js';

test('paying 100% removes a client from "not talked"; a client talked to and then paid stays "talked"', () => {
  const db = openDb(':memory:');
  const now = new Date();
  const period = localParts(now.toISOString()).period;
  const at = (min) => new Date(now.getTime() - min * 60_000).toISOString();
  const uid = db.prepare("INSERT INTO users (first_name, last_name, login, password_hash, role, created_at) VALUES ('Ali', 'Valiyev', 'ali', 'x', 'xodim', ?)")
    .run(at(0)).lastInsertRowid;

  const upload = (kind, minutesAgo, rows) => {
    const id = db.prepare("INSERT INTO uploads (filename, period, kind, headers, uploaded_at) VALUES ('f.xlsx', ?, ?, '[]', ?)")
      .run(period, kind, at(minutesAgo)).lastInsertRowid;
    rows.forEach(([contract, q, r], i) => db.prepare(`INSERT INTO rows (upload_id, row_no, contract, client, emp_name, emp_key, q, r, cells)
      VALUES (?, ?, ?, ?, 'Valiyev Ali', 'valiyev ali', ?, ?, '[]')`).run(id, i + 2, contract, contract, q, r));
  };
  upload('baseline', 30, [['C1', 100, 500], ['C2', 200, 600], ['C3', 300, 700]]);
  db.prepare('INSERT INTO notes (contract, user_id, text, created_at) VALUES (?, ?, ?, ?)').run('C3', uid, "To'laydi", at(20));
  upload('update', 10, [['C1', 100, 500], ['C2', 0, 400], ['C3', 0, 400]]);

  const row = teamReport(db, { scope: 'today', period, now }).rows[0];
  assert.equal(row.talked, 1, 'C3 had a note; paying does not remove it from talked');
  assert.equal(row.notTalked, 1, 'only C1: C2 paid in full without a note, so it is not counted');
  assert.equal(row.exitCount, 2);
  assert.equal(row.exitQ, 200 + 300);
});
