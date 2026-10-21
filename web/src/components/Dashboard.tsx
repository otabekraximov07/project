import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  BarElement, CategoryScale, Chart as ChartJS, Filler, LinearScale, LineElement, PointElement, Tooltip,
  type ChartData, type ChartOptions,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { api, type Dashboard as DashboardData, type User } from '../api';
import { compact, dateTime, money, percent, periodLabel } from '../format';
import { PageHead } from './Shell';
import { Empty, Icon, useToast, type IconName } from './ui';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler, Tooltip);
ChartJS.defaults.font.family = 'Inter, system-ui, sans-serif';
ChartJS.defaults.color = '#8B9AC4';

export function Dashboard({ user, onUpload }: { user: User; onUpload?: () => void }) {
  const toast = useToast();
  const [periods, setPeriods] = useState<string[] | null>(null);
  const [period, setPeriod] = useState('');
  const [employees, setEmployees] = useState<User[]>([]);
  const [userId, setUserId] = useState('');
  const [data, setData] = useState<DashboardData | null>(null);
  const isAdmin = user.role === 'admin';

  useEffect(() => {
    api<{ periods: string[] }>('/api/periods').then((r) => {
      setPeriods(r.periods);
      setPeriod(r.periods[0] ?? '');
    }).catch((e) => toast(e.message, 'err'));
    if (isAdmin) api<{ employees: User[] }>('/api/employees').then((r) => setEmployees(r.employees)).catch(() => {});
  }, [isAdmin, toast]);

  useEffect(() => {
    if (!period) return;
    const qs = new URLSearchParams({ period, ...(userId ? { userId } : {}) });
    api<DashboardData>(`/api/dashboard?${qs}`).then(setData).catch((e) => toast(e.message, 'err'));
  }, [period, userId, toast]);

  if (periods && !periods.length) {
    return (
      <>
        <PageHead title="Asosiy oyna" />
        <Empty icon="upload" title="Hali ma'lumot yo'q" text={isAdmin
          ? "Portfel ko'rinishi uchun Ma'lumot yuklash bo'limiga oy boshidagi Excel faylni yuklang."
          : "Rahbariyat portfel faylini yuklagach, sizga biriktirilgan mijozlar shu yerda ko'rinadi."}>
          {onUpload && <button className="btn primary" onClick={onUpload}><Icon name="upload" />Ma'lumot yuklash</button>}
        </Empty>
      </>
    );
  }

  const c = data?.cards;
  return (
    <>
      <PageHead
        title="Asosiy oyna"
        sub={data?.lastUploadAt ? `Oxirgi yangilanish: ${dateTime(data.lastUploadAt)} · ${data.uploads} ta fayl` : 'Yuklanmoqda…'}
      >
        {isAdmin && (
          <select className="select" value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="Xodim">
            <option value="">Barcha xodimlar</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.last_name} {e.first_name}</option>)}
          </select>
        )}
        <select className="select" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Oy">
          {(periods ?? []).map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}
        </select>
      </PageHead>

      <section className="cards">
        <StatCard i={0} icon="wallet" label="Oy boshiga portfel" value={c?.startSum} unit="so'm" sub="R ustuni yig'indisi" />
        <StatCard i={1} icon="people" label="Mijozlar soni" value={c?.startCount} unit="ta" sub="Oy boshidagi" />
        <StatCard i={2} icon="pulse" label="Joriy portfel" value={c?.currentSum} unit="so'm"
          sub={c ? `${money(c.currentCount)} ta joriy mijoz` : ''} />
        <StatCard i={3} icon="return" label="Qaytgan portfel" value={c?.returnedSum} unit="so'm" tone="gold"
          sub={c ? `Portfelning ${percent(c.returnedSum, c.startSum)} qismi` : ''} />
        <StatCard i={4} icon="checkCircle" label="100% to'lagan mijozlar" value={c?.returnedCount} unit="ta" tone="green"
          sub={c ? `Mijozlarning ${percent(c.returnedCount, c.startCount)} qismi` : ''} />
      </section>

      {data && <Charts data={data} />}
    </>
  );
}

function useCountUp(target: number | undefined, run: boolean) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (target === undefined || !run) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return setV(target);
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 1100);
      setV(target * (1 - Math.pow(1 - k, 4)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, run]);
  return v;
}

function StatCard({ i, icon, label, value, unit, sub, tone }: {
  i: number; icon: IconName; label: string; value?: number; unit: string; sub: string; tone?: 'gold' | 'green';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const [touched, setTouched] = useState(false);
  const shown = useCountUp(value, seen);

  // Reveal when the card scrolls into view.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setSeen(true), io.disconnect()), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Spotlight follows the pointer.
  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    ref.current!.style.setProperty('--mx', `${e.clientX - r.left}px`);
    ref.current!.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  return (
    <div
      ref={ref}
      className={`stat ${tone ?? ''} ${seen ? 'in' : ''} ${touched ? 'touch' : ''}`}
      style={{ '--i': i } as CSSProperties}
      onPointerMove={onMove}
      onTouchStart={() => { setTouched(true); setTimeout(() => setTouched(false), 600); }}
    >
      <div className="stat-top">
        <span className="stat-ico"><Icon name={icon} /></span>
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-value"><span>{value === undefined ? '—' : money(shown)}</span><small>{unit}</small></div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
}

const GRID = 'rgba(148,170,230,.08)';
const moneyTooltip = { callbacks: { label: (ctx: { parsed: { y: number | null } }) => ` ${money(ctx.parsed.y ?? 0)} so'm` } };
const axes = {
  x: { grid: { display: false }, border: { display: false } },
  y: { grid: { color: GRID }, border: { display: false }, beginAtZero: true, ticks: { callback: (v: string | number) => compact(Number(v)) } },
};

function gradient(top: string, bottom: string) {
  return ({ chart }: { chart: ChartJS }) => {
    if (!chart.chartArea) return top;
    const g = chart.ctx.createLinearGradient(0, chart.chartArea.top, 0, chart.chartArea.bottom);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    return g;
  };
}

function Charts({ data }: { data: DashboardData }) {
  const { days, hours, months } = data.charts;
  const total = (a: number[]) => a.reduce((s, x) => s + x, 0);

  const barOpts: ChartOptions<'bar'> = {
    responsive: true, maintainAspectRatio: false, animation: { duration: 900, easing: 'easeOutQuart' },
    plugins: { tooltip: moneyTooltip }, scales: axes,
  };
  const lineOpts: ChartOptions<'line'> = {
    responsive: true, maintainAspectRatio: false, animation: { duration: 900, easing: 'easeOutQuart' },
    plugins: { tooltip: moneyTooltip }, scales: axes, elements: { line: { tension: 0.35 } },
  };

  const daily: ChartData<'bar'> = {
    labels: days.map((_, i) => String(i + 1)),
    datasets: [{ data: days, backgroundColor: gradient('#5B9BFF', 'rgba(91,155,255,.15)'), borderRadius: 6, maxBarThickness: 22 }],
  };
  const monthly: ChartData<'line'> = {
    labels: months.map((m) => periodLabel(m.period, true)),
    datasets: [{
      data: months.map((m) => m.amount), fill: true, borderColor: '#E2BE6E', borderWidth: 2,
      backgroundColor: gradient('rgba(226,190,110,.35)', 'rgba(226,190,110,0)'), pointBackgroundColor: '#E2BE6E', pointRadius: 3,
    }],
  };
  const hourly: ChartData<'bar'> = {
    labels: hours.map((_, h) => `${String(h).padStart(2, '0')}:00`),
    datasets: [{ data: hours, backgroundColor: gradient('#39D0E0', 'rgba(57,208,224,.12)'), borderRadius: 5, maxBarThickness: 18 }],
  };

  return (
    <section className="charts">
      <div className="panel chart wide">
        <div className="panel-head"><h3>To'lovlar: kunlar bo'yicha</h3><span>{periodLabel(data.period)} · {money(total(days))} so'm</span></div>
        <div className="chart-box"><Bar data={daily} options={barOpts} /></div>
      </div>
      <div className="panel chart">
        <div className="panel-head"><h3>Oylar bo'yicha</h3><span>So'nggi 12 oy</span></div>
        <div className="chart-box"><Line data={monthly} options={lineOpts} /></div>
      </div>
      <div className="panel chart">
        <div className="panel-head"><h3>Kun soatlari bo'yicha</h3><span>{money(total(hours))} so'm</span></div>
        <div className="chart-box"><Bar data={hourly} options={barOpts} /></div>
      </div>
    </section>
  );
}
