import ExcelJS from 'exceljs';

// Column positions in the collection template (0-based: A = 0).
export const COL = { contract: 1, client: 2, phone: 3, overdueDays: 14, q: 16, r: 17, employee: 23 };
export const MIN_COLUMNS = COL.employee + 1;

/** Problem with the uploaded file that the user can fix. */
export class InputError extends Error {}

const APOSTROPHES = /[‘’ʻʼ`´']/g;

/** Lower-cased, single-spaced name with every apostrophe variant unified. */
export function normalizeName(s) {
  return String(s ?? '').replace(APOSTROPHES, "'").replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Employees are matched on the first two words of column X: "Familiya Ism". */
export function nameKey(s) {
  return normalizeName(s).split(' ').slice(0, 2).join(' ');
}

export function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function cellValue(v) {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result); // formula: keep Excel's cached result
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return String(v.text);
    if ('error' in v) return '';
    return '';
  }
  if (typeof v === 'string') return v.trim();
  return v;
}

/** Fields the system calculates with, derived from a row's cells. */
export function deriveFields(cells) {
  const empName = String(cells[COL.employee] ?? '').trim();
  return {
    contract: String(cells[COL.contract] ?? '').trim(),
    client: String(cells[COL.client] ?? '').trim(),
    emp_name: empName,
    emp_key: nameKey(empName),
    q: toNumber(cells[COL.q]),
    r: toNumber(cells[COL.r]),
  };
}

/** Reads the first worksheet: row 1 is headers, every non-empty row after it is a client. */
export async function parseWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new InputError("Faylni o'qib bo'lmadi. Faqat .xlsx formatidagi Excel fayl yuklang.");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new InputError("Faylda varaq topilmadi.");

  const width = Math.max(ws.columnCount, MIN_COLUMNS);
  const read = (row) => Array.from({ length: width }, (_, i) => cellValue(row.getCell(i + 1).value));

  const headers = read(ws.getRow(1)).map((h, i) => String(h || `Ustun ${i + 1}`));
  if (ws.columnCount < MIN_COLUMNS) {
    throw new InputError(`Fayl shablonga mos emas: kamida ${MIN_COLUMNS} ta ustun (A dan X gacha) bo'lishi kerak.`);
  }

  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const cells = read(row);
    if (!cells[COL.contract] && !cells[COL.client]) return;
    rows.push({ row_no: n, cells });
  });
  if (!rows.length) throw new InputError("Faylda mijozlar qatori topilmadi.");
  return { headers, rows };
}
