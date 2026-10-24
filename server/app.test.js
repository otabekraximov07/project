import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { localParts } from './stats.js';

// Uploads are stamped with the current time, so test in the current month.
const PERIOD = localParts(new Date().toISOString()).period;

let server, base;
before(async () => {
  const app = createApp(openDb(':memory:'), { filesDir: fs.mkdtempSync(path.join(os.tmpdir(), 'undiruv-test-')) });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.closeAllConnections(); server.close(); });

/** Minimal client that keeps one session cookie, like a browser tab. */
function client() {
  let cookie = '';
  const call = async (method, url, body) => {
    const opts = { method, headers: { cookie } };
    if (body instanceof FormData) opts.body = body;
    else if (body) { opts.body = JSON.stringify(body); opts.headers['content-type'] = 'application/json'; }
    const res = await fetch(base + url, opts);
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json() };
  };
  call.cookie = () => cookie;
  return call;
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
  const r = await admin('POST', '/api/uploads', form(buf, { period: PERIOD }));
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
  const up = await admin('POST', '/api/uploads', form(buf, { period: PERIOD }));
  assert.equal(up.body.upload.kind, 'update');
  updateId = up.body.upload.id;

  const d = (await admin('GET', `/api/dashboard?period=${PERIOD}`)).body;
  assert.deepEqual(d.cards, {
    startSum: 18_000_000, startCount: 3,
    currentSum: 9_000_000, currentCount: 1,
    returnedSum: 9_000_000, returnedCount: 2,
    paidSum: 1_000_000 + 2_000_000,
  });
  assert.equal(d.charts.months.at(-1).amount, 3_000_000);
  assert.equal(d.charts.hours.reduce((a, b) => a + b, 0), 3_000_000);

  const mine = (await xodim('GET', `/api/dashboard?period=${PERIOD}`)).body.cards;
  assert.equal(mine.startCount, 2);
  assert.equal(mine.returnedCount, 2);
  assert.equal((await xodim('GET', `/api/clients?period=${PERIOD}`)).body.clients.length, 2);
});

test('employee sets statuses and writes notes; the team report counts them by the rules', async () => {
  const zokirov = (await admin('GET', '/api/users')).body.users.find((u) => u.login === 'zokirov');
  const put = (c, body) => xodim('PUT', `/api/clients/${c}/status`, body);
  const note = (c, text) => xodim('POST', `/api/clients/${c}/notes`, { text });

  // Couldn't reach, then reached and got a deadline: only the latest status counts.
  assert.equal((await put('HN2', { status: 'boglanmadi' })).status, 200);
  await note('HN2', 'Telefonga javob bermadi');
  await put('HN2', { status: 'muhlat' });
  await put('HN2', { status: 'muhlat', promiseDate: '2026-10-25' }); // picking the date is not a new status
  await note('HN2', "25-sanagacha to'laydi");
  await note('HN2', 'Yana bir izoh'); // several notes in a day are one conversation
  // A status without a note is reported but is not a conversation.
  await put('HN1', { status: 'tolandi' });

  assert.equal((await put('HN3', { status: 'sms' })).status, 403, "another employee's client");
  assert.equal((await put('HN2', { status: 'nimadir' })).status, 400);
  assert.equal((await note('HN2', '   ')).status, 400);

  const list = (await xodim('GET', `/api/clients?period=${PERIOD}`)).body.clients;
  const hn2 = list.find((c) => c.contract === 'HN2');
  assert.equal(hn2.status, 'muhlat');
  assert.equal(hn2.promiseDate, '2026-10-25');
  assert.equal(hn2.note.text, 'Yana bir izoh');
  assert.equal(hn2.paidSum, 2_000_000);

  const card = (await xodim('GET', '/api/clients/HN2')).body;
  assert.equal(card.notes.length, 3);
  assert.deepEqual(card.history.map((h) => [h.status, h.promiseDate]), [['muhlat', '2026-10-25'], ['boglanmadi', null]]);
  assert.equal(card.cells[2], 'MATBOBOYEV A');

  for (const scope of ['today', 'all']) {
    const r = await admin('GET', `/api/team?scope=${scope}&period=${PERIOD}`);
    assert.equal(r.status, 200);
    const row = r.body.rows.find((x) => x.id === zokirov.id);
    assert.equal(row.talked, 1);
    assert.equal(row.statuses.muhlat, 1);
    assert.equal(row.statuses.boglanmadi, 0);
    assert.equal(row.statuses.tolandi, 1);
    assert.equal(row.exitCount, 2, 'HN1 reached Q = 0 and HN2 left the file');
    assert.equal(row.exitQ, 1_000_000 + 2_000_000);
    assert.equal(row.exitR, 5_000_000 + 4_000_000);
    assert.equal(r.body.total.talked, 1);
    assert.equal(r.body.total.series.exits.reduce((a, b) => a + b, 0), 2);
  }
  assert.equal((await xodim('GET', '/api/team')).status, 403);
});

test('editing and deleting rows inside a file recalculates the portfolio', async () => {
  rowsOfUpdate = (await admin('GET', `/api/uploads/${updateId}/rows`)).body.rows;
  const hn3 = rowsOfUpdate.find((r) => r.cells[1] === 'HN3');
  assert.equal(hn3.matched, false);

  const e = await admin('PATCH', `/api/rows/${hn3.id}`, { col: 16, value: '0' });
  assert.equal(e.body.row.cells[16], 0);
  let cards = (await admin('GET', `/api/dashboard?period=${PERIOD}`)).body.cards;
  assert.equal(cards.returnedCount, 3);
  assert.equal(cards.currentCount, 0);

  await admin('PATCH', `/api/rows/${hn3.id}`, { col: 16, value: '3 000 000' });
  await admin('DELETE', `/api/rows/${hn3.id}`);
  cards = (await admin('GET', `/api/dashboard?period=${PERIOD}`)).body.cards;
  assert.equal(cards.returnedCount, 3, 'a row deleted from the update counts as gone from the file');

  await admin('DELETE', `/api/uploads/${updateId}`);
  cards = (await admin('GET', `/api/dashboard?period=${PERIOD}`)).body.cards;
  assert.equal(cards.returnedCount, 0);
  assert.equal(cards.currentCount, 3);
  assert.equal(cards.paidSum, 0);
});

test('a non-template file is rejected with a readable message', async () => {
  const r = await admin('POST', '/api/uploads', form(Buffer.from('salom'), { period: PERIOD }));
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Excel/);
});

test('the last admin cannot be removed', async () => {
  const users = (await admin('GET', '/api/users')).body.users;
  const me = users.find((u) => u.login === 'rahbar');
  assert.equal((await admin('DELETE', `/api/users/${me.id}`)).status, 400);
  assert.equal(users.find((u) => u.login === 'zokirov').clients, 2);
});

test('chat: general room, private messages with files, unread counts, edit and delete', async () => {
  const users = (await admin('GET', '/api/users')).body.users;
  const rahbar = users.find((u) => u.login === 'rahbar');
  await admin('POST', '/api/users', { first_name: 'Sardor', last_name: 'Karimov', login: 'sardor', password: 'parol123', role: 'xodim' });
  const sardor = client();
  await sardor('POST', '/api/auth/login', { login: 'sardor', password: 'parol123' });

  const sent = await xodim('POST', '/api/chat/c/general/messages', { text: 'Assalomu alaykum' });
  assert.equal(sent.status, 200);
  let conv = (await admin('GET', '/api/chat/conversations')).body.conversations;
  assert.equal(conv[0].channel, 'general');
  assert.equal(conv[0].unread, 1);
  assert.equal(conv[0].last.text, 'Assalomu alaykum');
  await admin('POST', '/api/chat/c/general/read', { lastId: sent.body.message.id });
  assert.equal((await admin('GET', '/api/chat/unread')).body.unread, 0);

  // Private message with a picture: only the two people can see it.
  const fd = new FormData();
  fd.append('text', 'Chek rasmi');
  fd.append('file', new Blob([Buffer.from('89504e47', 'hex')], { type: 'image/png' }), 'chek.png');
  const dm = await xodim('POST', `/api/chat/c/u${rahbar.id}/messages`, fd);
  assert.equal(dm.status, 200, JSON.stringify(dm.body));
  const fileId = dm.body.message.file.id;
  const zokirovId = dm.body.message.userId;
  const inbox = (await admin('GET', `/api/chat/c/u${zokirovId}/messages`)).body.messages;
  assert.equal(inbox.at(-1).file.name, 'chek.png');
  assert.equal((await admin('GET', '/api/chat/unread')).body.unread, 1);

  const asAdmin = await fetch(`${base}/api/files/${fileId}`, { headers: { cookie: (await admin.cookie()) } });
  assert.equal(asAdmin.status, 200);
  assert.equal(asAdmin.headers.get('content-type'), 'image/png');
  const asOther = await fetch(`${base}/api/files/${fileId}`, { headers: { cookie: (await sardor.cookie()) } });
  assert.equal(asOther.status, 403);
  assert.equal((await sardor('GET', `/api/chat/c/u${zokirovId}/messages`)).body.messages.length, 0, "Sardor's own chat with Zokirov is empty");

  // Files that could run script are always downloads.
  const html = new FormData();
  html.append('file', new Blob(['<script>alert(1)</script>'], { type: 'text/html' }), 'x.html');
  const h = await xodim('POST', '/api/chat/c/general/messages', html);
  const r = await fetch(`${base}/api/files/${h.body.message.file.id}`, { headers: { cookie: (await admin.cookie()) } });
  assert.match(r.headers.get('content-disposition'), /^attachment/);
  assert.equal(r.headers.get('content-type'), 'application/octet-stream');

  // Only the author edits or deletes.
  const id = sent.body.message.id;
  assert.equal((await admin('PATCH', `/api/chat/messages/${id}`, { text: 'buzildi' })).status, 403);
  const ed = await xodim('PATCH', `/api/chat/messages/${id}`, { text: 'Assalomu alaykum, hammaga!' });
  assert.equal(ed.body.message.text, 'Assalomu alaykum, hammaga!');
  assert.ok(ed.body.message.editedAt);
  await xodim('DELETE', `/api/chat/messages/${dm.body.message.id}`);
  assert.equal((await admin('GET', `/api/chat/c/u${zokirovId}/messages`)).body.messages.length, 0);
  assert.equal((await fetch(`${base}/api/files/${fileId}`, { headers: { cookie: (await admin.cookie()) } })).status, 404);
  assert.equal((await xodim('POST', '/api/chat/c/general/messages', { text: '   ' })).status, 400);
});
