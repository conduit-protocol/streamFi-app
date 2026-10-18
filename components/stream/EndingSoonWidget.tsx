'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { truncateAddress } from '@/lib/format';

export type EndingSoonRole = 'sender' | 'recipient';

export interface EndingSoonItem {
  id: string;
  role: EndingSoonRole;
  counterparty: string;
  token: string;
  endTime: number;
}

interface EndingSoonWidgetProps {
  streams: EndingSoonItem[];
}

const DAY_SECONDS = 24 * 60 * 60;

export function EndingSoonWidget({ streams }: EndingSoonWidgetProps) {
  const [view, setView] = useState<EndingSoonRole>('sender');

  const sorted = useMemo(
    () =>
      [...streams]
        .filter((stream) => stream.role === view)
        .sort((a, b) => a.endTime - b.endTime),
    [streams, view],
  );

  const title = view === 'sender' ? 'Need top-ups' : 'Expiring payrolls';

  if (sorted.length === 0) {
    return (
      <div className="card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">Ending soon</p>
            <h3 className="mt-1 text-lg font-black text-black dark:text-white">{title}</h3>
          </div>
        </div>
        <div className="rounded border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400">
          No streams are ending soon in this view.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">Ending soon</p>
          <h3 className="mt-1 text-lg font-black text-black dark:text-white">{title}</h3>
        </div>
        <div className="inline-flex rounded-full border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-950">
          {(['sender', 'recipient'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setView(option)}
              className={[
                'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                view === option
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white',
              ].join(' ')}
            >
              {option === 'sender' ? 'As Sender' : 'As Recipient'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {sorted.slice(0, 5).map((stream) => {
          const daysLeft = Math.max(0, Math.ceil((stream.endTime - Date.now() / 1000) / DAY_SECONDS));

          return (
            <Link
              key={stream.id}
              href={`/stream/${stream.id}`}
              className="flex items-center justify-between gap-3 rounded border border-gray-200 bg-white p-3 transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:hover:border-gray-700 dark:hover:bg-gray-900"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="rounded-full bg-amber-100 p-2 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-black dark:text-white">
                    {truncateAddress(stream.counterparty)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {stream.token} • {daysLeft}d left
                  </p>
                </div>
              </div>

              <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                View
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
