'use client';

import { useMemo } from 'react';
import { Info } from 'lucide-react';
import { fromStroops, toStroops } from '@/lib/format';
import { TOKENS_TESTNET } from '@/lib/tokens';

// Stellar network constants (stroops, 1 XLM = 10_000_000 stroops)
const BASE_FEE_STROOPS = 100; // per-operation inclusion fee
const BASE_RESERVE_STROOPS = 5_000_000; // 0.5 XLM per ledger entry
const PROTOCOL_FEE_BPS = 50; // 0.50% protocol fee

// create_stream involves: 1 contract invocation + 1 token transfer_from + 1 ledger entry creation
const CREATE_STREAM_OPS = 3;
const LEDGER_ENTRIES_CREATED = 2; // stream contract instance + trustline/balance entry

interface FeePreviewProps {
  depositAmount: string;
  tokenSymbol: string;
}

/**
 * Real-time fee preview for stream creation (#721).
 *
 * Shows a breakdown of network base reserve, inclusion fees, and protocol
 * bps so the user sees the full cost before triggering their wallet.
 */
export function FeePreview({ depositAmount, tokenSymbol }: FeePreviewProps) {
  const tokenMeta = TOKENS_TESTNET.find((t) => t.symbol === tokenSymbol);
  const decimals = tokenMeta?.decimals ?? 7;

  const fees = useMemo(() => {
    const networkFee = BigInt(BASE_FEE_STROOPS * CREATE_STREAM_OPS);
    const baseReserve = BigInt(BASE_RESERVE_STROOPS * LEDGER_ENTRIES_CREATED);

    let protocolFee = 0n;
    let depositStroops = 0n;
    try {
      if (depositAmount && parseFloat(depositAmount) > 0) {
        depositStroops = toStroops(depositAmount, decimals);
        protocolFee = (depositStroops * BigInt(PROTOCOL_FEE_BPS)) / 10_000n;
      }
    } catch {
      // invalid input — show zero fees
    }

    const totalFee = networkFee + baseReserve + protocolFee;
    return { networkFee, baseReserve, protocolFee, depositStroops, totalFee };
  }, [depositAmount, decimals]);

  return (
    <div className="card bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-1.5 mb-2">
        <Info className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
          Fee preview
        </span>
      </div>
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-gray-500 dark:text-gray-400">Network fee ({CREATE_STREAM_OPS} ops)</span>
          <span className="font-mono text-black dark:text-white">
            {fromStroops(fees.networkFee, 7)} XLM
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-500 dark:text-gray-400">
            Base reserve ({LEDGER_ENTRIES_CREATED} entries)
          </span>
          <span className="font-mono text-black dark:text-white">
            {fromStroops(fees.baseReserve, 7)} XLM
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-500 dark:text-gray-400">
            Protocol fee ({PROTOCOL_FEE_BPS / 100}%)
          </span>
          <span className="font-mono text-black dark:text-white">
            {fees.protocolFee > 0n
              ? `${fromStroops(fees.protocolFee, decimals)} ${tokenSymbol}`
              : '—'}
          </span>
        </div>
        <div className="border-t border-gray-200 dark:border-gray-700 pt-1.5 flex justify-between gap-4">
          <span className="font-semibold text-gray-700 dark:text-gray-200">Total fees</span>
          <span className="font-mono font-semibold text-black dark:text-white">
            {fromStroops(fees.networkFee + fees.baseReserve, 7)} XLM
            {fees.protocolFee > 0n && (
              <span className="text-gray-500 dark:text-gray-400">
                {' + '}
                {fromStroops(fees.protocolFee, decimals)} {tokenSymbol}
              </span>
            )}
          </span>
        </div>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 pt-1">
          Make sure your wallet has enough XLM to cover network fees and base reserve,
          plus enough {tokenSymbol} for the deposit and protocol fee.
        </p>
      </div>
    </div>
  );
}
