export type Role = 'admin' | 'xodim';

export interface User {
  id: number;
  first_name: string;
  last_name: string;
  login: string;
  role: Role;
}

export interface Dashboard {
  period: string;
  uploads: number;
  lastUploadAt: string | null;
  cards: {
    startSum: number;
    startCount: number;
    currentSum: number;
    currentCount: number;
    returnedSum: number;
    returnedCount: number;
    paidSum: number;
  };
  charts: { days: number[]; hours: number[]; months: { period: string; amount: number }[] };
}

export interface UploadInfo {
  id: number;
  filename: string;
  period: string;
  kind: 'baseline' | 'update';
  uploaded_at: string;
  uploaded_by: string;
  row_count: number;
  r_sum: number;
  headers?: string[];
}

export interface SheetRow {
  id: number;
  row_no: number;
  matched: boolean;
  cells: (string | number)[];
}

export interface Note { id: number; text: string; at: string; author: string }

export interface Client {
  contract: string;
  branch: string;
  client: string;
  phone: string;
  overdueDays: string | number;
  baseQ: number;
  baseR: number;
  q: number;
  r: number;
  paidSum: number;
  paid: boolean;
  closed: boolean;
  status: Status | null;
  promiseDate: string | null;
  note: { text: string; at: string } | null;
}

export interface ClientCard {
  contract: string;
  headers: string[];
  cells: (string | number)[];
  q: number;
  r: number;
  baseQ: number;
  baseR: number;
  paidSum: number;
  paid: boolean;
  closed: boolean;
  status: Status | null;
  promiseDate: string | null;
  notes: Note[];
  history: { id: number; status: Status; promiseDate: string | null; at: string; author: string }[];
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const opts: RequestInit = { method: init.method ?? 'GET', credentials: 'same-origin' };
  if (init.body instanceof FormData) opts.body = init.body;
  else if (init.body !== undefined) {
    opts.body = JSON.stringify(init.body);
    opts.headers = { 'content-type': 'application/json' };
  }
  let res: Response;
  try {
    res = await fetch(url, opts);
  } catch {
    throw new ApiError(0, "Server bilan aloqa yo'q. Internetni tekshiring.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth/')) window.dispatchEvent(new Event('auth:expired'));
    throw new ApiError(res.status, data.error ?? 'Xatolik yuz berdi.');
  }
  return data as T;
}

export type Status = 'muhlat' | 'boglanmadi' | 'uchinchi' | 'telegram' | 'sms' | 'muammoli' | 'tolandi';

export interface TeamSeries { payments: number[]; exits: number[] }

export interface TeamRow {
  id: number;
  name: string;
  talked: number;
  statuses: Record<Status, number>;
  notTalked: number;
  assigned: number;
  exitCount: number;
  exitQ: number;
  exitR: number;
  paid: number;
  series: TeamSeries;
}

export interface TeamReport {
  scope: 'today' | 'all';
  period: string;
  date: string;
  buckets: number;
  total: { talked: number; statuses: Record<Status, number>; series: TeamSeries };
  rows: TeamRow[];
}

export interface ChatFile { id: number; name: string; mime: string; size: number }

export interface ChatMessage {
  id: number;
  userId: number | null;
  author: string;
  text: string;
  at: string;
  editedAt: string | null;
  file: ChatFile | null;
  /** How many people (other than the author) have read it. */
  readCount: number;
}

export interface Conversation {
  channel: string;
  title: string;
  kind: 'general' | 'direct';
  role?: Role;
  last: ChatMessage | null;
  unread: number;
}
