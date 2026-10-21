import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { api, type Client, type Status } from '../api';
import { useLiveUpdates } from '../chartKit';
import { dateTime, money, periodLabel } from '../format';
import { STATUS, STATUS_BY_KEY } from '../statuses';
import { addNote, saveStatus } from './clientApi';
import { PageHead } from './Shell';
import { StatusSelect } from './StatusSelect';
import { Empty, Icon, useToast } from './ui';

type ColKey = 'branch' | 'contract' | 'client' | 'status' | 'promiseDate' | 'note' | 'q' | 'r' | 'paidSum';
type Tab = 'all' | 'none' | Status;
type Sort = { key: ColKey; dir: 1 | -1 } | null;
type Filters = Partial<Record<ColKey, Set<string>>>;

const EMPTY = "(Bo'sh)";
const UNSET = '(Belgilanmagan)';
const fmtDate = (d: string | null) => (d ? d.split('-').reverse().join('.') : '');

const COLS: { key: ColKey; label: string; num?: boolean; sortValue: (c: Client) => string | number; text: (c: Client) => string }[] = [
  { key: 'branch', label: 'Filial', sortValue: (c) => c.branch, text: (c) => c.branch || EMPTY },
  { key: 'contract', label: 'Shartnoma raqami', sortValue: (c) => c.contract, text: (c) => c.contract || EMPTY },
  { key: 'client', label: 'Mijoz', sortValue: (c) => c.client, text: (c) => c.client || EMPTY },
  { key: 'status', label: 'Status', sortValue: (c) => (c.status ? STATUS.findIndex((s) => s.key === c.status) : 99), text: (c) => (c.status ? STATUS_BY_KEY[c.status].label : UNSET) },
  { key: 'promiseDate', label: 'Muhlat sana', sortValue: (c) => c.promiseDate ?? '9999', text: (c) => fmtDate(c.promiseDate) || EMPTY },
  { key: 'note', label: 'Izoh', sortValue: (c) => c.note?.at ?? '', text: (c) => c.note?.text || EMPTY },
  { key: 'q', label: "Grafik bo'yicha (Q)", num: true, sortValue: (c) => c.q, text: (c) => money(c.q) },
  { key: 'r', label: 'Portfel (R)', num: true, sortValue: (c) => c.r, text: (c) => money(c.r) },
  { key: 'paidSum', label: "To'langan", num: true, sortValue: (c) => c.paidSum, text: (c) => money(c.paidSum) },
];
const COL = Object.fromEntries(COLS.map((c) => [c.key, c])) as Record<ColKey, (typeof COLS)[number]>;
const PAGE = 300;

// Kept between visits so coming back from a client card restores the same view.
const saved: { tab: Tab; q: string; filters: Filters; sort: Sort } = { tab: 'all', q: '', filters: {}, sort: null };

const digits = (s: string) => s.replace(/\D/g, '');

/** The employee's clients as an editable, filterable spreadsheet. */
export function Clients({ onOpen }: { onOpen: (contract: string) => void }) {
  const toast = useToast();
  const [period, setPeriod] = useState('');
  const [clients, setClients] = useState<Client[] | null>(null);
  const [tab, setTab] = useState<Tab>(saved.tab);
  const [q, setQ] = useState(saved.q);
  const [filters, setFilters] = useState<Filters>(saved.filters);
  const [sort, setSort] = useState<Sort>(saved.sort);
  const [limit, setLimit] = useState(PAGE);
  const [popover, setPopover] = useState<{ key: ColKey; rect: DOMRect } | null>(null);
  const [noteEdit, setNoteEdit] = useState<{ contract: string; text: string } | null>(null);
  const [focusDate, setFocusDate] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => { Object.assign(saved, { tab, q, filters, sort }); }, [tab, q, filters, sort]);

  const load = useCallback(() => {
    api<{ periods: string[] }>('/api/periods')
      .then(async (r) => {
        const p = r.periods[0];
        setPeriod(p ?? '');
        if (!p) return setClients([]);
        const res = await api<{ clients: Client[] }>(`/api/clients?period=${p}`);
        setClients(res.clients);
      })
      .catch((e) => toast(e.message, 'err'));
  }, [toast]);
  useEffect(load, [load]);
  useLiveUpdates(load);

  useEffect(() => {
    if (!focusDate) return;
    tableRef.current?.querySelector<HTMLInputElement>(`input[data-date="${CSS.escape(focusDate)}"]`)?.showPicker?.();
    setFocusDate(null);
  }, [focusDate, clients]);

  const patch = (contract: string, p: Partial<Client>) =>
    setClients((list) => list && list.map((c) => (c.contract === contract ? { ...c, ...p } : c)));

  async function changeStatus(c: Client, status: Status | null, promiseDate: string | null = c.promiseDate) {
    const prev = { status: c.status, promiseDate: c.promiseDate };
    const next = { status, promiseDate: status === 'muhlat' ? promiseDate : null };
    patch(c.contract, next);
    try {
      await saveStatus(c.contract, next.status, next.promiseDate);
      if (status === 'muhlat' && !next.promiseDate) setFocusDate(c.contract);
    } catch (e) {
      patch(c.contract, prev);
      toast((e as Error).message, 'err');
    }
  }

  async function saveNote() {
    if (!noteEdit) return;
    const { contract, text } = noteEdit;
    if (!text.trim()) return setNoteEdit(null);
    try {
      const { note } = await addNote(contract, text);
      patch(contract, { note: { text: note.text, at: note.at } });
      setNoteEdit(null);
      toast('Izoh saqlandi');
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  }

  // Search and tab first; column filters on top of that.
  const base = useMemo(() => {
    const s = q.trim().toLowerCase();
    const d = digits(s);
    return (clients ?? []).filter((c) => {
      if (tab === 'none' ? c.status : tab !== 'all' && c.status !== tab) return false;
      if (!s) return true;
      return c.client.toLowerCase().includes(s) || c.contract.toLowerCase().includes(s) || (d.length >= 3 && digits(c.phone).includes(d));
    });
  }, [clients, q, tab]);

  const applyFilters = useCallback((list: Client[], skip?: ColKey) =>
    list.filter((c) => COLS.every((col) => col.key === skip || !filters[col.key] || filters[col.key]!.has(col.text(c)))), [filters]);

  const rows = useMemo(() => {
    const list = applyFilters(base);
    if (!sort) return list;
    const f = COL[sort.key].sortValue;
    return [...list].sort((a, b) => {
      const x = f(a), y = f(b);
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'uz')) * sort.dir;
    });
  }, [base, applyFilters, sort]);

  useEffect(() => setLimit(PAGE), [tab, q, filters, sort]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: clients?.length ?? 0, none: 0 };
    for (const c of clients ?? []) m[c.status ?? 'none'] = (m[c.status ?? 'none'] ?? 0) + 1;
    return m;
  }, [clients]);

  const activeFilters = Object.keys(filters).length;
  const statusChip = filters.status;
  const toggleChip = (label: string) => {
    const all = new Set([UNSET, ...STATUS.map((s) => s.label)]);
    const cur = new Set(statusChip ?? []);
    if (cur.has(label)) cur.delete(label); else cur.add(label);
    setFilters((f) => {
      const n = { ...f };
      if (!cur.size || cur.size === all.size) delete n.status; else n.status = cur;
      return n;
    });
  };

  if (clients && !clients.length) {
    return (
      <>
        <PageHead title="Mijozlar" />
        <Empty icon="people" title="Mijozlar yo'q" text="Hozircha sizga biriktirilgan mijoz yo'q. Excel'dagi X ustunida ismingiz bo'lsa, mijozlar shu yerda chiqadi." />
      </>
    );
  }

  const tabs: { key: Tab; label: string; color?: string }[] = [
    { key: 'all', label: 'Hammasi' },
    { key: 'none', label: 'Belgilanmagan', color: '#5D6C96' },
    ...STATUS.map((s) => ({ key: s.key as Tab, label: s.short, color: s.color })),
  ];

  return (
    <>
      <nav className="status-tabs" aria-label="Status bo'limlari">
        {tabs.map((t) => (
          <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)} style={t.color ? ({ '--c': t.color } as CSSProperties) : undefined}>
            {t.color && <i />}{t.label}<small>{counts[t.key] ?? 0}</small>
          </button>
        ))}
      </nav>

      <PageHead title={tabs.find((t) => t.key === tab)!.label === 'Hammasi' ? 'Mijozlar' : `Mijozlar · ${tabs.find((t) => t.key === tab)!.label}`}
        sub={period ? `${periodLabel(period)} · ${money(rows.length)} ta ko'rsatilmoqda` : 'Yuklanmoqda…'} />

      <section className="panel sheet-panel">
        <div className="sheet-bar">
          <label className="search">
            <Icon name="search" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Shartnoma, ism yoki telefon raqam" />
            {q && <button className="icon-btn sm" onClick={() => setQ('')} aria-label="Tozalash"><Icon name="close" size={14} /></button>}
          </label>
          <div className="chips" role="group" aria-label="Status bo'yicha filtr">
            {STATUS.map((s) => (
              <button key={s.key} className={statusChip?.has(s.label) ? 'on' : ''} style={{ '--c': s.color } as CSSProperties} onClick={() => toggleChip(s.label)}>
                <i />{s.short}
              </button>
            ))}
          </div>
          {(activeFilters > 0 || sort) && (
            <button className="btn ghost sm" onClick={() => { setFilters({}); setSort(null); }}>
              <Icon name="close" size={14} />Filtrlarni tozalash{activeFilters ? ` (${activeFilters})` : ''}
            </button>
          )}
        </div>

        <div className="sheet-wrap" ref={tableRef}>
          <table className="sheet clients-sheet">
            <thead>
              <tr className="names">
                <th className="rn">#</th>
                {COLS.map((col) => (
                  <th key={col.key} className={`${col.num ? 'num' : ''} col-${col.key}`}>
                    <div className="th-in">
                      <span>{col.label}</span>
                      <button
                        className={`filter-btn ${filters[col.key] || sort?.key === col.key ? 'on' : ''}`}
                        aria-label={`${col.label} bo'yicha filtr`}
                        onClick={(e) => setPopover({ key: col.key, rect: e.currentTarget.getBoundingClientRect() })}
                      >
                        {sort?.key === col.key ? (sort.dir > 0 ? '↑' : '↓') : <Icon name="filter" size={13} />}
                      </button>
                    </div>
                  </th>
                ))}
                <th className="act" />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((c, i) => {
                const editing = noteEdit?.contract === c.contract;
                return (
                  <tr key={c.contract} className={c.paid ? 'paid' : ''}>
                    <td className="rn">{i + 1}</td>
                    <td className="col-branch" title={c.branch}>{c.branch}</td>
                    <td className="mono">{c.contract}</td>
                    <td className="col-client"><button className="name-btn" onClick={() => onOpen(c.contract)} title="Mijoz kartasini ochish">{c.client}</button></td>
                    <td className="col-status"><StatusSelect value={c.status} onChange={(s) => changeStatus(c, s)} /></td>
                    <td className="col-date">
                      {c.status === 'muhlat' && (
                        <input type="date" className="date-input" data-date={c.contract} value={c.promiseDate ?? ''}
                          onChange={(e) => changeStatus(c, 'muhlat', e.target.value || null)} />
                      )}
                    </td>
                    <td className={`col-note ${editing ? 'editing' : ''}`} title={c.note ? `${c.note.text}\n${dateTime(c.note.at)}` : ''}>
                      {editing ? (
                        <NoteInput value={noteEdit.text} onChange={(text) => setNoteEdit({ contract: c.contract, text })} onSave={saveNote} onCancel={() => setNoteEdit(null)} />
                      ) : c.note ? (
                        <span className="note-line">{c.note.text}<small>{dateTime(c.note.at)}</small></span>
                      ) : <span className="faint">—</span>}
                    </td>
                    <td className="num">{c.paid ? <span className="paid-mark"><Icon name="check" size={12} />0</span> : money(c.q)}</td>
                    <td className="num">{money(c.r)}</td>
                    <td className={`num ${c.paidSum ? 'green-text' : 'faint'}`}>{money(c.paidSum)}</td>
                    <td className="act">
                      <button className="icon-btn sm note-btn" title="Yangi izoh yozish" onClick={() => setNoteEdit({ contract: c.contract, text: '' })}>
                        <Icon name="edit" size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {clients && !rows.length && <div className="sheet-empty muted">Bu filtrlar bo'yicha mijoz topilmadi.</div>}
        </div>
        <div className="sheet-foot">
          <span className="muted">{money(Math.min(limit, rows.length))} / {money(rows.length)} ta qator</span>
          {rows.length > limit && <button className="btn ghost sm" onClick={() => setLimit(limit + PAGE)}>Yana {PAGE} ta</button>}
        </div>
      </section>

      {popover && (
        <FilterPopover
          col={COL[popover.key]}
          rect={popover.rect}
          rows={applyFilters(base, popover.key)}
          selected={filters[popover.key]}
          sort={sort?.key === popover.key ? sort.dir : 0}
          onSort={(dir) => { setSort(dir ? { key: popover.key, dir } : null); setPopover(null); }}
          onApply={(set) => {
            setFilters((f) => {
              const n = { ...f };
              if (set) n[popover.key] = set; else delete n[popover.key];
              return n;
            });
            setPopover(null);
          }}
          onClose={() => setPopover(null)}
        />
      )}
    </>
  );
}

function NoteInput({ value, onChange, onSave, onCancel }: { value: string; onChange: (v: string) => void; onSave: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <input
      ref={ref}
      className="cell-input note-input"
      value={value}
      placeholder="Yangi izoh… (Enter: saqlash, Esc: bekor)"
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); onSave(); }
        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      }}
      onBlur={() => !value.trim() && onCancel()}
    />
  );
}

/** Sheets-style column menu: sort, search the column's values, tick the ones to show. */
function FilterPopover({ col, rect, rows, selected, sort, onSort, onApply, onClose }: {
  col: (typeof COLS)[number]; rect: DOMRect; rows: Client[]; selected?: Set<string>; sort: number;
  onSort: (dir: 1 | -1 | 0) => void; onApply: (set: Set<string> | undefined) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const values = useMemo(() => {
    const m = new Map<string, { count: number; key: string | number }>();
    for (const c of rows) {
      const t = col.text(c);
      const e = m.get(t);
      if (e) e.count++; else m.set(t, { count: 1, key: col.sortValue(c) });
    }
    return [...m].sort((a, b) => {
      const x = a[1].key, y = b[1].key;
      return typeof x === 'number' && typeof y === 'number' ? x - y : String(a[0]).localeCompare(String(b[0]), 'uz');
    });
  }, [rows, col]);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(selected ?? values.map(([v]) => v)));
  const [search, setSearch] = useState('');
  const shown = values.filter(([v]) => v.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const t = setTimeout(() => document.addEventListener('mousedown', onDown));
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const width = 280;
  const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
  const top = Math.min(rect.bottom + 6, window.innerHeight - 420);

  return (
    <div className="filter-pop" ref={ref} style={{ left, top, width }} role="dialog" aria-label={`${col.label} filtri`}>
      <div className="fp-sort">
        <button className={sort === 1 ? 'on' : ''} onClick={() => onSort(sort === 1 ? 0 : 1)}>{col.num ? '0 → 9' : 'A → Z'} saralash</button>
        <button className={sort === -1 ? 'on' : ''} onClick={() => onSort(sort === -1 ? 0 : -1)}>{col.num ? '9 → 0' : 'Z → A'} saralash</button>
      </div>
      <label className="search fp-search"><Icon name="search" size={14} /><input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Qiymatlardan qidirish" /></label>
      <div className="fp-links">
        <button onClick={() => setChecked(new Set([...checked, ...shown.map(([v]) => v)]))}>Hammasini tanlash</button>
        <button onClick={() => { const n = new Set(checked); shown.forEach(([v]) => n.delete(v)); setChecked(n); }}>Tozalash</button>
      </div>
      <div className="fp-list">
        {shown.map(([v, { count }]) => (
          <label key={v}>
            <input type="checkbox" checked={checked.has(v)} onChange={() => { const n = new Set(checked); if (n.has(v)) n.delete(v); else n.add(v); setChecked(n); }} />
            <span>{v}</span><small>{count}</small>
          </label>
        ))}
        {!shown.length && <p className="muted">Topilmadi</p>}
      </div>
      <div className="fp-foot">
        <button className="btn ghost sm" onClick={onClose}>Bekor</button>
        <button className="btn primary sm" onClick={() => onApply(values.every(([v]) => checked.has(v)) ? undefined : checked)}>OK</button>
      </div>
    </div>
  );
}
