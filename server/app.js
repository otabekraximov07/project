import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getSetting, setSetting } from './db.js';
import { COL, InputError, deriveFields, nameKey, parseWorkbook, toNumber, userKeys } from './excel.js';
import { clientList, dashboard, localParts, replayPeriod } from './stats.js';
import { STATUSES, teamReport } from './team.js';

const COOKIE = 'undiruv_session';
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const LOGIN_RE = /^[a-zA-Z0-9._-]{3,32}$/;
const PAGE_SIZE = 100;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

const publicUser = (u) => u && { id: u.id, first_name: u.first_name, last_name: u.last_name, login: u.login, role: u.role };

export function createApp(db, { staticDir } = {}) {
  const secret = process.env.JWT_SECRET || getSetting(db, 'jwt_secret') || (() => {
    const s = crypto.randomBytes(48).toString('hex');
    setSetting(db, 'jwt_secret', s);
    return s;
  })();

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

  // Live updates: open pages listen on /api/events and refetch when anything changes.
  const listeners = new Set();
  const broadcast = () => { for (const res of listeners) res.write('data: change\n\n'); };
  app.use('/api', (req, res, next) => {
    if (req.method !== 'GET' && !req.path.startsWith('/auth/')) {
      res.on('finish', () => res.statusCode < 400 && broadcast());
    }
    next();
  });

  const userCount = () => db.prepare('SELECT COUNT(*) n FROM users').get().n;
  const getUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  const allKeys = () => {
    const keys = new Set();
    for (const u of db.prepare("SELECT first_name, last_name FROM users").all()) userKeys(u).forEach((k) => keys.add(k));
    return keys;
  };

  function startSession(res, user) {
    const token = jwt.sign({ uid: user.id }, secret, { expiresIn: '30d' });
    res.cookie(COOKIE, token, {
      httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === '1', maxAge: 30 * 24 * 3600 * 1000,
    });
  }

  function currentUser(req) {
    try {
      const { uid } = jwt.verify(req.cookies?.[COOKIE] ?? '', secret);
      return getUser(uid) ?? null;
    } catch {
      return null;
    }
  }

  const auth = (req, _res, next) => {
    req.user = currentUser(req);
    if (!req.user) fail(401, 'Tizimga qayta kiring.');
    next();
  };
  const admin = (req, _res, next) => {
    if (req.user.role !== 'admin') fail(403, "Bu bo'lim faqat rahbariyat uchun.");
    next();
  };

  function validateUser(body, { partial = false } = {}) {
    const out = {};
    for (const f of ['first_name', 'last_name']) {
      if (partial && body[f] === undefined) continue;
      const v = String(body[f] ?? '').replace(/\s+/g, ' ').trim();
      if (v.length < 2) fail(400, f === 'first_name' ? 'Ismni kiriting.' : 'Familiyani kiriting.');
      out[f] = v;
    }
    if (!partial || body.login !== undefined) {
      const v = String(body.login ?? '').trim();
      if (!LOGIN_RE.test(v)) fail(400, "Login 3–32 belgi: lotin harflari, raqam, nuqta, _ yoki -.");
      out.login = v;
    }
    if (!partial || body.password) {
      const v = String(body.password ?? '');
      if (v.length < 6) fail(400, "Parol kamida 6 belgidan iborat bo'lsin.");
      out.password_hash = bcrypt.hashSync(v, 10);
    }
    if (!partial || body.role !== undefined) {
      if (!['admin', 'xodim'].includes(body.role)) fail(400, "Rolni tanlang.");
      out.role = body.role;
    }
    return out;
  }

  function insertUser(fields) {
    try {
      const info = db.prepare(`INSERT INTO users (first_name, last_name, login, password_hash, role, created_at)
        VALUES (@first_name, @last_name, @login, @password_hash, @role, @created_at)`).run({ ...fields, created_at: new Date().toISOString() });
      return getUser(info.lastInsertRowid);
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) fail(409, 'Bu login band.');
      throw e;
    }
  }

  // ---------- auth ----------
  const attempts = new Map();
  app.get('/api/auth/state', (req, res) => {
    res.json({ needsSetup: userCount() === 0, user: publicUser(currentUser(req)) });
  });

  app.post('/api/auth/setup', (req, res) => {
    const create = db.transaction(() => {
      if (userCount() > 0) fail(409, 'Tizim allaqachon sozlangan. Login orqali kiring.');
      return insertUser(validateUser({ ...req.body, role: 'admin' }));
    });
    const user = create();
    startSession(res, user);
    res.json({ user: publicUser(user) });
  });

  app.post('/api/auth/login', (req, res) => {
    const login = String(req.body?.login ?? '').trim();
    const key = `${req.ip}|${login.toLowerCase()}`;
    const a = attempts.get(key);
    if (a && a.count >= 10 && a.until > Date.now()) fail(429, "Juda ko'p urinish. 15 daqiqadan keyin qayta urinib ko'ring.");
    const user = db.prepare('SELECT * FROM users WHERE login = ?').get(login);
    if (!user || !bcrypt.compareSync(String(req.body?.password ?? ''), user.password_hash)) {
      attempts.set(key, { count: (a && a.until > Date.now() ? a.count : 0) + 1, until: Date.now() + 15 * 60 * 1000 });
      fail(401, "Login yoki parol noto'g'ri.");
    }
    attempts.delete(key);
    startSession(res, user);
    res.json({ user: publicUser(user) });
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie(COOKIE);
    res.json({ ok: true });
  });

  app.get('/api/events', auth, (req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write(': ok\n\n');
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    listeners.add(res);
    req.on('close', () => { clearInterval(ping); listeners.delete(res); });
  });

  // ---------- users ----------
  app.get('/api/users', auth, admin, (_req, res) => {
    const period = latestPeriod();
    const counts = new Map();
    if (period) for (const s of replayPeriod(db, period).state.values()) counts.set(s.empKey, (counts.get(s.empKey) ?? 0) + 1);
    const users = db.prepare('SELECT * FROM users ORDER BY role, last_name, first_name').all().map((u) => ({
      ...publicUser(u),
      created_at: u.created_at,
      clients: [...userKeys(u)].reduce((n, k) => n + (counts.get(k) ?? 0), 0),
    }));
    res.json({ users, period });
  });

  app.post('/api/users', auth, admin, (req, res) => {
    res.json({ user: publicUser(insertUser(validateUser(req.body))) });
  });

  const adminCount = () => db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'admin'").get().n;

  app.patch('/api/users/:id', auth, admin, (req, res) => {
    const target = getUser(Number(req.params.id)) ?? fail(404, 'Foydalanuvchi topilmadi.');
    const fields = validateUser(req.body, { partial: true });
    if (target.role === 'admin' && fields.role === 'xodim' && adminCount() === 1) fail(400, "Oxirgi rahbarning rolini o'zgartirib bo'lmaydi.");
    if (!Object.keys(fields).length) return res.json({ user: publicUser(target) });
    const sets = Object.keys(fields).map((k) => `${k} = @${k}`).join(', ');
    try {
      db.prepare(`UPDATE users SET ${sets} WHERE id = @id`).run({ ...fields, id: target.id });
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) fail(409, 'Bu login band.');
      throw e;
    }
    res.json({ user: publicUser(getUser(target.id)) });
  });

  app.delete('/api/users/:id', auth, admin, (req, res) => {
    const target = getUser(Number(req.params.id)) ?? fail(404, 'Foydalanuvchi topilmadi.');
    if (target.id === req.user.id) fail(400, "O'zingizni o'chira olmaysiz.");
    if (target.role === 'admin' && adminCount() === 1) fail(400, "Oxirgi rahbarni o'chirib bo'lmaydi.");
    db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
    res.json({ ok: true });
  });

  // ---------- dashboard ----------
  const latestPeriod = () => db.prepare('SELECT period FROM uploads ORDER BY period DESC LIMIT 1').get()?.period ?? null;

  /** Which employee's numbers to show: employees always see their own, admins may pick one. */
  function scopeKeys(req) {
    if (req.user.role !== 'admin') return userKeys(req.user);
    if (!req.query.userId) return null;
    const u = getUser(Number(req.query.userId)) ?? fail(404, 'Xodim topilmadi.');
    return userKeys(u);
  }

  function pickPeriod(req) {
    const p = req.query.period ? String(req.query.period) : latestPeriod() ?? localParts(new Date().toISOString()).period;
    if (!PERIOD_RE.test(p)) fail(400, "Oy noto'g'ri ko'rsatilgan.");
    return p;
  }

  app.get('/api/periods', auth, (_req, res) => {
    res.json({ periods: db.prepare('SELECT DISTINCT period FROM uploads ORDER BY period DESC').all().map((r) => r.period) });
  });

  app.get('/api/employees', auth, admin, (_req, res) => {
    res.json({ employees: db.prepare("SELECT id, first_name, last_name FROM users WHERE role = 'xodim' ORDER BY last_name, first_name").all() });
  });

  app.get('/api/dashboard', auth, (req, res) => {
    res.json(dashboard(db, pickPeriod(req), scopeKeys(req)));
  });

  app.get('/api/team', auth, admin, (req, res) => {
    const scope = req.query.scope === 'all' ? 'all' : 'today';
    res.json(teamReport(db, { scope, period: pickPeriod(req) }));
  });

  app.get('/api/clients', auth, (req, res) => {
    res.json({ clients: clientList(db, pickPeriod(req), scopeKeys(req)) });
  });

  // ---------- client card: status and notes ----------
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const authorName = "TRIM(COALESCE(us.last_name, '') || ' ' || COALESCE(us.first_name, ''))";

  /** The client's latest row; employees may only open their own clients. */
  function clientRow(req, contract) {
    const period = latestPeriod();
    const replay = period ? replayPeriod(db, period) : null;
    const s = replay?.state.get(contract);
    if (!s) fail(404, 'Mijoz topilmadi.');
    if (req.user.role !== 'admin' && !userKeys(req.user).has(s.empKey)) fail(403, 'Bu mijoz sizga biriktirilmagan.');
    const row = db.prepare('SELECT r.cells, u.headers FROM rows r JOIN uploads u ON u.id = r.upload_id WHERE r.id = ?').get(s.rowId);
    const paidSum = replay.payments.filter((p) => p.contract === contract).reduce((a, p) => a + p.amount, 0);
    return { s, row, paidSum };
  }

  app.get('/api/clients/:contract', auth, (req, res) => {
    const contract = req.params.contract;
    const { s, row, paidSum } = clientRow(req, contract);
    const st = db.prepare('SELECT status, promise_date FROM client_status WHERE contract = ?').get(contract);
    res.json({
      contract,
      headers: JSON.parse(row.headers),
      cells: JSON.parse(row.cells),
      q: s.q, r: s.r, baseQ: s.baseQ, baseR: s.baseR, paidSum, paid: s.q <= 0.5, closed: s.closed,
      status: st?.status ?? null,
      promiseDate: st?.promise_date ?? null,
      notes: db.prepare(`SELECT n.id, n.text, n.created_at AS at, ${authorName} AS author FROM notes n
        LEFT JOIN users us ON us.id = n.user_id WHERE n.contract = ? ORDER BY n.id DESC`).all(contract),
      history: db.prepare(`SELECT l.id, l.status, l.promise_date AS promiseDate, l.created_at AS at, ${authorName} AS author FROM status_log l
        LEFT JOIN users us ON us.id = l.user_id WHERE l.contract = ? ORDER BY l.id DESC`).all(contract),
    });
  });

  app.put('/api/clients/:contract/status', auth, (req, res) => {
    const contract = req.params.contract;
    clientRow(req, contract);
    const status = req.body?.status ?? null;
    if (status !== null && !STATUSES.includes(status)) fail(400, "Status noto'g'ri.");
    const promiseDate = status === 'muhlat' ? req.body?.promiseDate || null : null;
    if (promiseDate && !DATE_RE.test(promiseDate)) fail(400, "Muhlat sanasi noto'g'ri.");
    const now = new Date().toISOString();

    db.transaction(() => {
      const cur = db.prepare('SELECT status, promise_date FROM client_status WHERE contract = ?').get(contract);
      if (status === null) {
        db.prepare('DELETE FROM client_status WHERE contract = ?').run(contract);
        return;
      }
      if (cur && cur.status === status && (cur.promise_date ?? null) === promiseDate) return;
      db.prepare(`INSERT INTO client_status (contract, status, promise_date, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(contract) DO UPDATE SET status = excluded.status, promise_date = excluded.promise_date,
        updated_by = excluded.updated_by, updated_at = excluded.updated_at`).run(contract, status, promiseDate, req.user.id, now);
      // Only the deadline changed: amend the last entry instead of logging the same status twice.
      const last = db.prepare('SELECT id, status FROM status_log WHERE contract = ? ORDER BY id DESC LIMIT 1').get(contract);
      if (cur?.status === status && last?.status === status) {
        db.prepare('UPDATE status_log SET promise_date = ? WHERE id = ?').run(promiseDate, last.id);
      } else {
        db.prepare('INSERT INTO status_log (contract, user_id, status, promise_date, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(contract, req.user.id, status, promiseDate, now);
      }
    })();
    res.json({ status, promiseDate });
  });

  app.post('/api/clients/:contract/notes', auth, (req, res) => {
    const contract = req.params.contract;
    clientRow(req, contract);
    const text = String(req.body?.text ?? '').trim();
    if (!text) fail(400, 'Izoh bo\'sh bo\'lmasin.');
    if (text.length > 2000) fail(400, 'Izoh 2000 belgidan oshmasin.');
    const at = new Date().toISOString();
    const { lastInsertRowid: id } = db.prepare('INSERT INTO notes (contract, user_id, text, created_at) VALUES (?, ?, ?, ?)')
      .run(contract, req.user.id, text, at);
    res.json({ note: { id, text, at, author: `${req.user.last_name} ${req.user.first_name}` } });
  });

  // ---------- uploads ----------
  const uploadSummary = (where = '', ...args) => db.prepare(`
    SELECT u.id, u.filename, u.period, u.kind, u.uploaded_at,
           TRIM(COALESCE(us.last_name, '') || ' ' || COALESCE(us.first_name, '')) AS uploaded_by,
           (SELECT COUNT(*) FROM rows r WHERE r.upload_id = u.id) AS row_count,
           (SELECT COALESCE(SUM(r.r), 0) FROM rows r WHERE r.upload_id = u.id) AS r_sum
    FROM uploads u LEFT JOIN users us ON us.id = u.uploaded_by ${where}
    ORDER BY u.period DESC, u.uploaded_at DESC, u.id DESC`).all(...args);

  app.get('/api/uploads', auth, admin, (_req, res) => {
    res.json({ uploads: uploadSummary() });
  });

  app.post('/api/uploads', auth, admin, upload.single('file'), async (req, res) => {
    if (!req.file) fail(400, 'Excel faylni tanlang.');
    const period = String(req.body.period ?? '');
    if (!PERIOD_RE.test(period)) fail(400, 'Oyni tanlang.');
    const hasBaseline = !!db.prepare("SELECT 1 FROM uploads WHERE period = ? AND kind = 'baseline'").get(period);
    const kind = ['baseline', 'update'].includes(req.body.kind) ? req.body.kind : hasBaseline ? 'update' : 'baseline';

    const { headers, rows } = await parseWorkbook(req.file.buffer);
    const filename = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

    const save = db.transaction(() => {
      const { lastInsertRowid: id } = db.prepare(`INSERT INTO uploads (filename, period, kind, headers, uploaded_at, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?)`).run(filename, period, kind, JSON.stringify(headers), new Date().toISOString(), req.user.id);
      const ins = db.prepare(`INSERT INTO rows (upload_id, row_no, contract, client, emp_name, emp_key, q, r, cells)
        VALUES (@upload_id, @row_no, @contract, @client, @emp_name, @emp_key, @q, @r, @cells)`);
      for (const r of rows) ins.run({ upload_id: id, row_no: r.row_no, ...deriveFields(r.cells), cells: JSON.stringify(r.cells) });
      return id;
    });
    const id = save();

    const keys = allKeys();
    const unmatched = new Map();
    for (const r of rows) {
      const name = String(r.cells[COL.employee] ?? '').trim();
      if (!keys.has(nameKey(name))) unmatched.set(name || "(bo'sh)", (unmatched.get(name || "(bo'sh)") ?? 0) + 1);
    }
    res.json({
      upload: uploadSummary('WHERE u.id = ?', id)[0],
      matched: rows.length - [...unmatched.values()].reduce((a, b) => a + b, 0),
      unmatched: [...unmatched].map(([name, count]) => ({ name, count })),
    });
  });

  const getUpload = (id) => db.prepare('SELECT * FROM uploads WHERE id = ?').get(id) ?? fail(404, 'Fayl topilmadi.');

  app.get('/api/uploads/:id', auth, admin, (req, res) => {
    const u = getUpload(Number(req.params.id));
    res.json({ upload: { ...uploadSummary('WHERE u.id = ?', u.id)[0], headers: JSON.parse(u.headers) } });
  });

  app.get('/api/uploads/:id/rows', auth, admin, (req, res) => {
    const u = getUpload(Number(req.params.id));
    const page = Math.max(1, Number(req.query.page) || 1);
    const q = String(req.query.q ?? '').trim();
    const where = q ? 'AND cells LIKE ? ESCAPE \'\\\'' : '';
    const args = q ? [u.id, `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`] : [u.id];
    const total = db.prepare(`SELECT COUNT(*) n FROM rows WHERE upload_id = ? ${where}`).get(...args).n;
    const keys = allKeys();
    const rows = db.prepare(`SELECT id, row_no, emp_key, cells FROM rows WHERE upload_id = ? ${where} ORDER BY row_no LIMIT ? OFFSET ?`)
      .all(...args, PAGE_SIZE, (page - 1) * PAGE_SIZE)
      .map((r) => ({ id: r.id, row_no: r.row_no, matched: keys.has(r.emp_key), cells: JSON.parse(r.cells) }));
    res.json({ rows, total, page, pageSize: PAGE_SIZE });
  });

  app.delete('/api/uploads/:id', auth, admin, (req, res) => {
    const u = getUpload(Number(req.params.id));
    db.prepare('DELETE FROM uploads WHERE id = ?').run(u.id);
    res.json({ ok: true });
  });

  const getRow = (id) => db.prepare('SELECT * FROM rows WHERE id = ?').get(id) ?? fail(404, 'Qator topilmadi.');

  app.patch('/api/rows/:id', auth, admin, (req, res) => {
    const row = getRow(Number(req.params.id));
    const cells = JSON.parse(row.cells);
    const col = Number(req.body?.col);
    if (!Number.isInteger(col) || col < 0 || col >= cells.length) fail(400, "Ustun noto'g'ri.");
    const raw = String(req.body?.value ?? '').trim();
    const numeric = raw !== '' && /^-?[\d\s]+([.,]\d+)?$/.test(raw);
    cells[col] = numeric && (typeof cells[col] === 'number' || col === COL.q || col === COL.r) ? toNumber(raw) : raw;
    const f = deriveFields(cells);
    db.prepare(`UPDATE rows SET contract = @contract, client = @client, emp_name = @emp_name, emp_key = @emp_key,
      q = @q, r = @r, cells = @cells WHERE id = @id`).run({ ...f, cells: JSON.stringify(cells), id: row.id });
    res.json({ row: { id: row.id, row_no: row.row_no, matched: allKeys().has(f.emp_key), cells } });
  });

  app.delete('/api/rows/:id', auth, admin, (req, res) => {
    db.prepare('DELETE FROM rows WHERE id = ?').run(getRow(Number(req.params.id)).id);
    res.json({ ok: true });
  });

  app.use('/api', (_req, _res) => fail(404, 'Topilmadi.'));

  // ---------- web app ----------
  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir, { index: false }));
    app.get('/{*splat}', (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  }

  app.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Fayl hajmi 20 MB dan oshmasin.' : err.message });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err instanceof InputError) return res.status(400).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: "So'rov noto'g'ri." });
    console.error(err);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi.' });
  });

  return app;
}
