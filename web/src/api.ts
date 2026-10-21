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

export interface Client {
  contract: string;
  client: string;
  phone: string;
  overdueDays: string | number;
  baseQ: number;
  baseR: number;
  q: number;
  r: number;
  paid: boolean;
  closed: boolean;
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
