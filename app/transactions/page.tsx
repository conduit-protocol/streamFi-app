'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, RefreshCw, Info, Download, Printer } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { CopyHashButton } from '@/components/ui/CopyHashButton';
import { TransactionCardSkeleton } from '@/components/TransactionCardSkeleton';
import { formatTimestamp, formatTimestampRelative, truncateAddress } from '@/lib/format';
import { toCsv, downloadCsv } from '@/lib/csv';
import {
  fetchTransactionHistoryWithTimeout,
  isIndexerNotConfiguredError,
  type TransactionRow,
} from '@/lib/indexer';
import { useWallet } from '@/contexts/WalletContext';
import { useSettings } from '@/hooks/useSettings';

const TRANSACTIONS_QUERY_KEY = ['transactions'] as const;

const CSV_HEADERS = ['Type', 'Amount', 'Token', 'Status', 'Date (UTC)', 'Transaction Hash'] as const;

/** Build the CSV text for the on-screen transaction rows. */
function transactionsToCsv(txs: TransactionRow[]): string {
  return toCsv(
    CSV_HEADERS,
    txs.map((tx) => [
      tx.type,
      // Drop the display thousands-separators so the column stays numeric.
      tx.amount.replace(/,/g, ''),
      tx.token,
      tx.status,
      new Date(tx.date * 1000).toISOString(),
      tx.hash,
    ]),
  );
}

// #312 — Success/Failed used bg-green-*/bg-red-*, neither covered by
// CONTRIBUTING.md's delta-only text-color exception (which doesn't apply to
// bg- at all). The status text itself ("Success"/"Pending"/"Failed") is
// always rendered inside the pill, so gray shades plus line-through for the
// failed state carry the distinction without color.
const STATUS_CLASS: Record<string, string> = {
  Success: 'text-black bg-gray-100',
  Pending: 'text-gray-600 bg-gray-100',
  Failed:  'text-gray-500 bg-gray-200 line-through',
};

// Status filter tabs (#692) — client-side only so users troubleshooting a
// stuck/failed transaction don't scroll through dozens of confirmed items.
// "Confirmed" maps to the indexer's `Success` status; "Failed" also matches a
// `Reverted` status alias for chains that report reverts under that name.
export type TransactionStatusFilter = 'All' | 'Confirmed' | 'Pending' | 'Failed';

export const TRANSACTION_STATUS_FILTERS: readonly TransactionStatusFilter[] = [
  'All',
  'Confirmed',
  'Pending',
  'Failed',
] as const;

/** Normalizes a row status for filter comparison (case-insensitive). */
export function matchesStatusFilter(
  status: string,
  filter: TransactionStatusFilter,
): boolean {
  if (filter === 'All') return true;
  const normalized = status.trim().toLowerCase();
  if (filter === 'Confirmed') return normalized === 'success' || normalized === 'confirmed';
  if (filter === 'Pending') return normalized === 'pending';
  // Failed covers both "Failed" and the "Reverted" alias from the issue title.
  return normalized === 'failed' || normalized === 'reverted';
}

export default function TransactionsPage() {
  const { publicKey, connected } = useWallet();
  const { timeFormat } = useSettings();
  const { data: txs = [], status, error, refetch, isRefetching } = useQuery<TransactionRow[]>({
    queryKey: [...TRANSACTIONS_QUERY_KEY, publicKey],
    queryFn: () => fetchTransactionHistoryWithTimeout(publicKey),
    staleTime: 1000 * 30,
    retry: (failureCount, queryError) =>
      !isIndexerNotConfiguredError(queryError) && failureCount < 1,
  });
  const [statusFilter, setStatusFilter] = useState<TransactionStatusFilter>('All');

  const filteredTxs = useMemo(
    () => txs.filter((tx) => matchesStatusFilter(tx.status, statusFilter)),
    [txs, statusFilter],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<TransactionStatusFilter, number> = {
      All: txs.length,
      Confirmed: 0,
      Pending: 0,
      Failed: 0,
    };
    for (const tx of txs) {
      if (matchesStatusFilter(tx.status, 'Confirmed')) counts.Confirmed += 1;
      else if (matchesStatusFilter(tx.status, 'Pending')) counts.Pending += 1;
      else if (matchesStatusFilter(tx.status, 'Failed')) counts.Failed += 1;
    }
    return counts;
  }, [txs]);

  const isDemoData = connected && txs.length > 0;
  const isIndexerComingSoon = status === 'error' && isIndexerNotConfiguredError(error);
  const canExport = filteredTxs.length > 0;

  /** Format a timestamp respecting the user's time-format preference (#556). */
  const formatDate = (ts: number) =>
    timeFormat === 'relative' ? formatTimestampRelative(ts) : formatTimestamp(ts);

  const handleExport = () => {
    if (!canExport) return;
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`conduit-transactions-${stamp}.csv`, transactionsToCsv(filteredTxs));
  };

  const handlePrint = () => window.print();

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 print-receipt">
      <div className="flex items-center justify-between gap-4 mb-8">
        <h1 className="text-2xl font-black tracking-tight">Transaction History</h1>
        <div className="flex items-center gap-2">
          {canExport && (
            <button
              type="button"
              onClick={handleExport}
              className="btn-secondary text-sm shrink-0 print:hidden"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              Export CSV
            </button>
          )}
          {canExport && (
            <button
              type="button"
              onClick={handlePrint}
              className="btn-secondary text-sm shrink-0 print:hidden"
              aria-label="Print transaction history"
            >
              <Printer className="w-4 h-4" aria-hidden="true" />
              Print
            </button>
          )}
        </div>
      </div>

      {isDemoData && (
        <div className="flex items-start gap-2 p-3 mb-4 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg">
          <Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            <span className="font-semibold">Demo data</span> — Transaction history is not yet connected to the indexer.
            The rows below are placeholder examples and do not reflect your actual wallet activity.
          </p>
        </div>
      )}

      {!connected && (
        <div className="flex items-start gap-2 p-3 mb-4 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg">
          <Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p>Connect your wallet to view your transaction history.</p>
        </div>
      )}

      {status === 'pending' ? (
        <TransactionCardSkeleton />
      ) : isIndexerComingSoon ? (
        <Card>
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Info className="w-8 h-8 text-gray-400" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-black dark:text-white">
                Transaction history is coming soon
              </p>
              <p className="text-xs text-gray-500 mt-1">
                The indexer is not configured yet, so history will appear here once it is available.
              </p>
            </div>
          </div>
        </Card>
      ) : status === 'error' ? (
        <Card>
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <AlertCircle className="w-8 h-8 text-gray-500" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-black dark:text-white">
                Couldn&apos;t load transaction history
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {error instanceof Error ? error.message : 'The indexer is unavailable right now. Please try again.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isRefetching}
              className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} aria-hidden="true" /> Retry
            </button>
          </div>
        </Card>
      ) : txs.length === 0 ? (
        <Card>
          <div className="py-16 text-center text-sm text-gray-400">
            No transactions yet.
          </div>
        </Card>
      ) : (
        <>
          {/* Status filter tabs — client-side only (#692) */}
          <div
            role="tablist"
            aria-label="Filter transactions by status"
            className="flex flex-wrap gap-2 mb-4 print:hidden"
          >
            {TRANSACTION_STATUS_FILTERS.map((filter) => {
              const isSelected = statusFilter === filter;
              return (
                <button
                  key={filter}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setStatusFilter(filter)}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    isSelected
                      ? 'bg-black text-white dark:bg-white dark:text-black'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {filter} ({statusCounts[filter]})
                </button>
              );
            })}
          </div>

          {filteredTxs.length === 0 ? (
            <Card>
              <div className="py-16 text-center text-sm text-gray-400">
                No {statusFilter === 'All' ? '' : `${statusFilter} `}transactions.
              </div>
            </Card>
          ) : (
        <Card padded={false}>
          {/* Mobile Layout */}
          <div className="sm:hidden flex flex-col divide-y divide-gray-100">
            {filteredTxs.map((tx) => {
              const isPositive = tx.type === 'Stream Created';
              const isNegative = tx.type === 'Withdrawn';
              const isCancelled = tx.type === 'Cancelled';
              const sign = isPositive ? '+' : isNegative ? '-' : '';
              // #327 — yellow wasn't in the allowed exception at all (only
              // green-600/red-600 for a delta), and cancelled isn't really
              // a directional delta, so it gets no color (the '×' icon and
              // "Cancelled" type label already distinguish it).
              const amountColor = isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-black';
              const amountAriaLabel = isPositive ? 'increase' : isNegative ? 'decrease' : undefined;

              return (
                <div key={tx.hash} className="flex items-center justify-between py-4 px-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-500">
                      {isPositive ? '↓' : isNegative ? '↑' : '×'}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-black">{tx.type}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        From: <span className="font-mono text-gray-400">{truncateAddress(tx.hash)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1.5">
                    <div className="text-sm font-mono font-bold">
                      <span className={amountColor} aria-label={amountAriaLabel}>{sign}{tx.amount}</span>{' '}
                      <span className="text-black">{tx.token}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 font-medium" suppressHydrationWarning>
                        {formatDate(tx.date)}
                      </span>
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_CLASS[tx.status]}`}>
                        {tx.status}
                      </span>
                      <CopyHashButton hash={tx.hash} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Layout */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="py-2.5 px-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Type</th>
                  <th className="py-2.5 px-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Amount</th>
                  <th className="py-2.5 px-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Token</th>
                  <th className="py-2.5 px-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="py-2.5 px-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                  <th className="py-2.5 px-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredTxs.map((tx) => {
                  const isPositive = tx.type === 'Stream Created';
                  const isNegative = tx.type === 'Withdrawn';
                  const isCancelled = tx.type === 'Cancelled';
                  const sign = isPositive ? '+' : isNegative ? '-' : '';
                  // #327 — yellow wasn't in the allowed exception at all (only
                  // green-600/red-600 for a delta), and cancelled isn't really
                  // a directional delta, so it gets no color (the '×' icon and
                  // "Cancelled" type label already distinguish it).
                  const amountColor = isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-black';
                  const amountAriaLabel = isPositive ? 'increase' : isNegative ? 'decrease' : undefined;

                  return (
                    <tr key={tx.hash}>
                      <td className="py-2.5 px-4 text-black font-medium">{tx.type}</td>
                      <td className="py-2.5 px-4 font-mono text-right">
                        <span className={amountColor} aria-label={amountAriaLabel}>{sign}{tx.amount}</span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-gray-600 text-right">{tx.token}</td>
                      <td className="py-2.5 px-4 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${STATUS_CLASS[tx.status]}`}>
                          {tx.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right text-gray-500 text-xs" suppressHydrationWarning>{formatDate(tx.date)}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-gray-400 text-xs">
                        <div className="flex items-center justify-end gap-1">
                          <span>{truncateAddress(tx.hash)}</span>
                          <CopyHashButton hash={tx.hash} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
          )}
        </>
      )}
    </div>
  );
}
