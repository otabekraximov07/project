import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { api, type UploadInfo } from '../api';
import { currentPeriod, dateTime, money, periodLabel } from '../format';
import { PageHead } from './Shell';
import { Sheet } from './Sheet';
import { Confirm, Empty, Icon, useToast } from './ui';

interface UploadResult { upload: UploadInfo; matched: number; unmatched: { name: string; count: number }[] }

export function Uploads() {
  const toast = useToast();
  const [list, setList] = useState<UploadInfo[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<UploadInfo | null>(null);

  const load = useCallback(() => {
    api<{ uploads: UploadInfo[] }>('/api/uploads').then((r) => setList(r.uploads)).catch((e) => toast(e.message, 'err'));
  }, [toast]);
  useEffect(load, [load]);

  if (openId !== null) return <Sheet uploadId={openId} onBack={() => { setOpenId(null); load(); }} />;

  return (
    <>
      <PageHead title="Ma'lumot yuklash" sub="Excel fayl shablon bo'yicha o'qiladi: B shartnoma, C mijoz, Q grafik bo'yicha qarz, R umumiy qarz, X undiruvchi." />
      <UploadForm onDone={load} />

      <section className="panel">
        <div className="panel-head"><h3>Yuklangan fayllar</h3><span>{list ? `${list.length} ta` : ''}</span></div>
        {list && !list.length ? (
          <Empty icon="file" title="Fayllar yo'q" text="Birinchi faylni yuqoridagi maydon orqali yuklang." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Fayl</th><th>Oy</th><th>Turi</th><th className="num">Qatorlar</th><th className="num">Portfel (R), so'm</th><th>Yuklangan</th><th /></tr>
              </thead>
              <tbody>
                {(list ?? []).map((u) => (
                  <tr key={u.id} className="clickable" onClick={() => setOpenId(u.id)}>
                    <td><span className="file-name"><Icon name="file" />{u.filename}</span></td>
                    <td>{periodLabel(u.period)}</td>
                    <td><span className={`badge ${u.kind === 'baseline' ? 'gold' : 'blue'}`}>{u.kind === 'baseline' ? 'Oy boshi' : 'Yangilash'}</span></td>
                    <td className="num">{money(u.row_count)}</td>
                    <td className="num">{money(u.r_sum)}</td>
                    <td className="muted">{dateTime(u.uploaded_at)}{u.uploaded_by && ` · ${u.uploaded_by}`}</td>
                    <td className="actions" onClick={(e) => e.stopPropagation()}>
                      <button className="icon-btn" title="Ochish va tahrirlash" onClick={() => setOpenId(u.id)}><Icon name="open" /></button>
                      <button className="icon-btn danger" title="O'chirish" onClick={() => setToDelete(u)}><Icon name="trash" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {toDelete && (
        <Confirm
          title="Faylni o'chirish"
          text={<>«{toDelete.filename}» ({periodLabel(toDelete.period)}) va undagi {money(toDelete.row_count)} ta qator o'chiriladi. Hisob-kitob qayta hisoblanadi.</>}
          onClose={() => setToDelete(null)}
          onOk={async () => {
            await api(`/api/uploads/${toDelete.id}`, { method: 'DELETE' }).catch((e) => { toast(e.message, 'err'); throw e; });
            toast("Fayl o'chirildi");
            load();
          }}
        />
      )}
    </>
  );
}

function UploadForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [period, setPeriod] = useState(currentPeriod());
  const [kind, setKind] = useState('auto');
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  const pick = (f?: File) => {
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) return toast('Faqat .xlsx formatidagi Excel fayl yuklang.', 'err');
    setFile(f);
    setResult(null);
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); };

  async function send() {
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('period', period);
    if (kind !== 'auto') fd.append('kind', kind);
    try {
      const r = await api<UploadResult>('/api/uploads', { method: 'POST', body: fd });
      setResult(r);
      setFile(null);
      if (input.current) input.current.value = '';
      toast(`${money(r.upload.row_count)} ta qator yuklandi`);
      onDone();
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel upload">
      <div
        className={`drop ${drag ? 'drag' : ''} ${file ? 'has' : ''}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      >
        <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <div className="drop-ico"><Icon name={file ? 'file' : 'upload'} size={26} /></div>
        {file ? (
          <><b>{file.name}</b><span className="muted">{(file.size / 1024).toFixed(0)} KB · boshqa fayl tanlash uchun bosing</span></>
        ) : (
          <><b>Excel faylni shu yerga tashlang</b><span className="muted">yoki tanlash uchun bosing (.xlsx)</span></>
        )}
      </div>

      <div className="upload-side">
        <label className="field"><span>Qaysi oy uchun</span><input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} required /></label>
        <label className="field">
          <span>Fayl turi</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="auto">Avtomatik (oyning birinchi fayli = oy boshi)</option>
            <option value="baseline">Oy boshi portfeli</option>
            <option value="update">Yangilash (joriy holat)</option>
          </select>
        </label>
        <button className="btn primary block" disabled={!file || busy || !period} onClick={send}>
          <Icon name="upload" />{busy ? 'Yuklanmoqda…' : 'Yuklash'}
        </button>
      </div>

      {result && (
        <div className="upload-result">
          <div className="ok-line"><Icon name="checkCircle" />{money(result.upload.row_count)} ta mijoz yuklandi, {money(result.matched)} tasi xodimlarga biriktirildi.</div>
          {result.unmatched.length > 0 && (
            <div className="warn-box">
              <b><Icon name="alert" />X ustunidagi bu ismlar ro'yxatdan o'tgan xodimlarga mos kelmadi:</b>
              <ul>{result.unmatched.map((u) => <li key={u.name}>{u.name} <span className="muted">· {u.count} ta mijoz</span></li>)}</ul>
              <span className="muted">Shu ism-familiya bilan xodim qo'shsangiz, mijozlar unga avtomatik biriktiriladi.</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
