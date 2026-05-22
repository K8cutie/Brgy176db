import { useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import { formatPeso, type ParetoItem } from '@/lib/analyticsEngine';

interface ParetoChartProps {
  data: ParetoItem[];
  title: string;
  subtitle?: string;
  height?: number;
  onItemClick?: (item: ParetoItem) => void;
  selectedItem?: string;
}

interface TooltipPayload {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

interface TooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

function ParetoTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const barData = payload.find(p => p.dataKey === 'amount');
  const lineData = payload.find(p => p.dataKey === 'cumulativePercent');

  return (
    <div className="bg-white dark:bg-dm-surface rounded-lg shadow-lg border border-parchment dark:border-dm-border px-3 py-2 min-w-[180px]">
      <p className="body-xs font-semibold text-charcoal dark:text-dm-text mb-1">{label}</p>
      {barData && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: barData.color }} />
            <span className="body-xs text-warm-gray dark:text-dm-text-muted">Amount</span>
          </div>
          <span className="body-xs font-mono font-medium text-charcoal dark:text-dm-text">{formatPeso(barData.value)}</span>
        </div>
      )}
      {lineData && (
        <div className="flex items-center justify-between gap-3 mt-0.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-deep-navy dark:bg-gold" />
            <span className="body-xs text-warm-gray dark:text-dm-text-muted">Cumulative</span>
          </div>
          <span className="body-xs font-mono font-medium text-deep-navy dark:text-gold">{lineData.value.toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}

/* ── 80% reference line ── */
const EIGHTY_PERCENT_Y = 80;

export default function ParetoChart({
  data,
  title,
  subtitle,
  height = 340,
  onItemClick,
  selectedItem,
}: ParetoChartProps) {
  const chartData = useMemo(() => data.map(d => ({
    ...d,
    name: d.name.length > 14 ? d.name.slice(0, 13) + '…' : d.name,
    fullName: d.name,
    amount: d.amount,
    cumulativePercent: Math.round(d.cumulativePercent * 10) / 10,
  })), [data]);

  const totalAmount = useMemo(() => data.reduce((s, d) => s + d.amount, 0), [data]);
  const vitalFew = useMemo(() => {
    let cumulative = 0;
    let count = 0;
    for (const d of data) {
      cumulative += d.percent;
      count++;
      if (cumulative >= 80) break;
    }
    return count;
  }, [data]);

  return (
    <div>
      <div className="mb-1">
        <h3 className="heading-md text-charcoal dark:text-dm-text">{title}</h3>
        {subtitle && <p className="body-xs text-warm-gray dark:text-dm-text-muted">{subtitle}</p>}
      </div>

      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-4 mb-3 p-2.5 bg-cream-dark/30 dark:bg-dm-surface-raised/30 rounded-lg">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-deep-navy dark:bg-gold" />
          <span className="body-xs text-charcoal dark:text-dm-text">
            <strong>{vitalFew}</strong> of {data.length} categories = <strong>80%</strong> of spending
          </span>
        </div>
        <div className="body-xs text-warm-gray dark:text-dm-text-muted">
          Total: {formatPeso(totalAmount)}
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={chartData} barCategoryGap="15%">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(140,131,116,0.12)" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              interval={0}
              angle={-20}
              textAnchor="end"
              height={60}
              axisLine={{ stroke: 'rgba(140,131,116,0.2)' }}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              tickFormatter={v => '₱' + (v / 1000).toFixed(0) + 'K'}
              axisLine={false}
              width={55}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              tickFormatter={v => v + '%'}
              axisLine={false}
              width={40}
            />
            <Tooltip content={<ParetoTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              formatter={(value) => value === 'amount' ? 'Amount' : 'Cumulative %'}
            />
            {/* 80% reference line */}
            <line
              x1="0" y1="0" x2="0" y2="0"
              stroke="rgba(184,50,47,0.3)"
              strokeDasharray="4 4"
            />
            {/* Bars */}
            <Bar
              yAxisId="left"
              dataKey="amount"
              name="Amount"
              radius={[4, 4, 0, 0]}
              onClick={(_, index) => onItemClick?.(data[index])}
              style={{ cursor: onItemClick ? 'pointer' : 'default' }}
            >
              {chartData.map((entry, i) => (
                <Cell
                  key={`cell-${i}`}
                  fill={entry.code === selectedItem ? entry.color : entry.color + (selectedItem && entry.code !== selectedItem ? '50' : 'CC')}
                />
              ))}
            </Bar>
            {/* Cumulative line */}
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="cumulativePercent"
              name="Cumulative %"
              stroke="#1A1A2E"
              strokeWidth={2.5}
              dot={{ r: 4, fill: '#1A1A2E', strokeWidth: 0 }}
              activeDot={{ r: 6, fill: '#C9963B' }}
              strokeDasharray="0"
            />
            {/* 80% reference */}
            <Line
              yAxisId="right"
              dataKey={() => EIGHTY_PERCENT_Y}
              stroke="#B8322F"
              strokeDasharray="5 5"
              strokeWidth={1}
              dot={false}
              activeDot={false}
              name="80% threshold"
            />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[200px] flex items-center justify-center">
          <p className="body-sm text-warm-gray dark:text-dm-text-muted">No data available</p>
        </div>
      )}
    </div>
  );
}
