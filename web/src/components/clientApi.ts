import { api, type Note, type Status } from '../api';

const base = (contract: string) => `/api/clients/${encodeURIComponent(contract)}`;

export function saveStatus(contract: string, status: Status | null, promiseDate: string | null) {
  return api<{ status: Status | null; promiseDate: string | null }>(`${base(contract)}/status`, {
    method: 'PUT', body: { status, promiseDate },
  });
}

export function addNote(contract: string, text: string) {
  return api<{ note: Note }>(`${base(contract)}/notes`, { method: 'POST', body: { text } });
}

export const clientCardUrl = base;
