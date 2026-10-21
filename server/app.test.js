import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { openDb } from './db.js';
import { createApp } from './app.js';

let server, base;
before(async () => {
  const app = createApp(openDb(':memory:'));
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.closeAllConnections(); server.close(); });

/** Minimal client that keeps one session cookie, like a browser tab. */
function client() {
  let cookie = '';
  return async (method, url, body) => {
    const opts = { method, headers: { cookie } };
    if (body instanceof FormData) opts.body = body;
    else if (body) { opts.body = JSON.stringify(body); opts.headers['content-type'] = 'application/json'; }
    const res = await fetch(base + url, opts);
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json() };
  };
}

/** Builds an .xlsx in the collection template: B contract, C client, Q, R, X employee. */
async function workbook(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Лист1');
  ws.addRow(Array.from({ length: 24 }, (_, i) => `H${i}`));
  for (const r of rows) {
    const cells = Array(24).fill('');
    cells[1] = r.contract; cells[2] = r.client; cells[16] = r.q; cells[17] = r.r;
    const row = ws.addRow(cells);
    // Column X comes from a VLOOKUP in the real files; only its cached result is usable.
    row.getCell(24).value = r.formula ? { formula: 'VLOOKUP(U2,[1]Hudud!A:B,2,0)', result: r.emp } : r.emp;
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function form(buf, fields) {
  const fd = new FormData();
  fd.append('file', new Blob([buf]), 'portfel.xlsx');
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

const admin = client();
const xodim = client();
let rowsOfUpdate, updateId;

test('first run creates the admin, then setup is closed', async () => {
  assert.equal((await admin('GET', '/api/auth/state')).body.needsSetup, true);
  const r = await admin('POST', '/api/auth/setup', { first_name: 'Rustam', last_name: 'Aliyev', login: 'rahbar', password: 'secret123' });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.role, 'admin');
  assert.equal((await client()('POST', '/api/auth/setup', { first_name: 'X', last_name: 'Y', login: 'boshqa', password: 'secret123' })).status, 409);
  assert.equal((await client()('POST', '/api/auth/login', { login: 'rahbar', password: 'notogri' })).status, 401);
});

test('admin adds an employee who can log in', async () => {
  const r = await admin('POST', '/api/users', { first_name: 'Muhammadqodir', last_name: 'Zokirov', login: 'zokirov', password: 'parol123', role: 'xodim' });
  assert.equal(r.status, 200);
  assert.equal((await admin('POST', '/api/users', { first_name: 'A', last_name: 'B', login: 'zokirov', password: 'parol123', role: 'xodim' })).status, 400);
  assert.equal((await xodim('POST', '/api/auth/login', { login: 'zokirov', password: 'parol123' })).status, 200);
  assert.equal((await xodim('GET', '/api/uploads')).status, 403);
});

test('baseline upload assigns clients by column X', async () => {
  const buf = await workbook([
    { contract: 'HN1', client: 'EGAMOV F', q: 1_000_000, r: 5_000_000, emp: "Zokirov Muhammadqodir Ulug‘bek o'g'li", formula: true },
    { contract: 'HN2', client: 'MATBOBOYEV A', q: 2_000_000, r: 4_000_000, emp: "Zokirov  Muhammadqodir Ulug'bek o'g'li" },
    { contract: 'HN3', client: 'IBRAGIMOV D', q: 3_000_000, r: 9_000_000, emp: "Raximov Otabek Iqboljon o'g'li" },
  ]);
  const r = await admin('POST', '/api/uploads', form(buf, { period: '2026-10' }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.upload.kind, 'baseline');
  assert.equal(r.body.matched, 2);
  assert.deepEqual(r.body.unmatched, [{ name: "Raximov Otabek Iqboljon o'g'li", count: 1 }]);
});

test('update upload: R drops are payments, Q = 0 or a missing contract means 100% paid', async () => {
  const buf = await workbook([
    { contract: 'HN1', client: 'EGAMOV F', q: 0, r: 4_000_000, emp: "Zokirov Muhammadqodir Ulug'bek o'g'li" },
    { contract: 'HN3', client: 'IBRAGIMOV D', q: 3_000_000, r: 9_000_000, emp: "Raximov Otabek Iqboljon o'g'li" },
  ]);
  const up = await admin('POST', '/api/uploads', form(buf, { period: '2026-10' }));
  assert.equal(up.body.upload.kind, 'update');
  updateId = up.body.upload.id;

  const d = (await admin('GET', '/api/dashboard?period=2026-10')).body;
  assert.deepEqual(d.cards, {
    startSum: 18_000_000, startCount: 3,
    currentSum: 9_000_000, currentCount: 1,
    returnedSum: 9_000_000, returnedCount: 2,
    paidSum: 1_000_000 + 2_000_000,
  });
  assert.equal(d.charts.months.at(-1).amount, 3_000_000);
  assert.equal(d.charts.hours.reduce((a, b) => a + b, 0), 3_000_000);

  const mine = (await xodim('GET', '/api/dashboard?period=2026-10')).body.cards;
  assert.equal(mine.startCount, 2);
  assert.equal(mine.returnedCount, 2);
  assert.equal((await xodim('GET', '/api/clients?period=2026-10')).body.clients.length, 2);
});

test('editing and deleting rows inside a file recalculates the portfolio', async () => {
  rowsOfUpdate = (await admin('GET', `/api/uploads/${updateId}/rows`)).body.rows;
  const hn3 = rowsOfUpdate.find((r) => r.cells[1] === 'HN3');
  assert.equal(hn3.matched, false);

  const e = await admin('PATCH', `/api/rows/${hn3.id}`, { col: 16, value: '0' });
  assert.equal(e.body.row.cells[16], 0);
  let cards = (await admin('GET', '/api/dashboard?period=2026-10')).body.cards;
  assert.equal(cards.returnedCount, 3);
  assert.equal(cards.currentCount, 0);

  await admin('PATCH', `/api/rows/${hn3.id}`, { col: 16, value: '3 000 000' });
  await admin('DELETE', `/api/rows/${hn3.id}`);
  cards = (await admin('GET', '/api/dashboard?period=2026-10')).body.cards;
  assert.equal(cards.returnedCount, 3, 'a row deleted from the update counts as gone from the file');

  await admin('DELETE', `/api/uploads/${updateId}`);
  cards = (await admin('GET', '/api/dashboard?period=2026-10')).body.cards;
  assert.equal(cards.returnedCount, 0);
  assert.equal(cards.currentCount, 3);
  assert.equal(cards.paidSum, 0);
});

test('a non-template file is rejected with a readable message', async () => {
  const r = await admin('POST', '/api/uploads', form(Buffer.from('salom'), { period: '2026-10' }));
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Excel/);
});

test('the last admin cannot be removed', async () => {
  const users = (await admin('GET', '/api/users')).body.users;
  const me = users.find((u) => u.login === 'rahbar');
  assert.equal((await admin('DELETE', `/api/users/${me.id}`)).status, 400);
  assert.equal(users.find((u) => u.login === 'zokirov').clients, 2);
});
