"use client";

import { useMemo } from "react";
import { fromStroops } from "@/lib/format";
import type { DailyFlow } from "@/lib/profile-analytics";

interface CashflowChartProps {
  daily: DailyFlow[];
}

/**
 * Stacked bar chart of daily streaming income (bottom, dark) vs expenditure
 * (top, gray) over the trailing 30-day window (#690). Pure CSS/divs — no
 * chart dependency. Bars scale to the busiest day in the window.
 */
export function CashflowChart({ daily }: CashflowChartProps) {
  const max = useMemo(() => {
    let m = 0n;
    for (const d of daily) {
      const total = d.incoming + d.outgoing;
      if (total > m) m = total;
    }
    return m > 0n ? m : 1n;
  }, [daily]);

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

  return (
    <div data-testid="cashflow-chart">
      <div
        className="flex items-end gap-1 h-36"
        role="img"
        aria-label="Daily streaming income versus expenditure over the past 30 days"
      >
        {daily.map((d) => {
          const total = d.incoming + d.outgoing;
          const totalPct = total > 0n ? Number((total * 1000n) / max) / 10 : 0;
          const incomingPct =
            total > 0n ? (Number((d.incoming * 1000n) / total) / 10) * (totalPct / 100) * 100 : 0;
          const outgoingPct = totalPct - incomingPct;
          return (
            <div
              key={d.dayStart}
              className="flex-1 flex flex-col justify-end h-full min-w-0"
              title={`${d.label}: +${fromStroops(d.incoming)} in / -${fromStroops(d.outgoing)} out`}
            >
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
