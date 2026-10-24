import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';

const PAGE = 50;
const MAX_TEXT = 4000;
export const MAX_FILE_MB = 50;
// Types the browser may show inline; anything else is served as a download so an
// uploaded HTML or SVG file can never run script on our origin.
const INLINE = /^(image\/(png|jpeg|gif|webp)|video\/(mp4|webm|quicktime|ogg)|audio\/(mpeg|ogg|wav|webm|mp4)|application\/pdf)$/;

/**
 * Chat: one general room for everyone plus a private conversation between any two users.
 * Client-facing ids: 'general' or 'u<userId>' (the other person); stored as 'general' or 'dm:<low>:<high>'.
 */
export function mountChat(app, db, { auth, fail, filesDir, notify }) {
  fs.mkdirSync(filesDir, { recursive: true });
  const upload = multer({
    storage: multer.diskStorage({
      destination: filesDir,
      filename: (_req, _file, cb) => cb(null, crypto.randomBytes(16).toString('hex')),
    }),
    limits: { fileSize: MAX_FILE_MB * 1024 * 1024 },
  });

  const userName = "TRIM(COALESCE(u.last_name, '') || ' ' || COALESCE(u.first_name, ''))";

  /** Resolves a client-facing id for the current user; returns the stored channel and its members (null = everyone). */
  function resolve(req, cid) {
    if (cid === 'general') return { channel: 'general', members: null, cid };
    const m = /^u(\d+)$/.exec(cid);
    const peer = m && db.prepare('SELECT id FROM users WHERE id = ?').get(Number(m[1]));
    if (!peer) fail(404, 'Suhbat topilmadi.');
    if (peer.id === req.user.id) fail(400, "O'zingizga yozib bo'lmaydi.");
    const [a, b] = [req.user.id, peer.id].sort((x, y) => x - y);
    return { channel: `dm:${a}:${b}`, members: [a, b], cid };
  }

  /** The id the other side of a channel sees it under. */
  const cidFor = (channel, viewerId) => {
    if (channel === 'general') return 'general';
    const [, a, b] = channel.split(':').map(Number);
    return `u${a === viewerId ? b : a}`;
  };

  const msgSelect = `SELECT m.id, m.user_id AS userId, ${userName} AS author, m.text, m.created_at AS at, m.edited_at AS editedAt,
      f.id AS fileId, f.name AS fileName, f.mime AS fileMime, f.size AS fileSize
    FROM messages m LEFT JOIN users u ON u.id = m.user_id LEFT JOIN files f ON f.id = m.file_id`;
  const shape = (r) => ({
    id: r.id, userId: r.userId, author: r.author || "O'chirilgan foydalanuvchi", text: r.text, at: r.at, editedAt: r.editedAt,
    file: r.fileId ? { id: r.fileId, name: r.fileName, mime: r.fileMime, size: r.fileSize } : null,
  });

  const announce = (channel, members, event) => notify({ ...event, channel }, members);
  const lastRead = (userId, channel) => db.prepare('SELECT last_id FROM chat_reads WHERE user_id = ? AND channel = ?').get(userId, channel)?.last_id ?? 0;
  const unreadIn = (userId, channel) => db.prepare(
    'SELECT COUNT(*) n FROM messages WHERE channel = ? AND id > ? AND deleted_at IS NULL AND (user_id IS NULL OR user_id != ?)',
  ).get(channel, lastRead(userId, channel), userId).n;

  app.get('/api/chat/conversations', auth, (req, res) => {
    const me = req.user.id;
    const lastStmt = db.prepare(`${msgSelect} WHERE m.channel = ? AND m.deleted_at IS NULL ORDER BY m.id DESC LIMIT 1`);
    const conv = (channel, extra) => {
      const last = lastStmt.get(channel);
      return { channel: cidFor(channel, me), ...extra, last: last ? shape(last) : null, unread: unreadIn(me, channel) };
    };
    const people = db.prepare("SELECT id, first_name, last_name, role FROM users WHERE id != ? ORDER BY last_name, first_name").all(me);
    const list = [
      conv('general', { title: 'Umumiy chat', kind: 'general' }),
      ...people.map((p) => {
        const [a, b] = [me, p.id].sort((x, y) => x - y);
        return conv(`dm:${a}:${b}`, { title: `${p.last_name} ${p.first_name}`, kind: 'direct', role: p.role });
      }),
    ];
    res.json({ conversations: list });
  });

  app.get('/api/chat/unread', auth, (req, res) => {
    const me = req.user.id;
    const channels = ['general', ...db.prepare("SELECT DISTINCT channel FROM messages WHERE channel LIKE 'dm:%'").all()
      .map((r) => r.channel).filter((c) => c.split(':').slice(1).map(Number).includes(me))];
    res.json({ unread: channels.reduce((n, c) => n + unreadIn(me, c), 0) });
  });

  app.get('/api/chat/c/:cid/messages', auth, (req, res) => {
    const { channel } = resolve(req, req.params.cid);
    const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
    const rows = db.prepare(`${msgSelect} WHERE m.channel = ? AND m.deleted_at IS NULL AND m.id < ? ORDER BY m.id DESC LIMIT ?`)
      .all(channel, before, PAGE + 1);
    res.json({ messages: rows.slice(0, PAGE).reverse().map(shape), hasMore: rows.length > PAGE });
  });

  app.post('/api/chat/c/:cid/read', auth, (req, res) => {
    const { channel } = resolve(req, req.params.cid);
    const last = Number(req.body?.lastId) || 0;
    db.prepare(`INSERT INTO chat_reads (user_id, channel, last_id) VALUES (?, ?, ?)
      ON CONFLICT(user_id, channel) DO UPDATE SET last_id = MAX(last_id, excluded.last_id)`).run(req.user.id, channel, last);
    res.json({ ok: true });
  });

  app.post('/api/chat/c/:cid/messages', auth, upload.single('file'), (req, res) => {
    const drop = () => req.file && fs.rm(req.file.path, { force: true }, () => {});
    let target;
    try {
      target = resolve(req, req.params.cid);
    } catch (e) {
      drop();
      throw e;
    }
    const text = String(req.body?.text ?? '').trim();
    if (!text && !req.file) fail(400, "Xabar bo'sh.");
    if (text.length > MAX_TEXT) { drop(); fail(400, `Xabar ${MAX_TEXT} belgidan oshmasin.`); }

    const now = new Date().toISOString();
    const id = db.transaction(() => {
      let fileId = null;
      if (req.file) {
        const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8').slice(0, 200);
        fileId = db.prepare('INSERT INTO files (stored, name, mime, size, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(req.file.filename, name, req.file.mimetype || 'application/octet-stream', req.file.size, req.user.id, now).lastInsertRowid;
      }
      return db.prepare('INSERT INTO messages (channel, user_id, text, file_id, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(target.channel, req.user.id, text, fileId, now).lastInsertRowid;
    })();
    const msg = shape(db.prepare(`${msgSelect} WHERE m.id = ?`).get(id));
    announce(target.channel, target.members, { kind: 'new', id });
    res.json({ message: msg });
  });

  const ownMessage = (req) => {
    const m = db.prepare('SELECT * FROM messages WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
    if (!m) fail(404, 'Xabar topilmadi.');
    if (m.user_id !== req.user.id) fail(403, "Faqat o'z xabaringizni o'zgartira olasiz.");
    return m;
  };
  const membersOf = (channel) => (channel === 'general' ? null : channel.split(':').slice(1).map(Number));

  app.patch('/api/chat/messages/:id', auth, (req, res) => {
    const m = ownMessage(req);
    const text = String(req.body?.text ?? '').trim();
    if (!text && !m.file_id) fail(400, "Xabar bo'sh bo'lmasin.");
    if (text.length > MAX_TEXT) fail(400, `Xabar ${MAX_TEXT} belgidan oshmasin.`);
    db.prepare('UPDATE messages SET text = ?, edited_at = ? WHERE id = ?').run(text, new Date().toISOString(), m.id);
    announce(m.channel, membersOf(m.channel), { kind: 'edit', id: m.id });
    res.json({ message: shape(db.prepare(`${msgSelect} WHERE m.id = ?`).get(m.id)) });
  });

  app.delete('/api/chat/messages/:id', auth, (req, res) => {
    const m = ownMessage(req);
    db.transaction(() => {
      db.prepare("UPDATE messages SET deleted_at = ?, text = '', file_id = NULL WHERE id = ?").run(new Date().toISOString(), m.id);
      if (m.file_id) {
        const f = db.prepare('SELECT stored FROM files WHERE id = ?').get(m.file_id);
        db.prepare('DELETE FROM files WHERE id = ?').run(m.file_id);
        if (f) fs.rm(path.join(filesDir, f.stored), { force: true }, () => {});
      }
    })();
    announce(m.channel, membersOf(m.channel), { kind: 'delete', id: m.id });
    res.json({ ok: true });
  });

  app.get('/api/files/:id', auth, (req, res) => {
    const f = db.prepare('SELECT f.*, m.channel FROM files f JOIN messages m ON m.file_id = f.id WHERE f.id = ? AND m.deleted_at IS NULL')
      .get(Number(req.params.id));
    if (!f) fail(404, 'Fayl topilmadi.');
    const members = membersOf(f.channel);
    if (members && !members.includes(req.user.id)) fail(403, "Bu faylni ko'ra olmaysiz.");
    const inline = INLINE.test(f.mime) && req.query.download === undefined;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', inline ? f.mime : 'application/octet-stream');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`);
    res.sendFile(path.join(filesDir, f.stored), (err) => err && !res.headersSent && res.status(404).end());
  });
}
