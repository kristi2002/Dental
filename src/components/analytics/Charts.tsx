'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export type Point = { label: string; value: number };

const AXIS = {
  stroke: 'var(--color-ink-faint)',
  fontSize: 13,
  fontWeight: 600,
} as const;

const GRID_COLOR = 'var(--color-line)';

const tooltipStyle = {
  border: '2px solid var(--color-ink)',
  borderRadius: 8,
  background: 'var(--color-surface)',
  color: 'var(--color-ink)',
  fontWeight: 600,
} as const;

export function MonthlyBars({ data, name }: { data: Point[]; name: string }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={GRID_COLOR} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID_COLOR }} />
        <YAxis
          allowDecimals={false}
          tick={AXIS}
          tickLine={false}
          axisLine={{ stroke: GRID_COLOR }}
        />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--color-brand-soft)' }} />
        <Bar dataKey="value" name={name} fill="var(--color-brand)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MonthlyLine({ data, name }: { data: Point[]; name: string }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={GRID_COLOR} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID_COLOR }} />
        <YAxis
          allowDecimals={false}
          tick={AXIS}
          tickLine={false}
          axisLine={{ stroke: GRID_COLOR }}
        />
        <Tooltip contentStyle={tooltipStyle} />
        <Line
          type="monotone"
          dataKey="value"
          name={name}
          stroke="var(--color-ok)"
          strokeWidth={3}
          dot={{ r: 5, fill: 'var(--color-ok)' }}
          activeDot={{ r: 7 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function HorizontalBars({ data, name }: { data: Point[]; name: string }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 46)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
        <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
        <XAxis
          type="number"
          allowDecimals={false}
          tick={AXIS}
          tickLine={false}
          axisLine={{ stroke: GRID_COLOR }}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={150}
          tick={AXIS}
          tickLine={false}
          axisLine={{ stroke: GRID_COLOR }}
        />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--color-brand-soft)' }} />
        <Bar dataKey="value" name={name} fill="var(--color-brand)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StatusDonut({ data }: { data: Array<Point & { color: string }> }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          innerRadius={55}
          outerRadius={95}
          paddingAngle={2}
          stroke="var(--color-surface)"
          strokeWidth={2}
        >
          {data.map((entry) => (
            <Cell key={entry.label} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
      </PieChart>
    </ResponsiveContainer>
  );
}
