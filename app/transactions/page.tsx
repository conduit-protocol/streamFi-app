'use client';

import { Card } from '@/components/ui/Card';
import { formatTimestamp, truncateAddress } from '@/lib/format';

const BASE_NOW = 1784630000; // Static timestamp to prevent SSR hydration mismatch

const DEMO_TXS = [
  { type: 'Stream Created', amount: '1,000.00', token: 'XLM',   status: 'Success',  date: BASE_NOW - 3600,   hash: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0' },
  { type: 'Withdrawn',      amount: '50.42',    token: 'XLM',   status: 'Success',  date: BASE_NOW - 7200,   hash: 'b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1' },
  { type: 'Withdrawn',      amount: '25.00',    token: 'XLM',   status: 'Success',  date: BASE_NOW - 14400,  hash: 'c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2' },
  { type: 'Stream Created', amount: '500.00',   token: 'USDC',  status: 'Pending',  date: BASE_NOW - 600,    hash: 'd4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3' },
  { type: 'Cancelled',      amount: '200.00',   token: 'XLM',   status: 'Failed',   date: BASE_NOW - 86400,  hash: 'e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4' },
  { type: 'Withdrawn',      amount: '10.00',    token: 'USDC',  status: 'Failed',   date: BASE_NOW - 1800,   hash: 'f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5' },
  { type: 'Stream Created', amount: '3,000.00', token: 'XLM',   status: 'Success',  date: BASE_NOW - 172800, hash: 'g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6' },
  { type: 'Withdrawn',      amount: '100.00',   token: 'XLM',   status: 'Success',  date: BASE_NOW - 36000,  hash: 'h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7' },
];

const STATUS_CLASS: Record<string, string> = {
  Success: 'text-green-700 bg-green-50',
  Pending: 'text-gray-600 bg-gray-100',
  Failed:  'text-red-700 bg-red-50',
};

export default function TransactionsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-black tracking-tight mb-8">Transaction History</h1>

      <Card padded={false}>
        {/* Mobile Layout */}
        <div className="sm:hidden flex flex-col divide-y divide-gray-100">
          {DEMO_TXS.map((tx, i) => {
            const isPositive = tx.type === 'Stream Created';
            const isNegative = tx.type === 'Withdrawn';
            const isCancelled = tx.type === 'Cancelled';
            const sign = isPositive ? '+' : isNegative ? '-' : '';
            const amountColor = isPositive ? 'text-green-600' : isNegative ? 'text-yellow-500' : isCancelled ? 'text-red-600' : 'text-black';
            
            return (
              <div key={i} className="flex items-center justify-between py-4 px-4 hover:bg-gray-50 transition-colors">
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
              {DEMO_TXS.map((tx, i) => {
                const isPositive = tx.type === 'Stream Created';
                const isNegative = tx.type === 'Withdrawn';
                const isCancelled = tx.type === 'Cancelled';
                const sign = isPositive ? '+' : isNegative ? '-' : '';
                const amountColor = isPositive ? 'text-green-600' : isNegative ? 'text-yellow-500' : isCancelled ? 'text-red-600' : 'text-black';

                return (
                  <tr key={i}>
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
    </div>
  );
}
