import {
  BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip,
} from 'chart.js';
import { compact, money } from './format';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler, Tooltip, Legend);
ChartJS.defaults.font.family = 'Inter, system-ui, sans-serif';
ChartJS.defaults.color = '#8B9AC4';
ChartJS.defaults.plugins.legend.display = false; // charts that need one turn it on

const GRID = 'rgba(148,170,230,.08)';

export const moneyTooltip = { callbacks: { label: (ctx: { parsed: { y: number | null } }) => ` ${money(ctx.parsed.y ?? 0)} so'm` } };

/** Y axis for money; an all-zero series still gets a readable 0 … 1 mln scale. */
export function moneyAxis(values: number[]) {
  return {
    grid: { color: GRID }, border: { display: false }, beginAtZero: true,
    suggestedMax: values.some((v) => v > 0) ? undefined : 1_000_000,
    ticks: { callback: (v: string | number) => compact(Number(v)) },
  };
}

/** Y axis for counts of clients: whole numbers only. */
export function countAxis(values: number[], extra: object = {}) {
  return {
    grid: { color: GRID }, border: { display: false }, beginAtZero: true,
    suggestedMax: values.some((v) => v > 0) ? undefined : 5,
    ticks: { precision: 0 }, ...extra,
  };
}

export const xAxis = { grid: { display: false }, border: { display: false } };

export function gradient(top: string, bottom: string) {
  return ({ chart }: { chart: ChartJS }) => {
    if (!chart.chartArea) return top;
    const g = chart.ctx.createLinearGradient(0, chart.chartArea.top, 0, chart.chartArea.bottom);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    return g;
  };
}

export { useLiveUpdates } from './live';
