"use client";

import React, { useMemo } from "react";
import {
  computeGasEfficiency,
  type CashflowStream,
  type GasEfficiencySummary,
} from "@/lib/profile-analytics";
import { fromStroops } from "@/lib/format";

interface GasEfficiencyCardProps {
  streams: CashflowStream[];
  loading?: boolean;
}

export function GasEfficiencyCard({ streams, loading }: GasEfficiencyCardProps) {
  const summary: GasEfficiencySummary = useMemo(
    () => computeGasEfficiency(streams, Math.floor(Date.now() / 1000)),
    [streams],
  );

  return (
    <div className="card mb-6" data-testid="gas-efficiency-card">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Gas Efficiency
          </h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            Total lifetime network gas fees saved through streaming payments vs discrete payout transactions.
          </p>
        </div>
        <span className="self-start sm:self-auto px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 rounded-full">
          Protocol Value
        </span>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-gray-400" aria-busy="true">
          Calculating gas efficiency…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 mb-3">
            <div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">
                Lifetime Gas Fees Saved
              </p>
              <p
                className="text-xl sm:text-2xl font-black font-mono text-green-600 dark:text-green-400 mt-0.5"
                data-testid="gas-fees-saved"
              >
                {fromStroops(summary.totalGasSavedStroops)} <span className="text-xs font-normal text-gray-500">XLM</span>
              </p>
            </div>
            <div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">
                Withdrawals Avoided
              </p>
              <p
                className="text-xl sm:text-2xl font-black font-mono text-black dark:text-white mt-0.5"
                data-testid="withdrawals-avoided"
              >
                {summary.totalWithdrawalsAvoided.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">
                Avg Fee per Payout
              </p>
              <p
                className="text-xl sm:text-2xl font-black font-mono text-gray-700 dark:text-gray-300 mt-0.5"
                data-testid="avg-tx-fee"
              >
                {fromStroops(summary.avgTxFeeStroops)} <span className="text-xs font-normal text-gray-500">XLM</span>
              </p>
            </div>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Based on {summary.totalStreams} lifetime stream{summary.totalStreams === 1 ? "" : "s"}. Continuous streaming replaces recurring payout transactions, reducing cumulative on-chain fee overhead for CFOs and treasuries.
          </p>
        </>
      )}
    </div>
  );
}
