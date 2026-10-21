import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type ClientCard as Card, type Status } from '../api';
import { useLiveUpdates } from '../chartKit';
import { dateTime, money } from '../format';
import { STATUS_BY_KEY } from '../statuses';
import { addNote, clientCardUrl, saveStatus } from './clientApi';
import { PageHead } from './Shell';
import { StatusSelect } from './StatusSelect';
import { Icon, useToast } from './ui';

// Columns shown at the top of the card rather than in the details list.
const SHOWN = new Set([1, 2, 16, 17]);
const MONEY = new Set([10, 12, 13, 16, 17]);

/** Everything about one client: details from Excel, status, notes and their history. */
export function ClientCard({ contract, onBack }: { contract: string; onBack: () => void }) {
  const toast = useToast();
  const [card, setCard] = useState<Card | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(() => {
    api<Card>(clientCardUrl(contract)).then(setCard).catch((e) => toast(e.message, 'err'));
  }, [contract, toast]);
  useEffect(load, [load]);
  useLiveUpdates(load);

  async function changeStatus(status: Status | null, promiseDate: string | null = card?.promiseDate ?? null) {
    if (!card) return;
    try {
      const r = await saveStatus(contract, status, status === 'muhlat' ? promiseDate : null);
      setCard({ ...card, ...r });
      load();
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  }

  async function submitNote() {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const { note } = await addNote(contract, text);
      setCard((c) => c && { ...c, notes: [note, ...c.notes] });
      setText('');
      toast('Izoh saqlandi');
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  const name = card ? String(card.cells[2] ?? '') : '';
  const branch = card ? String(card.cells[0] ?? '') : '';

  return (
    <>
      <PageHead title={name || 'Mijoz'} sub={card ? <><span className="mono">{contract}</span>{branch && ` · ${branch}`}</> : 'Yuklanmoqda…'}>
        <button className="btn ghost" onClick={onBack}><Icon name="back" />Mijozlarga qaytish</button>
      </PageHead>

      {card && (
        <>
          <section className="client-top">
            <div className="panel status-panel">
              <h3>Status</h3>
              <StatusSelect value={card.status} onChange={(s) => changeStatus(s)} />
              {card.status === 'muhlat' && (
                <label className="field">
                  <span>Muhlat sana</span>
                  <input type="date" value={card.promiseDate ?? ''} onChange={(e) => changeStatus('muhlat', e.target.value || null)} />
                </label>
              )}
            </div>
            <div className="money-tiles">
              <div><span>Grafik bo'yicha (Q)</span><b>{card.paid ? <span className="green-text">0 · 100% to'langan</span> : money(card.q)}</b></div>
              <div><span>Portfel (R)</span><b>{money(card.r)}</b></div>
              <div><span>To'langan</span><b className="green-text">{money(card.paidSum)}</b></div>
              <div><span>Oy boshida (R)</span><b>{money(card.baseR)}</b></div>
            </div>
          </section>

          <section className="client-grid">
            <div className="panel">
              <div className="panel-head"><h3>Izohlar</h3><span>{card.notes.length} ta</span></div>
              <div className="note-new">
                <textarea
                  ref={inputRef}
                  value={text}
                  rows={2}
                  placeholder="Mijoz bilan nima gaplashildi? Enter: saqlash, Shift+Enter: yangi qator"
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitNote(); } }}
                />
                <button className="btn primary" disabled={!text.trim() || busy} onClick={submitNote}>Saqlash</button>
              </div>
              <ul className="timeline">
                {card.notes.map((n) => (
                  <li key={n.id}>
                    <div className="tl-meta">{dateTime(n.at)}{n.author && ` · ${n.author}`}</div>
                    <div className="tl-text">{n.text}</div>
                  </li>
                ))}
                {!card.notes.length && <li className="muted">Hali izoh yozilmagan.</li>}
              </ul>
            </div>

            <div className="side-col">
              <div className="panel">
                <div className="panel-head"><h3>Status tarixi</h3></div>
                <ul className="timeline compact">
                  {card.history.map((h) => (
                    <li key={h.id} style={{ ['--c' as string]: STATUS_BY_KEY[h.status]?.color }}>
                      <div className="tl-text"><i className="dot" />{STATUS_BY_KEY[h.status]?.label ?? h.status}{h.promiseDate && ` · ${h.promiseDate.split('-').reverse().join('.')}`}</div>
                      <div className="tl-meta">{dateTime(h.at)}{h.author && ` · ${h.author}`}</div>
                    </li>
                  ))}
                  {!card.history.length && <li className="muted">Status belgilanmagan.</li>}
                </ul>
              </div>

              <div className="panel">
                <div className="panel-head"><h3>Ma'lumotlar</h3><span>Excel'dan</span></div>
                <dl className="details">
                  {card.headers.map((h, i) => {
                    const v = card.cells[i];
                    if (SHOWN.has(i) || v === '' || v == null) return null;
                    return (
                      <div key={i}>
                        <dt>{h}</dt>
                        <dd>{typeof v === 'number' && MONEY.has(i) ? money(v) : String(v)}</dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            </div>
          </section>
        </>
      )}
    </>
  );
}
