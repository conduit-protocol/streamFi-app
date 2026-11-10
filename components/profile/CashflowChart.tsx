"use client";

import { useMemo, useState } from "react";
import { fromStroops } from "@/lib/format";
import type { DailyFlow } from "@/lib/profile-analytics";

export type CashflowViewMode = "bars" | "area";

interface CashflowChartProps {
  daily: DailyFlow[];
  initialView?: CashflowViewMode;
}

/**
 * Cashflow chart supporting toggling between daily discrete stacked bars
 * and continuous cumulative volume area chart (#820).
 * Scaled over the trailing 30-day window.
 */
export function CashflowChart({ daily, initialView = "bars" }: CashflowChartProps) {
  const [viewMode, setViewMode] = useState<CashflowViewMode>(initialView);

  const maxDaily = useMemo(() => {
    let m = 0n;
    for (const d of daily) {
      const total = d.incoming + d.outgoing;
      if (total > m) m = total;
    }
    return m > 0n ? m : 1n;
  }, [daily]);

  const cumulativeData = useMemo(() => {
    let accIncoming = 0n;
    let accOutgoing = 0n;
    return daily.map((d) => {
      accIncoming += d.incoming;
      accOutgoing += d.outgoing;
      const total = accIncoming + accOutgoing;
      return {
        ...d,
        cumIncoming: accIncoming,
        cumOutgoing: accOutgoing,
        cumTotal: total,
      };
    });
  }, [daily]);

  const maxCumulative = useMemo(() => {
    const last = cumulativeData[cumulativeData.length - 1];
    const total = last ? last.cumTotal : 0n;
    return total > 0n ? total : 1n;
  }, [cumulativeData]);

  const hasData = daily.some((d) => d.incoming > 0n || d.outgoing > 0n);
  if (!hasData) {
    return (
      <div
        role="status"
        data-testid="cashflow-empty"
        className="flex flex-col items-center justify-center text-center py-10"
      >
        <p className="text-sm font-semibold">No streaming activity yet</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Income vs expenditure will appear here once you send or receive streams.
        </p>
      </div>
    );
  }

  // Pre-calculate SVG path coordinates for Area view (viewBox 0 0 500 144)
  const svgWidth = 500;
  const svgHeight = 144;
  const paddingY = 8;
  const usableHeight = svgHeight - paddingY * 2;
  const numPoints = cumulativeData.length;

  const points = cumulativeData.map((d, index) => {
    const x = numPoints > 1 ? (index / (numPoints - 1)) * svgWidth : svgWidth / 2;
    const totalRatio = Number((d.cumTotal * 1000n) / maxCumulative) / 1000;
    const incomingRatio = Number((d.cumIncoming * 1000n) / maxCumulative) / 1000;
    const totalY = svgHeight - paddingY - totalRatio * usableHeight;
    const incomingY = svgHeight - paddingY - incomingRatio * usableHeight;
    return { x, totalY, incomingY, d };
  });

  const totalAreaPath =
    points.length > 0
      ? `M ${points[0]!.x},${svgHeight} ` +
        points.map((p) => `L ${p.x.toFixed(1)},${p.totalY.toFixed(1)}`).join(" ") +
        ` L ${points[points.length - 1]!.x},${svgHeight} Z`
      : "";

  const totalLinePath =
    points.length > 0
      ? `M ` + points.map((p) => `${p.x.toFixed(1)},${p.totalY.toFixed(1)}`).join(" L ")
      : "";

  const incomingAreaPath =
    points.length > 0
      ? `M ${points[0]!.x},${svgHeight} ` +
        points.map((p) => `L ${p.x.toFixed(1)},${p.incomingY.toFixed(1)}`).join(" ") +
        ` L ${points[points.length - 1]!.x},${svgHeight} Z`
      : "";

  const incomingLinePath =
    points.length > 0
      ? `M ` + points.map((p) => `${p.x.toFixed(1)},${p.incomingY.toFixed(1)}`).join(" L ")
      : "";

  return (
    <div data-testid="cashflow-chart">
      {/* View toggle header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
          {viewMode === "area" ? "Cumulative Volume" : "Daily Cashflow"}
        </span>
        <div
          className="inline-flex rounded border border-gray-200 dark:border-gray-800 p-0.5 text-xs bg-gray-50 dark:bg-gray-900"
          role="group"
          aria-label="Cashflow view toggle"
        >
          <button
            type="button"
            onClick={() => setViewMode("area")}
            className={`px-2.5 py-1 rounded transition-colors text-xs font-medium ${
              viewMode === "area"
                ? "bg-black text-white dark:bg-white dark:text-black shadow-sm"
                : "text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white"
            }`}
            aria-pressed={viewMode === "area"}
            data-testid="toggle-view-area"
          >
            Area
          </button>
          <button
            type="button"
            onClick={() => setViewMode("bars")}
            className={`px-2.5 py-1 rounded transition-colors text-xs font-medium ${
              viewMode === "bars"
                ? "bg-black text-white dark:bg-white dark:text-black shadow-sm"
                : "text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white"
            }`}
            aria-pressed={viewMode === "bars"}
            data-testid="toggle-view-bars"
          >
            Daily Bars
          </button>
        </div>
      </div>

      {viewMode === "bars" ? (
        <div
          className="flex items-end gap-1 h-36"
          role="img"
          aria-label="Daily streaming income versus expenditure over the past 30 days"
          data-testid="cashflow-bars-view"
        >
          {daily.map((d) => {
            const total = d.incoming + d.outgoing;
            const totalPct = total > 0n ? Number((total * 1000n) / maxDaily) / 10 : 0;
            const incomingPct =
              total > 0n ? (Number((d.incoming * 1000n) / total) / 10) * (totalPct / 100) * 100 : 0;
            const outgoingPct = totalPct - incomingPct;
            return (
              <div
                key={d.dayStart}
                className="flex-1 flex flex-col justify-end h-full min-w-0 group relative"
                title={`${d.label} (${new Date(d.dayStart).toISOString()}): +${fromStroops(d.incoming)} in / -${fromStroops(d.outgoing)} out`}
              >
                {/* SVG tooltip indicator for exact timestamp and volume (#764) */}
                <svg className="sr-only" aria-hidden="true">
                  <desc>{`Exact timestamp: ${new Date(d.dayStart).toISOString()}, Volume: ${fromStroops(d.incoming + d.outgoing)}`}</desc>
                </svg>
                <div
                  data-testid={`cashflow-bar-${d.dayStart}`}
                  className="w-full flex flex-col-reverse rounded-sm overflow-hidden"
                  style={{ height: `${Math.max(totalPct, total > 0n ? 4 : 0)}%` }}
                >
                  {outgoingPct > 0 && (
                    <div
                      className="w-full bg-gray-300 dark:bg-gray-600"
                      style={{ height: `${(outgoingPct / totalPct) * 100}%` }}
                    />
                  )}
                  {incomingPct > 0 && (
                    <div
                      className="w-full bg-black dark:bg-white"
                      style={{
                        height: `${(incomingPct / totalPct) * 100}%`,
                        minHeight: d.incoming > 0n ? 2 : 0,
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className="w-full h-36 relative"
          role="img"
          aria-label="Cumulative streaming volume area chart over the past 30 days"
          data-testid="cashflow-area-view"
        >
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            preserveAspectRatio="none"
            className="w-full h-full overflow-visible"
          >
            {/* Expenditure / Total cumulative volume area */}
            <path
              d={totalAreaPath}
              className="text-gray-300 dark:text-gray-700 fill-current opacity-70"
            />
            {/* Income cumulative volume area */}
            <path
              d={incomingAreaPath}
              className="text-black dark:text-white fill-current opacity-85"
            />
            {/* Boundary lines */}
            <path
              d={totalLinePath}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-gray-400 dark:text-gray-500"
            />
            <path
              d={incomingLinePath}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-black dark:text-white"
            />
            {/* Data points for hover and titles */}
            {points.map((p) => (
              <circle
                key={p.d.dayStart}
                cx={p.x}
                cy={p.totalY}
                r="3"
                className="text-black dark:text-white fill-current opacity-80 hover:opacity-100 transition-opacity"
              >
                <title>{`${p.d.label}: Cumulative In: +${fromStroops(p.d.cumIncoming)}, Out: -${fromStroops(p.d.cumOutgoing)} (Total: ${fromStroops(p.d.cumTotal)})`}</title>
              </circle>
            ))}
          </svg>
        </div>
      )}

      <div className="flex justify-between mt-2 text-[10px] font-mono text-gray-400 dark:text-gray-500">
        <span>{daily[0]?.label}</span>
        <span>{daily[daily.length - 1]?.label}</span>
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 dark:text-gray-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-black dark:bg-white" aria-hidden="true" />
          Income
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-gray-300 dark:bg-gray-600" aria-hidden="true" />
          Expenditure
        </span>
      </div>
    </div>
  );
}
