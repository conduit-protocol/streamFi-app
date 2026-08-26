'use client';

import { useMemo, useState } from 'react';
import { fromStroops, formatTimestamp } from '@/lib/format';

export interface StreamFlowChartProps {
  startTime: number;
  endTime: number;
  ratePerSecond: bigint;
  withdrawn: bigint;
  withdrawable: bigint;
  paused: boolean;
  pausedAt?: number;
  cancelled?: boolean;
  tokenSymbol?: string;
  width?: number;
  height?: number;
}

interface DataPoint {
  time: number;
  amount: bigint;
  isPausedPoint: boolean;
  x: number;
  y: number;
}

export function StreamFlowChart({
  startTime,
  endTime,
  ratePerSecond,
  withdrawn,
  withdrawable,
  paused,
  pausedAt = 0,
  cancelled = false,
  tokenSymbol = 'tokens',
  width = 600,
  height = 200,
}: StreamFlowChartProps) {
  const [hoverPoint, setHoverPoint] = useState<DataPoint | null>(null);

  const padding = { top: 20, right: 30, bottom: 30, left: 50 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  const chartData = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const start = startTime > 0 ? startTime : now - 86400;
    const end = endTime > 0 ? endTime : start + 86400 * 7;
    const effectiveEnd = Math.max(end, start + 3600);

    const totalSeconds = effectiveEnd - start;
    const numPoints = 20;
    const step = totalSeconds / (numPoints - 1);

    const rawPoints: Array<{ time: number; amount: bigint; isPausedPoint: boolean }> = [];

    for (let i = 0; i < numPoints; i++) {
      const time = Math.round(start + i * step);
      let activeTime = 0;

      if (cancelled) {
        activeTime = 0;
      } else if (paused && pausedAt > 0) {
        const pauseTime = Math.min(pausedAt, effectiveEnd);
        activeTime = Math.max(0, Math.min(time, pauseTime) - start);
      } else {
        const currentTime = Math.min(time, now, effectiveEnd);
        activeTime = Math.max(0, currentTime - start);
      }

      const amount = BigInt(Math.floor(activeTime)) * ratePerSecond;
      const isPausedPoint = paused && pausedAt > 0 && time >= pausedAt;

      rawPoints.push({ time, amount, isPausedPoint });
    }

    const maxAmount = rawPoints.reduce(
      (max, p) => (p.amount > max ? p.amount : max),
      withdrawn + withdrawable > 0n ? withdrawn + withdrawable : 1n,
    );

    const points: DataPoint[] = rawPoints.map((p, index) => {
      const xRatio = index / (numPoints - 1);
      const yRatio = maxAmount > 0n ? Number((p.amount * 1000n) / maxAmount) / 1000 : 0;

      const x = padding.left + xRatio * graphWidth;
      const y = padding.top + graphHeight - yRatio * graphHeight;

      return { ...p, x, y };
    });

    return { points, maxAmount, start, end: effectiveEnd };
  }, [startTime, endTime, ratePerSecond, withdrawn, withdrawable, paused, pausedAt, cancelled, graphWidth, graphHeight, padding.left, padding.top]);

  const { points, maxAmount, start, end } = chartData;

  const pathD = useMemo(() => {
    if (points.length === 0) return '';
    return points.reduce(
      (acc, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`),
      '',
    );
  }, [points]);

  const areaD = useMemo(() => {
    if (points.length === 0 || !points[0] || !points[points.length - 1]) return '';
    const firstX = points[0]!.x;
    const lastX = points[points.length - 1]!.x;
    const bottomY = padding.top + graphHeight;
    return `${pathD} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [pathD, points, padding.top, graphHeight]);

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
          Stream Flow Trajectory
        </span>
        <span className="text-xs font-mono text-gray-400">
          Max: {fromStroops(maxAmount)} {tokenSymbol}
        </span>
      </div>

      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible"
          onMouseLeave={() => setHoverPoint(null)}
        >
          <defs>
            {/* #313 correction — COLOR_ACTIVE/COLOR_PAUSED were rgb(59 130 246)
                (blue-500) / rgb(245 158 11) (amber-500): still banned hues,
                just spelled as rgb() instead of hex. The "Paused" tooltip
                label already conveys that state, so the chart itself stays
                black/white per the design system regardless of status. */}
            <linearGradient id="streamFlowGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" className="text-black dark:text-white" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.0" className="text-black dark:text-white" />
            </linearGradient>
          </defs>

          {/* Grid Y lines */}
          {[0, 0.5, 1].map((r) => {
            const y = padding.top + graphHeight * r;
            return (
              <line
                key={r}
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="currentColor"
                className="text-gray-200 dark:text-gray-800"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
            );
          })}

          {/* Area Fill */}
          <path d={areaD} fill="url(#streamFlowGradient)" />

          {/* Flow Line */}
          <path
            d={pathD}
            fill="none"
            stroke="currentColor"
            className="text-black dark:text-white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Interactive Data Points */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={hoverPoint?.x === p.x ? 5 : 3}
              fill="currentColor"
              stroke="#ffffff"
              strokeWidth="1.5"
              className="cursor-pointer transition-all duration-150 text-black dark:text-white"
              onMouseEnter={() => setHoverPoint(p)}
            />
          ))}

          {/* X-Axis labels */}
          <text
            x={padding.left}
            y={height - 8}
            className="text-[10px] fill-gray-400 font-mono"
            textAnchor="start"
          >
            {formatTimestamp(start)}
          </text>
          <text
            x={width - padding.right}
            y={height - 8}
            className="text-[10px] fill-gray-400 font-mono"
            textAnchor="end"
          >
            {formatTimestamp(end)}
          </text>
        </svg>

        {/* Tooltip Overlay */}
        {hoverPoint && (
          <div
            className="absolute z-20 pointer-events-none rounded-lg bg-gray-900 text-white text-xs px-3 py-1.5 shadow-lg border border-gray-700 font-mono"
            style={{
              left: `${(hoverPoint.x / width) * 100}%`,
              top: `${(hoverPoint.y / height) * 100}%`,
              transform: 'translate(-50%, -120%)',
            }}
          >
            <div className="font-semibold text-gray-300">
              {formatTimestamp(hoverPoint.time)}
            </div>
            <div>
              {fromStroops(hoverPoint.amount)} {tokenSymbol}
            </div>
            {hoverPoint.isPausedPoint && (
              <div className="text-gray-400 text-[10px]">Paused</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
