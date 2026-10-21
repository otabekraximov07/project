import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type SheetRow, type UploadInfo } from '../api';
import { colLetter, dateTime, money, periodLabel } from '../format';
import { PageHead } from './Shell';
import { Confirm, Icon, useToast } from './ui';

// Columns the system calculates with: B contract, C client, Q, R, X employee.
const KEY_COLS = new Set([1, 2, 16, 17, 23]);
const MONEY_COLS = new Set([10, 12, 13, 16, 17]);
const EMP_COL = 23;

/** The uploaded Excel file as an editable spreadsheet. */
export function Sheet({ uploadId, onBack }: { uploadId: number; onBack: () => void }) {
  const toast = useToast();
  const [info, setInfo] = useState<UploadInfo | null>(null);
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState<{ id: number; col: number; value: string } | null>(null);
  const [toDelete, setToDelete] = useState<SheetRow | null>(null);

  useEffect(() => {
    api<{ upload: UploadInfo }>(`/api/uploads/${uploadId}`).then((r) => setInfo(r.upload)).catch((e) => toast(e.message, 'err'));
  }, [uploadId, toast]);

  const load = useCallback(() => {
    const qs = new URLSearchParams({ page: String(page), ...(search ? { q: search } : {}) });
    api<{ rows: SheetRow[]; total: number; pageSize: number }>(`/api/uploads/${uploadId}/rows?${qs}`)
      .then((r) => { setRows(r.rows); setTotal(r.total); setPageSize(r.pageSize); })
      .catch((e) => toast(e.message, 'err'));
  }, [uploadId, page, search, toast]);
  useEffect(load, [load]);

  useEffect(() => {
    const t = setTimeout(() => { setPage(1); setSearch(q.trim()); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  async function save() {
    if (!edit) return;
    const row = rows.find((r) => r.id === edit.id);
    setEdit(null);
    if (!row || String(row.cells[edit.col] ?? '') === edit.value) return;
    try {
      const r = await api<{ row: SheetRow }>(`/api/rows/${edit.id}`, { method: 'PATCH', body: { col: edit.col, value: edit.value } });
      setRows((list) => list.map((x) => (x.id === r.row.id ? r.row : x)));
      toast('Saqlandi');
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  }

  const headers = info?.headers ?? [];
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <PageHead
        title={info?.filename ?? 'Fayl'}
        sub={info && <>{periodLabel(info.period)} · {info.kind === 'baseline' ? 'Oy boshi portfeli' : 'Yangilash'} · {dateTime(info.uploaded_at)}</>}
      >
        <button className="btn ghost" onClick={onBack}><Icon name="back" />Fayllarga qaytish</button>
      </PageHead>

      <section className="panel sheet-panel">
        <div className="sheet-bar">
          <label className="search">
            <Icon name="search" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mijoz, shartnoma, xodim bo'yicha qidirish" />
          </label>
          <span className="muted hint">Katakni tahrirlash uchun ikki marta bosing. Enter saqlaydi, Esc bekor qiladi.</span>
        </div>

        <div className="sheet-wrap">
          <table className="sheet">
            <thead>
              <tr className="letters">
                <th className="rn" />
                {headers.map((_, i) => <th key={i} className={KEY_COLS.has(i) ? 'key' : ''}>{colLetter(i)}</th>)}
                <th className="act" />
              </tr>
              <tr className="names">
                <th className="rn">#</th>
                {headers.map((h, i) => <th key={i} className={KEY_COLS.has(i) ? 'key' : ''} title={h}>{h}</th>)}
                <th className="act" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="rn">{row.row_no}</td>
                  {headers.map((_, col) => {
                    const v = row.cells[col] ?? '';
                    const editing = edit?.id === row.id && edit.col === col;
                    const cls = [
                      KEY_COLS.has(col) ? 'key' : '',
                      typeof v === 'number' ? 'num' : '',
                      col === EMP_COL ? (row.matched ? 'emp ok' : 'emp miss') : '',
                      editing ? 'editing' : '',
                    ].join(' ');
                    return (
                      <td
                        key={col}
                        className={cls}
                        title={col === EMP_COL && !row.matched ? `${v} · bu ism bilan xodim ro'yxatdan o'tmagan` : String(v)}
                        onDoubleClick={() => setEdit({ id: row.id, col, value: String(v) })}
                      >
                        {editing ? (
                          <CellInput value={edit.value} onChange={(value) => setEdit({ ...edit, value })} onSave={save} onCancel={() => setEdit(null)} />
                        ) : typeof v === 'number' && MONEY_COLS.has(col) ? money(v) : String(v)}
                      </td>
                    );
                  })}
                  <td className="act">
                    <button className="icon-btn danger" title="Qatorni o'chirish" onClick={() => setToDelete(row)}><Icon name="trash" size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <div className="sheet-empty muted">{search ? 'Hech narsa topilmadi.' : "Faylda qator qolmagan."}</div>}
        </div>

        <div className="sheet-foot">
          <span className="muted">{money(total)} ta qator</span>
          {pages > 1 && (
            <div className="pager">
              <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
              <span>{page} / {pages}</span>
              <button className="btn ghost sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button>
            </div>
          )}
        </div>
      </section>

      {toDelete && (
        <Confirm
          title="Qatorni o'chirish"
          text={<>{toDelete.row_no}-qator ({String(toDelete.cells[2] ?? '')}, {String(toDelete.cells[1] ?? '')}) o'chiriladi.</>}
          onClose={() => setToDelete(null)}
          onOk={async () => {
            await api(`/api/rows/${toDelete.id}`, { method: 'DELETE' }).catch((e) => { toast(e.message, 'err'); throw e; });
            toast("Qator o'chirildi");
            load();
          }}
        />
      )}
    </>
  );
}

function CellInput({ value, onChange, onSave, onCancel }: { value: string; onChange: (v: string) => void; onSave: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false); // Enter/Esc already handled; ignore the blur that follows unmount
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    if (save) onSave(); else onCancel();
  };
  return (
    <input
      ref={ref}
      className="cell-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      }}
    />
  );
}
