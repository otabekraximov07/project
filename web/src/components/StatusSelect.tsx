import type { CSSProperties } from 'react';
import type { Status } from '../api';
import { STATUS, STATUS_BY_KEY } from '../statuses';

/** Colored status dropdown, like a Sheets data-validation chip. */
export function StatusSelect({ value, onChange, disabled }: { value: Status | null; onChange: (s: Status | null) => void; disabled?: boolean }) {
  const color = value ? STATUS_BY_KEY[value].color : undefined;
  return (
    <select
      className={`status-select ${value ? 'set' : ''}`}
      style={color ? ({ '--c': color } as CSSProperties) : undefined}
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange((e.target.value || null) as Status | null)}
      aria-label="Status"
    >
      <option value="">— Tanlang —</option>
      {STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
    </select>
  );
}
