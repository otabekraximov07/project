import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChartData, ChartOptions } from 'chart.js';
import { Bar, Chart } from 'react-chartjs-2';
import { api, type TeamReport, type TeamRow, type TeamSeries } from '../api';
import { countAxis, gradient, moneyAxis, useLiveUpdates, xAxis } from '../chartKit';
import { money, percent, periodLabel } from '../format';
import { StatCard } from './Dashboard';
import { PageHead } from './Shell';
import { STATUS } from '../statuses';
import { Icon, useToast } from './ui';

type Scope = 'today' | 'all';

/** The "Xodimlar" view: live results of every employee. */
export function Team() {
  const toast = useToast();
  const [scope, setScope] = useState<Scope>('today');
  const [periods, setPeriods] = useState<string[]>([]);
  const [period, setPeriod] = useState('');
  const [data, setData] = useState<TeamReport | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const loadPeriods = useCallback(() => {
    api<{ periods: string[] }>('/api/periods').then((r) => {
      setPeriods(r.periods);
      setPeriod((p) => (p && r.periods.includes(p) ? p : r.periods[0] ?? ''));
    }).catch((e) => toast(e.message, 'err'));
  }, [toast]);

  const load = useCallback(() => {
    const qs = new URLSearchParams({ scope, ...(period ? { period } : {}) });
    api<TeamReport>(`/api/team?${qs}`)
      .then((r) => { setData(r); setUpdatedAt(new Date()); })
      .catch((e) => toast(e.message, 'err'));
  }, [scope, period, toast]);

  useEffect(loadPeriods, [loadPeriods]);
  useEffect(load, [load]);
  useLiveUpdates(() => { loadPeriods(); load(); });

  const pick = (id: number) => {
    setSelected((s) => (s === id ? null : id));
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const t = data?.total;
  const sel = data?.rows.find((r) => r.id === selected) ?? null;
  const sum = (f: (r: TeamRow) => number) => (data?.rows ?? []).reduce((a, r) => a + f(r), 0);

  return (
    <>
      <PageHead
        title="Xodimlar"
        sub={<span className="live"><i />Jonli{updatedAt && ` · ${updatedAt.toLocaleTimeString('ru-RU')} da yangilandi`}</span>}
      >
        {scope === 'all' && periods.length > 0 && (
          <select className="select" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Oy">
            {periods.map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}
          </select>
        )}
      </PageHead>

      <div className="seg" role="tablist" aria-label="Davr">
        <button role="tab" aria-selected={scope === 'today'} className={scope === 'today' ? 'on' : ''} onClick={() => setScope('today')}>Bugungi holat</button>
        <button role="tab" aria-selected={scope === 'all'} className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>Umumiy holat</button>
      </div>

      <section className="cards cards-4" key={scope}>
        <StatCard i={0} icon="phone" label="Gaplashilgan mijozlar" value={t?.talked} unit="ta" accent="var(--gold)" gold primary
          sub={scope === 'today' ? 'Bugun' : data ? periodLabel(data.period) : ''} />
        {STATUS.map((s, i) => (
          <StatCard key={s.key} i={i + 1} icon={s.icon} label={s.label} value={t?.statuses[s.key]} unit="ta" accent={s.color}
            sub={t ? `Gaplashilganlarning ${percent(t.statuses[s.key], t.talked)}` : ''} />
        ))}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Hisobot jadvali</h3>
          <span>Xodim ismini bosing: pastda uning diagrammasi ochiladi</span>
        </div>
        <div className="table-wrap">
          <table className="table team-table">
            <thead>
              <tr>
                <th>Xodim</th>
                <th className="num">Gaplashgan</th>
                {STATUS.map((s) => <th key={s.key} className="num"><span className="dot" style={{ background: s.color }} />{s.short}</th>)}
                <th className="num">Q qaytdi</th>
                <th className="num">Portfel qaytdi</th>
                <th className="num">100% to'lagan</th>
                <th className="num">Gaplashilmagan</th>
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((r) => (
                <tr key={r.id} className={r.id === selected ? 'sel' : ''}>
                  <td><button className="name-btn" onClick={() => pick(r.id)}>{r.name}</button></td>
                  <td className="num strong">{money(r.talked)}</td>
                  {STATUS.map((s) => <td key={s.key} className={`num ${r.statuses[s.key] ? '' : 'zero'}`}>{r.statuses[s.key]}</td>)}
                  <td className="num">{money(r.exitQ)}</td>
                  <td className="num gold-text">{money(r.exitR)}</td>
                  <td className="num">{r.exitCount}</td>
                  <td className={`num ${r.notTalked ? 'warn-text' : 'zero'}`}>{r.notTalked}</td>
                </tr>
              ))}
              {data && !data.rows.length && (
                <tr><td colSpan={13} className="muted center">Hali xodim qo'shilmagan. Foydalanuvchilar bo'limida "Xodim" rolida qo'shing.</td></tr>
              )}
            </tbody>
            {data && data.rows.length > 1 && (
              <tfoot>
                <tr>
                  <td>Jami</td>
                  <td className="num">{money(sum((r) => r.talked))}</td>
                  {STATUS.map((s) => <td key={s.key} className="num">{sum((r) => r.statuses[s.key])}</td>)}
                  <td className="num">{money(sum((r) => r.exitQ))}</td>
                  <td className="num gold-text">{money(sum((r) => r.exitR))}</td>
                  <td className="num">{sum((r) => r.exitCount)}</td>
                  <td className="num">{sum((r) => r.notTalked)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {data && (
        <section className="team-bottom" ref={detailRef}>
          <Detail data={data} row={sel} onClear={() => setSelected(null)} />
          <Leaders rows={data.rows} selected={selected} onPick={pick} />
        </section>
      )}
    </>
  );
}

function Detail({ data, row, onClear }: { data: TeamReport; row: TeamRow | null; onClear: () => void }) {
  const series: TeamSeries = row ? row.series : data.total.series;
  const statuses = row ? row.statuses : data.total.statuses;
  const labels = Array.from({ length: data.buckets }, (_, i) => (data.scope === 'today' ? `${String(i).padStart(2, '0')}:00` : String(i + 1)));

  const flow = {
    labels,
    datasets: [
      {
        type: 'bar' as const, label: "To'lov", data: series.payments, yAxisID: 'y',
        backgroundColor: gradient('#5B9BFF', 'rgba(91,155,255,.15)'), borderRadius: 5, maxBarThickness: 20, order: 2,
      },
      {
        type: 'line' as const, label: 'Chiqish', data: series.exits, yAxisID: 'y1', order: 1,
        borderColor: '#E2BE6E', backgroundColor: '#E2BE6E', borderWidth: 2, pointRadius: 3, tension: 0.35,
      },
    ],
  } as ChartData<'bar' | 'line'>;
  const flowOpts: ChartOptions<'bar' | 'line'> = {
    responsive: true, maintainAspectRatio: false, animation: { duration: 700 }, interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: true, position: 'top', align: 'end', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } },
      tooltip: { callbacks: { label: (c) => (c.dataset.yAxisID === 'y1' ? ` Chiqish: ${c.parsed.y} ta mijoz` : ` To'lov: ${money(c.parsed.y ?? 0)} so'm`) } },
    },
    scales: {
      x: xAxis,
      y: moneyAxis(series.payments),
      y1: countAxis(series.exits, { position: 'right', grid: { display: false } }),
    },
  };

  const byStatus: ChartData<'bar'> = {
    labels: STATUS.map((s) => s.short),
    datasets: [{ data: STATUS.map((s) => statuses[s.key]), backgroundColor: STATUS.map((s) => s.color), borderRadius: 6, maxBarThickness: 22 }],
  };
  const statusValues = STATUS.map((s) => statuses[s.key]);
  const statusOpts: ChartOptions<'bar'> = {
    indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: { duration: 700 },
    plugins: { tooltip: { callbacks: { label: (c) => ` ${c.parsed.x} ta mijoz` } } },
    scales: { x: countAxis(statusValues), y: { grid: { display: false }, border: { display: false } } },
  };

  return (
    <div className="panel detail">
      <div className="panel-head">
        <h3>{row ? row.name : 'Barcha xodimlar'}</h3>
        {row ? (
          <button className="btn ghost sm" onClick={onClear}><Icon name="close" size={14} />Hammasini ko'rsatish</button>
        ) : (
          <span>{data.scope === 'today' ? 'Bugun, soatlar bo\'yicha' : `${periodLabel(data.period)}, kunlar bo'yicha`}</span>
        )}
      </div>
      {row && (
        <div className="mini-stats">
          <div><span>Gaplashgan</span><b>{row.talked}</b></div>
          <div><span>Q qaytdi</span><b>{money(row.exitQ)}</b></div>
          <div><span>Portfel qaytdi</span><b className="gold-text">{money(row.exitR)}</b></div>
          <div><span>100% to'lagan</span><b>{row.exitCount}</b></div>
          <div><span>Gaplashilmagan</span><b className={row.notTalked ? 'warn-text' : ''}>{row.notTalked}</b></div>
        </div>
      )}
      <div className="detail-charts">
        <div>
          <h4>To'lov va chiqish</h4>
          <div className="chart-box"><Chart type="bar" data={flow} options={flowOpts} /></div>
        </div>
        <div>
          <h4>Statuslar bo'yicha</h4>
          <div className="chart-box"><Bar data={byStatus} options={statusOpts} /></div>
        </div>
      </div>
    </div>
  );
}

function Leaders({ rows, selected, onPick }: { rows: TeamRow[]; selected: number | null; onPick: (id: number) => void }) {
  const ranked = useMemo(
    () => [...rows].sort((a, b) => b.exitCount - a.exitCount || b.exitR - a.exitR || a.name.localeCompare(b.name)),
    [rows],
  );
  return (
    <div className="panel leaders">
      <div className="panel-head"><h3><Icon name="trophy" size={16} /> Eng ko'p chiqishlar</h3><span>100% to'lagan mijozlar</span></div>
      <ol>
        {ranked.map((r, i) => (
          <li key={r.id} className={`${i < 3 && r.exitCount ? `place p${i + 1}` : ''} ${r.id === selected ? 'sel' : ''}`}>
            <button onClick={() => onPick(r.id)}>
              <span className="rank">{i + 1}</span>
              <span className="who"><b>{r.name}</b><small>{money(r.exitR)} so'm portfel</small></span>
              <span className="score">{r.exitCount}<small>ta</small></span>
            </button>
          </li>
        ))}
      </ol>
      {!rows.length && <p className="muted center">Xodimlar yo'q.</p>}
    </div>
  );
}
