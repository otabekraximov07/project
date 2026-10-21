import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = openDb(process.env.DB_FILE || path.join(root, 'data', 'undiruv.db'));
const app = createApp(db, { staticDir: path.join(root, 'dist') });
const port = Number(process.env.PORT) || 3000;

app.listen(port, () => console.log(`HamrohNasiya Undiruv: http://localhost:${port}`));
