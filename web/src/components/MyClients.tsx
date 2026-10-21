import { useEffect, useMemo, useState } from 'react';
import { api, type Client } from '../api';
import { money, periodLabel } from '../format';
import { PageHead } from './Shell';
import { Empty, Icon, useToast } from './ui';

/** The employee's own clients in their latest known state. */
export function MyClients() {
  const toast = useToast();
  const [periods, setPeriods] = useState<string[]>([]);
  const [period, setPeriod] = useState('');
  const [clients, setClients] = useState<Client[] | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    api<{ periods: string[] }>('/api/periods').then((r) => {
      setPeriods(r.periods);
      if (r.periods[0]) setPeriod(r.periods[0]);
      else setClients([]);
    }).catch((e) => toast(e.message, 'err'));
  }, [toast]);

  useEffect(() => {
    if (!period) return;
    api<{ clients: Client[] }>(`/api/clients?period=${period}`).then((r) => setClients(r.clients)).catch((e) => toast(e.message, 'err'));
  }, [period, toast]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (clients ?? []).filter((c) => !s || `${c.client} ${c.contract} ${c.phone}`.toLowerCase().includes(s));
  }, [clients, q]);

  return (
    <>
      <PageHead title="Mijozlarim" sub={clients ? `${money(clients.length)} ta mijoz · ${money(clients.filter((c) => c.paid).length)} tasi 100% to'lagan` : ''}>
        <label className="search">
          <Icon name="search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ism, shartnoma yoki telefon" />
        </label>
        <select className="select" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Oy">
          {periods.map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}
        </select>
      </PageHead>

      {clients && !clients.length ? (
        <Empty icon="people" title="Mijozlar yo'q" text="Hozircha sizga biriktirilgan mijoz yo'q. Excel'dagi X ustunida ismingiz bo'lsa, mijozlar shu yerda chiqadi." />
      ) : (
        <section className="panel">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Mijoz</th><th>Shartnoma</th><th>Telefon</th><th className="num">Kechikkan kun</th>
                  <th className="num">Grafik bo'yicha qarz (Q)</th><th className="num">Umumiy qarz (R)</th><th>Holat</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.contract}>
                    <td><b>{c.client}</b></td>
                    <td className="mono">{c.contract}</td>
                    <td className="mono">{c.phone}</td>
                    <td className="num">{c.overdueDays}</td>
                    <td className="num">{money(c.q)}</td>
                    <td className="num">{money(c.r)}</td>
                    <td>{c.paid
                      ? <span className="badge green"><Icon name="check" size={13} />100% to'langan</span>
                      : <span className="badge blue">Joriy</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
