'use client';

import { useMemo, useRef, useState } from 'react';
import { fromStroops, toStroops, formatTimestamp } from '@/lib/format';

interface StreamPreviewChartProps {
  /** Total deposit as typed in the form (token units, e.g. "1000"). */
  depositAmount: string;
  /** Stream duration in seconds — coerced because RHF may hold the raw input. */
  durationSeconds: number;
  /** Cliff field value (`datetime-local`), or null/empty when unset. */
  cliffDate?: string | null;
  tokenSymbol: string;
  /** Per-token decimals — never assume 7 (#364). */
  decimals?: number;
}

// viewBox geometry: left gutter carries the balance axis, bottom gutter the
// time axis. The SVG scales fluidly (`w-full h-auto`) so viewBox coordinates
// map linearly onto the rendered box for hover hit-testing.
const W = 640;
const H = 220;
const PAD = { top: 20, right: 16, bottom: 32, left: 76 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/**
 * Interactive projected accrual chart for the create form (#684).
 *
 * Plots how the deposit unlocks before any funds move: flat at zero until
 * the cliff, a vertical jump for everything accrued through the cliff, then
 * the linear slope of the per-second rate. Hover reveals the exact projected
 * balance and date at any point; the always-visible footer restates the
 * rate / total / cliff numbers so no information is hover-only.
 */
export function StreamPreviewChart({
  depositAmount,
  durationSeconds,
  cliffDate,
  tokenSymbol,
  decimals = 7,
}: StreamPreviewChartProps) {
  const [hoverT, setHoverT] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const model = useMemo(() => {
    let depositStroops: bigint;
    try {
      depositStroops = toStroops(depositAmount, decimals);
    } catch {
      return null;
    }
    const duration = Math.floor(Number(durationSeconds));
    if (depositStroops <= 0n || !Number.isFinite(duration) || duration <= 0) {
      return null;
    }
    const rate = depositStroops / BigInt(duration);
    // A rate that truncates to zero would stream nothing — the form blocks
    // submission for it (#243), so there is nothing worth drawing.
    if (rate <= 0n) return null;

    // Cliff offset (seconds from start). The preview anchors "start" at first
    // paint; the real start_time is submit-time + 300 s (#373), close enough
    // for a projection. A cliff outside (0, duration) is ignored.
    let cliffOffset: number | null = null;
    if (cliffDate) {
      const cliffMs = new Date(cliffDate).getTime();
      if (!Number.isNaN(cliffMs)) {
        const offset = Math.floor((cliffMs - Date.now()) / 1000);
        if (offset > 0 && offset < duration) cliffOffset = offset;
      }
    }
    return {
      depositStroops,
      duration,
      rate,
      cliffOffset,
      startSec: Math.floor(Date.now() / 1000),
    };
  }, [depositAmount, durationSeconds, cliffDate, decimals]);

  // All hooks run above; nothing renderable without a valid model.
  if (!model) return null;

  const { depositStroops, duration, rate, cliffOffset, startSec } = model;

  /** Projected unlocked balance `t` seconds into the stream. */
  const balanceAt = (t: number): bigint => {
    const clamped = Math.min(Math.max(Math.floor(t), 0), duration);
    if (cliffOffset !== null && clamped < cliffOffset) return 0n;
    return rate * BigInt(clamped);
  };

  /** viewBox coordinates for a (time, balance) pair. */
  const point = (t: number, b: bigint) => {
    const x = PAD.left + (t / duration) * PLOT_W;
    const ratio = depositStroops > 0n ? Number((b * 10000n) / depositStroops) / 10000 : 0;
    const y = PAD.top + (1 - Math.min(ratio, 1)) * PLOT_H;
    return { x, y };
  };

  const cliffRelease = cliffOffset !== null ? rate * BigInt(cliffOffset) : null;

  // Piecewise path: origin → flat to cliff → vertical unlock jump → slope.
  const linePoints: Array<[number, bigint]> = [[0, 0n]];
  if (cliffOffset !== null && cliffRelease !== null) {
    linePoints.push([cliffOffset, 0n], [cliffOffset, cliffRelease]);
  }
  linePoints.push([duration, rate * BigInt(duration)]);

  const xy = linePoints.map(([t, b]) => point(t, b));
  const linePath = xy
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');
  const baselineY = point(0, 0n).y;
  const last = xy[xy.length - 1]!;
  const areaPath = `${linePath} L ${last.x.toFixed(2)} ${baselineY.toFixed(2)} L ${xy[0]!.x.toFixed(2)} ${baselineY.toFixed(2)} Z`;

  const hover =
    hoverT !== null ? { t: hoverT, ...point(hoverT, balanceAt(hoverT)) } : null;
  const beforeCliff = hoverT !== null && cliffOffset !== null && hoverT < cliffOffset;
  const cliffPoint =
    cliffOffset !== null && cliffRelease !== null ? point(cliffOffset, cliffRelease) : null;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const t = Math.round(((px - PAD.left) / PLOT_W) * duration);
    setHoverT(Math.min(Math.max(t, 0), duration));
  };

  const endLabel = new Date((startSec + duration) * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  const ariaLabel = `Projected balance accrual: ${fromStroops(depositStroops, decimals)} ${tokenSymbol} over ${Math.round(duration / 86400)} days at ${fromStroops(rate * 86400n, decimals)} ${tokenSymbol} per day${
    cliffOffset !== null
      ? `, cliff first unlocks ${fromStroops(cliffRelease!, decimals)} ${tokenSymbol}`
      : ''
  }`;

  return (
    <div
      className="card bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700"
      data-testid="stream-preview-chart"
      role="img"
      aria-label={ariaLabel}
    >
      <div className="mb-2">
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
          Projected balance accrual
        </span>
      </div>

      <div className="relative" onMouseLeave={() => setHoverT(null)}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto cursor-crosshair"
          onMouseMove={handleMouseMove}
          aria-hidden="true"
        >
          {/* Horizontal grid at 0 / 50 / 100 % of the deposit */}
          {[0, 0.5, 1].map((f) => (
            <line
              key={f}
              x1={PAD.left}
              y1={PAD.top + f * PLOT_H}
              x2={W - PAD.right}
              y2={PAD.top + f * PLOT_H}
              strokeWidth={1}
              className="stroke-gray-100 dark:stroke-gray-700"
            />
          ))}

          {/* Axes */}
          <line
            x1={PAD.left}
            y1={baselineY}
            x2={W - PAD.right}
            y2={baselineY}
            strokeWidth={1}
            className="stroke-gray-300 dark:stroke-gray-600"
          />
          <line
            x1={PAD.left}
            y1={PAD.top}
            x2={PAD.left}
            y2={baselineY}
            strokeWidth={1}
            className="stroke-gray-300 dark:stroke-gray-600"
          />

          {/* Projected accrual: area under the curve + the curve itself */}
          <path d={areaPath} className="fill-black/5 dark:fill-white/5" />
          <path
            d={linePath}
            fill="none"
            strokeWidth={2}
            className="stroke-black dark:stroke-white"
          />

          {/* Cliff time marker — the vertical jump in the curve is the unlock */}
          {cliffPoint && (
            <g>
              <line
                x1={cliffPoint.x}
                y1={PAD.top}
                x2={cliffPoint.x}
                y2={baselineY}
                strokeWidth={1}
                strokeDasharray="4 4"
                className="stroke-gray-400 dark:stroke-gray-500"
              />
              <text
                x={cliffPoint.x + 4}
                y={PAD.top + 10}
                fontSize={10}
                className="fill-gray-400 dark:fill-gray-500 font-mono"
              >
                Cliff
              </text>
            </g>
          )}

          {/* Balance axis labels */}
          <text
            x={PAD.left - 6}
            y={PAD.top + 4}
            textAnchor="end"
            fontSize={10}
            className="fill-gray-400 dark:fill-gray-500 font-mono"
          >
            {fromStroops(depositStroops, decimals)}
          </text>
          <text
            x={PAD.left - 6}
            y={baselineY + 4}
            textAnchor="end"
            fontSize={10}
            className="fill-gray-400 dark:fill-gray-500 font-mono"
          >
            0
          </text>

          {/* Time axis labels */}
          <text
            x={PAD.left}
            y={H - 10}
            fontSize={10}
            className="fill-gray-400 dark:fill-gray-500 font-mono"
          >
            Start
          </text>
          <text
            x={W - PAD.right}
            y={H - 10}
            textAnchor="end"
            fontSize={10}
            className="fill-gray-400 dark:fill-gray-500 font-mono"
          >
            {endLabel}
          </text>

          {/* Hover crosshair + focus point */}
          {hover && (
            <g>
              <line
                x1={hover.x}
                y1={PAD.top}
                x2={hover.x}
                y2={baselineY}
                strokeWidth={1}
                strokeDasharray="2 3"
                className="stroke-gray-400 dark:stroke-gray-500"
              />
              <circle
                cx={hover.x}
                cy={hover.y}
                r={4}
                strokeWidth={2}
                className="fill-black stroke-white dark:fill-white dark:stroke-black"
              />
            </g>
          )}
        </svg>
        {/* Hover tooltip — exact balance + date under the cursor */}
        {hover && (
          <div
            data-testid="preview-tooltip"
            className="pointer-events-none absolute z-10 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-[11px] shadow-md"
            style={{
              left: `${(hover.x / W) * 100}%`,
              top: `${(hover.y / H) * 100}%`,
              transform: 'translate(-50%, -130%)',
            }}
          >
            <p className="font-mono font-semibold text-black dark:text-white">
              {fromStroops(balanceAt(hover.t), decimals)} {tokenSymbol}
            </p>
            <p className="text-gray-500 dark:text-gray-400">
              {formatTimestamp(startSec + hover.t)}
            </p>
            {beforeCliff && (
              <p className="text-gray-400 dark:text-gray-500">
                Before cliff — nothing unlocked
              </p>
            )}
          </div>
        )}
      </div>
      {/* Always-visible numbers — the chart must not be the only source of
          these figures (hover-only data fails screen readers). */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
        <span>
          Rate:{' '}
          <span className="font-mono font-semibold text-black dark:text-white">
            {fromStroops(rate * 86400n, decimals)} {tokenSymbol}/day
          </span>
        </span>
        <span>
          Total:{' '}
          <span className="font-mono font-semibold text-black dark:text-white">
            {fromStroops(depositStroops, decimals)} {tokenSymbol}
          </span>
        </span>
        <span>
          {cliffOffset !== null ? (
            <>
              Cliff unlock:{' '}
              <span className="font-mono font-semibold text-black dark:text-white">
                +{fromStroops(cliffRelease!, decimals)} {tokenSymbol}
              </span>
            </>
          ) : (
            'No cliff'
          )}
        </span>
      </div>
    </div>
  );
}