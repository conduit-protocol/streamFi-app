'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { formatTimestamp, truncateAddress } from '@/lib/format';
import { fetchTransactionHistoryWithTimeout, type TransactionRow } from '@/lib/indexer';
const TRANSACTIONS_QUERY_KEY = ['transactions'] as const;

const STATUS_CLASS: Record<string, string> = {
  Success: 'text-green-700 bg-green-50',
  Pending: 'text-gray-600 bg-gray-100',
  Failed:  'text-red-700 bg-red-50',
};

export default function TransactionsPage() {
  const { data: txs = [], status, error, refetch, isRefetching } = useQuery<TransactionRow[]>({
    queryKey: TRANSACTIONS_QUERY_KEY,
    queryFn: () => fetchTransactionHistoryWithTimeout(),
    staleTime: 1000 * 30,
    retry: 1,
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-black tracking-tight mb-8">Transaction History</h1>

      {status === 'pending' ? (
        <Card>
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
            <RefreshCw className="w-6 h-6 animate-spin" aria-hidden="true" />
            <span className="text-sm">Loading transactions…</span>
          </div>
        </Card>
      ) : status === 'error' ? (
        <Card>
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <AlertCircle className="w-8 h-8 text-red-500" aria-hidden="true" />
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
        <Card padded={false}>
          {/* Mobile Layout */}
          <div className="sm:hidden flex flex-col divide-y divide-gray-100">
            {txs.map((tx) => {
              const isPositive = tx.type === 'Stream Created';
              const isNegative = tx.type === 'Withdrawn';
              const isCancelled = tx.type === 'Cancelled';
              const sign = isPositive ? '+' : isNegative ? '-' : '';
              const amountColor = isPositive ? 'text-green-600' : isNegative ? 'text-yellow-500' : isCancelled ? 'text-red-600' : 'text-black';

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
                      <span className={amountColor}>{sign}{tx.amount}</span>{' '}
                      <span className="text-black">{tx.token}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 font-medium" suppressHydrationWarning>
                        {formatTimestamp(tx.date)}
                      </span>
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_CLASS[tx.status]}`}>
                        {tx.status}
                      </span>
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
                {txs.map((tx) => {
                  const isPositive = tx.type === 'Stream Created';
                  const isNegative = tx.type === 'Withdrawn';
                  const isCancelled = tx.type === 'Cancelled';
                  const sign = isPositive ? '+' : isNegative ? '-' : '';
                  const amountColor = isPositive ? 'text-green-600' : isNegative ? 'text-yellow-500' : isCancelled ? 'text-red-600' : 'text-black';

                  return (
                    <tr key={tx.hash}>
                      <td className="py-2.5 px-4 text-black font-medium">{tx.type}</td>
                      <td className="py-2.5 px-4 font-mono text-right">
                        <span className={amountColor}>{sign}{tx.amount}</span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-gray-600 text-right">{tx.token}</td>
                      <td className="py-2.5 px-4 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${STATUS_CLASS[tx.status]}`}>
                          {tx.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right text-gray-500 text-xs" suppressHydrationWarning>{formatTimestamp(tx.date)}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-gray-400 text-xs">{truncateAddress(tx.hash)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
