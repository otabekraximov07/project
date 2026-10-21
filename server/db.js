import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  login         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'xodim')),
  created_at    TEXT NOT NULL
);

-- One uploaded Excel file. period = 'YYYY-MM'; kind 'baseline' is the start-of-month portfolio.
CREATE TABLE IF NOT EXISTS uploads (
  id          INTEGER PRIMARY KEY,
  filename    TEXT NOT NULL,
  period      TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('baseline', 'update')),
  headers     TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- One Excel row. cells holds every column (A..X) as a JSON array; the columns
-- the system calculates with are copied out so they can be queried.
CREATE TABLE IF NOT EXISTS rows (
  id         INTEGER PRIMARY KEY,
  upload_id  INTEGER NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  row_no     INTEGER NOT NULL,
  contract   TEXT NOT NULL,
  client     TEXT NOT NULL,
  emp_name   TEXT NOT NULL,
  emp_key    TEXT NOT NULL,
  q          REAL NOT NULL,
  r          REAL NOT NULL,
  cells      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS rows_upload ON rows(upload_id, row_no);
CREATE INDEX IF NOT EXISTS rows_contract ON rows(contract);

-- Early builds kept call results in one table; status and notes are now separate.
DROP TABLE IF EXISTS contacts;

-- Current status of each client (by contract), set by employees.
CREATE TABLE IF NOT EXISTS client_status (
  contract     TEXT PRIMARY KEY,
  status       TEXT NOT NULL CHECK (status IN ('muhlat', 'boglanmadi', 'uchinchi', 'telegram', 'sms', 'muammoli', 'tolandi')),
  promise_date TEXT,
  updated_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at   TEXT NOT NULL
);

-- Every status change, for the daily and monthly reports.
CREATE TABLE IF NOT EXISTS status_log (
  id           INTEGER PRIMARY KEY,
  contract     TEXT NOT NULL,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status       TEXT NOT NULL,
  promise_date TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS status_log_time ON status_log(created_at);
CREATE INDEX IF NOT EXISTS status_log_contract ON status_log(contract, id);

-- Notes written after talking to a client. A note on a day means the client was talked to that day.
CREATE TABLE IF NOT EXISTS notes (
  id         INTEGER PRIMARY KEY,
  contract   TEXT NOT NULL,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notes_time ON notes(created_at);
CREATE INDEX IF NOT EXISTS notes_contract ON notes(contract, id);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

export function getSetting(db, key) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;
}

export function setSetting(db, key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
