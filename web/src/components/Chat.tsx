import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { api, ApiError, type ChatMessage, type Conversation, type User } from '../api';
import { useChatEvents, type ChatEvent } from '../live';
import { Confirm, Icon, Modal, useToast } from './ui';

const MAX_MB = 50;
const time = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const sizeLabel = (n: number) => (n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const initials = (name: string) => name.split(' ').slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase();

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Bugun';
  if (same(d, y)) return 'Kecha';
  return d.toLocaleDateString('ru-RU');
}

function lastPreview(m: ChatMessage | null) {
  if (!m) return 'Hali xabar yo\'q';
  if (m.text) return m.text;
  if (!m.file) return '';
  return m.file.mime.startsWith('image/') ? '🖼 Rasm' : m.file.mime.startsWith('video/') ? '🎬 Video' : `📎 ${m.file.name}`;
}

/** Uploads with progress (fetch cannot report upload progress). */
function sendMessage(cid: string, text: string, file: File | null, onProgress: (p: number) => void): Promise<ChatMessage> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/chat/c/${cid}/messages`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      const data = JSON.parse(xhr.responseText || '{}');
      if (xhr.status >= 400) reject(new ApiError(xhr.status, data.error ?? 'Xatolik yuz berdi.'));
      else resolve(data.message);
    };
    xhr.onerror = () => reject(new ApiError(0, "Server bilan aloqa yo'q."));
    const fd = new FormData();
    fd.append('text', text);
    if (file) fd.append('file', file);
    xhr.send(fd);
  });
}

/** Telegram-style chat: the general room and a private conversation with every user. */
export function Chat({ me, cid, onOpen }: { me: User; cid: string | null; onOpen: (cid: string | null) => void }) {
  const toast = useToast();
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [search, setSearch] = useState('');

  const loadConvs = useCallback(() => {
    api<{ conversations: Conversation[] }>('/api/chat/conversations').then((r) => setConvs(r.conversations)).catch((e) => toast(e.message, 'err'));
  }, [toast]);
  useEffect(loadConvs, [loadConvs]);

  // On wide screens open the general room straight away.
  useEffect(() => {
    if (!cid && window.matchMedia('(min-width: 961px)').matches) onOpen('general');
  }, [cid, onOpen]);

  const toCid = useCallback((channel: string) => {
    if (channel === 'general') return 'general';
    const [, a, b] = channel.split(':').map(Number);
    return `u${a === me.id ? b : a}`;
  }, [me.id]);

  const refreshTimer = useRef(0);
  useChatEvents(() => { clearTimeout(refreshTimer.current); refreshTimer.current = window.setTimeout(loadConvs, 300); });

  const sorted = useMemo(() => {
    const s = search.trim().toLowerCase();
    const list = convs.filter((c) => !s || c.title.toLowerCase().includes(s));
    // The general room stays on top; private chats follow, latest first.
    const general = list.filter((c) => c.kind === 'general');
    const direct = list.filter((c) => c.kind !== 'general')
      .sort((a, b) => (b.last?.id ?? 0) - (a.last?.id ?? 0) || a.title.localeCompare(b.title));
    return [...general, ...direct];
  }, [convs, search]);
  const active = convs.find((c) => c.channel === cid) ?? null;

  return (
    <div className={`chat ${cid ? 'has-active' : ''}`}>
      <aside className="chat-list">
        <div className="chat-list-head">
          <h2>Chat</h2>
          <label className="search"><Icon name="search" size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Qidirish" /></label>
        </div>
        <div className="chat-items">
          {sorted.map((c) => (
            <button key={c.channel} className={`chat-item ${c.channel === cid ? 'on' : ''}`} onClick={() => onOpen(c.channel)}>
              <span className={`chat-ava ${c.kind === 'general' ? 'general' : c.role === 'admin' ? 'admin' : ''}`}>
                {c.kind === 'general' ? <Icon name="users" size={18} /> : initials(c.title)}
              </span>
              <span className="chat-item-main">
                <span className="chat-item-top">
                  <b>{c.title}</b>
                  {c.last && <small>{time(c.last.at)}</small>}
                </span>
                <span className="chat-item-bottom">
                  <span className="preview">{c.last && c.kind === 'general' && c.last.userId !== me.id ? `${c.last.author.split(' ')[0]}: ` : ''}{c.last?.userId === me.id ? 'Siz: ' : ''}{lastPreview(c.last)}</span>
                  {c.unread > 0 && <span className="badge-count">{c.unread}</span>}
                </span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      {active ? (
        <Conversation key={active.channel} me={me} conv={active} toCid={toCid} onBack={() => onOpen(null)} onActivity={loadConvs} />
      ) : (
        <section className="chat-main chat-empty">
          <Icon name="message" size={34} />
          <p className="muted">Suhbatni tanlang</p>
        </section>
      )}
    </div>
  );
}

function Conversation({ me, conv, toCid, onBack, onActivity }: {
  me: User; conv: Conversation; toCid: (channel: string) => string; onBack: () => void; onActivity: () => void;
}) {
  const toast = useToast();
  const cid = conv.channel;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [audience, setAudience] = useState(1);
  const [readsOf, setReadsOf] = useState<ChatMessage | null>(null);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const [toDelete, setToDelete] = useState<ChatMessage | null>(null);
  const [preview, setPreview] = useState<ChatMessage | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const stick = useRef(true); // keep the view pinned to the newest message
  const keepFrom = useRef<number | null>(null); // scrollHeight before prepending older messages
  const readUpTo = useRef(0);

  const merge = (list: ChatMessage[]) => setMessages((cur) => {
    const m = new Map(cur.map((x) => [x.id, x]));
    for (const x of list) m.set(x.id, x);
    return [...m.values()].sort((a, b) => a.id - b.id);
  });

  const loadLatest = useCallback(async () => {
    const r = await api<{ messages: ChatMessage[]; hasMore: boolean; audience: number }>(`/api/chat/c/${cid}/messages`);
    merge(r.messages);
    setAudience(r.audience);
    return r;
  }, [cid]);

  useEffect(() => {
    stick.current = true;
    loadLatest().then((r) => setHasMore(r.hasMore)).catch((e) => toast(e.message, 'err'));
    input.current?.focus();
  }, [loadLatest, toast]);

  useChatEvents((e: ChatEvent) => {
    if (e.channel !== '*' && toCid(e.channel) !== cid) return;
    if (e.kind === 'delete') setMessages((cur) => cur.filter((m) => m.id !== e.id));
    else {
      const el = scroller.current;
      stick.current = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      loadLatest().catch(() => {});
    }
  });

  async function loadOlder() {
    const first = messages[0];
    if (!first) return;
    keepFrom.current = scroller.current?.scrollHeight ?? null;
    const r = await api<{ messages: ChatMessage[]; hasMore: boolean }>(`/api/chat/c/${cid}/messages?before=${first.id}`);
    stick.current = false;
    merge(r.messages);
    setHasMore(r.hasMore);
  }

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (keepFrom.current !== null) { el.scrollTop = el.scrollHeight - keepFrom.current; keepFrom.current = null; }
    else if (stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Mark as read what is on screen.
  useEffect(() => {
    const last = messages.at(-1);
    if (!last || last.id <= readUpTo.current || document.visibilityState !== 'visible') return;
    readUpTo.current = last.id;
    api(`/api/chat/c/${cid}/read`, { method: 'POST', body: { lastId: last.id } })
      .then(() => { window.dispatchEvent(new Event('chat:read')); onActivity(); })
      .catch(() => {});
  }, [messages, cid, onActivity]);

  function addFiles(list: FileList | File[] | null) {
    const arr = [...(list ?? [])];
    const big = arr.find((f) => f.size > MAX_MB * 1024 * 1024);
    if (big) toast(`«${big.name}» ${MAX_MB} MB dan katta.`, 'err');
    setFiles((cur) => [...cur, ...arr.filter((f) => f.size <= MAX_MB * 1024 * 1024)].slice(0, 10));
    input.current?.focus();
  }

  async function submit() {
    const body = text.trim();
    if (editing) {
      if (!body && !editing.file) return;
      try {
        const r = await api<{ message: ChatMessage }>(`/api/chat/messages/${editing.id}`, { method: 'PATCH', body: { text: body } });
        merge([r.message]);
        setEditing(null);
        setText('');
      } catch (e) {
        toast((e as Error).message, 'err');
      }
      return;
    }
    if (!body && !files.length) return;
    stick.current = true;
    try {
      if (!files.length) {
        merge([await sendMessage(cid, body, null, () => {})]);
      } else {
        // The caption goes with the first file, like Telegram.
        for (const [i, f] of files.entries()) {
          setProgress(0);
          merge([await sendMessage(cid, i === 0 ? body : '', f, setProgress)]);
        }
      }
      setText('');
      setFiles([]);
      onActivity();
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setProgress(null);
      input.current?.focus();
    }
  }

  const startEdit = (m: ChatMessage) => { setEditing(m); setText(m.text); setFiles([]); setTimeout(() => input.current?.focus()); };
  const onPaste = (e: ClipboardEvent) => { if (e.clipboardData.files.length) { e.preventDefault(); addFiles(e.clipboardData.files); } };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); };

  // Auto-grow the textarea.
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  let lastDay = '';
  return (
    <section
      className={`chat-main ${drag ? 'drag' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={(e) => e.currentTarget === e.target && setDrag(false)}
      onDrop={onDrop}
    >
      <header className="chat-head">
        <button className="icon-btn chat-back" onClick={onBack} aria-label="Orqaga"><Icon name="back" /></button>
        <span className={`chat-ava ${conv.kind === 'general' ? 'general' : conv.role === 'admin' ? 'admin' : ''}`}>
          {conv.kind === 'general' ? <Icon name="users" size={18} /> : initials(conv.title)}
        </span>
        <div>
          <b>{conv.title}</b>
          <span className="muted">{conv.kind === 'general' ? 'Barcha xodimlar va rahbariyat' : conv.role === 'admin' ? 'Rahbar' : 'Xodim'}</span>
        </div>
      </header>

      <div className="chat-scroll" ref={scroller}>
        {hasMore && <button className="btn ghost sm older" onClick={loadOlder}>Oldingi xabarlar</button>}
        {messages.map((m) => {
          const mine = m.userId === me.id;
          const day = dayLabel(m.at);
          const sep = day !== lastDay ? <div className="day-sep"><span>{day}</span></div> : null;
          lastDay = day;
          return (
            <div key={m.id}>
              {sep}
              <div className={`msg ${mine ? 'mine' : ''} ${editing?.id === m.id ? 'editing' : ''}`}>
                <div className="bubble">
                  {!mine && conv.kind === 'general' && <div className="msg-author">{m.author}</div>}
                  {m.file && <Attachment m={m} onOpen={() => setPreview(m)} />}
                  {m.text && <div className="msg-text">{m.text}</div>}
                  <div className="msg-meta">
                    {m.editedAt && 'tahrirlangan · '}{time(m.at)}
                    {mine && <Ticks m={m} audience={audience} general={conv.kind === 'general'} onClick={() => setReadsOf(m)} />}
                  </div>
                </div>
                {mine && (
                  <div className="msg-actions">
                    <button className="icon-btn sm" title="Tahrirlash" onClick={() => startEdit(m)}><Icon name="edit" size={14} /></button>
                    <button className="icon-btn sm danger" title="O'chirish" onClick={() => setToDelete(m)}><Icon name="trash" size={14} /></button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {!messages.length && <div className="chat-hello muted">Hali xabar yo'q. Birinchi bo'lib yozing!</div>}
      </div>

      <footer className="composer">
        {editing && (
          <div className="composer-bar">
            <Icon name="edit" size={15} />
            <span><b>Tahrirlash</b>{editing.text ? ` · ${editing.text.slice(0, 80)}` : ''}</span>
            <button className="icon-btn sm" onClick={() => { setEditing(null); setText(''); }} aria-label="Bekor qilish"><Icon name="close" size={14} /></button>
          </div>
        )}
        {files.length > 0 && (
          <div className="composer-files">
            {files.map((f, i) => (
              <span key={i} className="file-chip">
                <Icon name="file" size={14} />{f.name}<small>{sizeLabel(f.size)}</small>
                <button onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="Olib tashlash"><Icon name="close" size={12} /></button>
              </span>
            ))}
          </div>
        )}
        {progress !== null && <div className="upload-progress"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
        <div className="composer-row">
          {!editing && (
            <>
              <button className="icon-btn" title="Fayl, rasm yoki video biriktirish" onClick={() => fileInput.current?.click()}><Icon name="clip" size={20} /></button>
              <input ref={fileInput} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            </>
          )}
          <textarea
            ref={input}
            rows={1}
            value={text}
            placeholder="Xabar yozing…"
            onChange={(e) => setText(e.target.value)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
              if (e.key === 'Escape' && editing) { setEditing(null); setText(''); }
            }}
          />
          <button className="send-btn" onClick={submit} disabled={progress !== null || (!text.trim() && !files.length && !editing?.file)} aria-label="Yuborish">
            <Icon name={editing ? 'check' : 'sendArrow'} size={20} />
          </button>
        </div>
      </footer>

      {drag && <div className="drop-hint"><Icon name="upload" size={30} />Faylni shu yerga tashlang</div>}

      {toDelete && (
        <Confirm title="Xabarni o'chirish" text="Xabar hamma uchun o'chiriladi." onClose={() => setToDelete(null)}
          onOk={async () => {
            await api(`/api/chat/messages/${toDelete.id}`, { method: 'DELETE' }).catch((e) => { toast(e.message, 'err'); throw e; });
            setMessages((cur) => cur.filter((m) => m.id !== toDelete.id));
            onActivity();
          }} />
      )}
      {readsOf && <Reads m={readsOf} general={conv.kind === 'general'} onClose={() => setReadsOf(null)} />}
      {preview?.file && (
        <div className="lightbox" onClick={() => setPreview(null)} role="dialog" aria-label={preview.file.name}>
          <img src={`/api/files/${preview.file.id}`} alt={preview.file.name} />
          <a className="btn ghost sm" href={`/api/files/${preview.file.id}?download`} onClick={(e) => e.stopPropagation()}><Icon name="download" size={14} />Yuklab olish</a>
        </div>
      )}
    </section>
  );
}

function Attachment({ m, onOpen }: { m: ChatMessage; onOpen: () => void }) {
  const f = m.file!;
  const url = `/api/files/${f.id}`;
  if (/^image\/(png|jpeg|gif|webp)$/.test(f.mime)) {
    return <button className="att-image" onClick={onOpen}><img src={url} alt={f.name} loading="lazy" /></button>;
  }
  if (/^video\/(mp4|webm|quicktime|ogg)$/.test(f.mime)) return <video className="att-video" src={url} controls preload="metadata" />;
  if (f.mime.startsWith('audio/')) return <audio className="att-audio" src={url} controls preload="metadata" />;
  return (
    <a className="att-file" href={`${url}?download`}>
      <span className="att-ico"><Icon name="download" size={18} /></span>
      <span><b>{f.name}</b><small>{sizeLabel(f.size)}</small></span>
    </a>
  );
}

/** ✓ sent, ✓✓ read; in the general room also how many have read it. */
function Ticks({ m, audience, general, onClick }: { m: ChatMessage; audience: number; general: boolean; onClick: () => void }) {
  const read = m.readCount > 0;
  const all = read && m.readCount >= audience;
  const label = read ? (general ? `${m.readCount} kishi o'qidi` : "O'qildi") : "Yuborildi, hali o'qilmagan";
  return (
    <button className={`ticks ${read ? 'read' : ''} ${all ? 'all' : ''}`} onClick={onClick} title={label} aria-label={label}>
      <Icon name={read ? 'checks' : 'check'} size={15} />
      {general && read && <span>{m.readCount}</span>}
    </button>
  );
}

function Reads({ m, general, onClose }: { m: ChatMessage; general: boolean; onClose: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<{ read: { userId: number; name: string; at: string }[]; unread: { userId: number; name: string }[] } | null>(null);
  const load = useCallback(() => {
    api<NonNullable<typeof data>>(`/api/chat/messages/${m.id}/reads`).then(setData).catch((e) => { toast(e.message, 'err'); onClose(); });
  }, [m.id, toast, onClose]);
  useEffect(load, [load]);
  useChatEvents((e) => e.kind === 'read' && load());
  const when = (iso: string) => `${dayLabel(iso)}, ${time(iso)}`;
  return (
    <Modal title={general ? "Kim o'qidi" : "O'qilganlik"} onClose={onClose}>
      {m.text && <p className="reads-quote">{m.text.length > 140 ? `${m.text.slice(0, 140)}…` : m.text}</p>}
      {!data ? <p className="muted">Yuklanmoqda…</p> : (
        <div className="reads">
          <h4><Icon name="checks" size={15} />O'qiganlar · {data.read.length}</h4>
          <ul>
            {data.read.map((r) => (
              <li key={r.userId}><span className="chat-ava sm">{initials(r.name)}</span><b>{r.name}</b><small>{when(r.at)}</small></li>
            ))}
            {!data.read.length && <li className="muted">Hali hech kim o'qimagan.</li>}
          </ul>
          {data.unread.length > 0 && (
            <>
              <h4 className="dim"><Icon name="check" size={15} />O'qimaganlar · {data.unread.length}</h4>
              <ul className="dim">
                {data.unread.map((u) => <li key={u.userId}><span className="chat-ava sm">{initials(u.name)}</span><b>{u.name}</b></li>)}
              </ul>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
