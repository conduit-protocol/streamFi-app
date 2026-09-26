'use client';

import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { CopyAddress } from '@/components/ui/CopyAddress';
import { Badge } from '@/components/ui/Badge';
import type { StreamInfo } from '@/lib/stream';

export const ENDING_SOON_WINDOW_DAYS = 7;
const ENDING_SOON_WINDOW_SECONDS = ENDING_SOON_WINDOW_DAYS * 24 * 60 * 60;

interface EndingSoonStream {
  id: string;
  address: string;
  counterparty: string;
  role: 'sender' | 'recipient';
  endTime: number;
  status: 'active' | 'paused' | 'ended' | 'cancelled';
  info: StreamInfo;
}

interface EndingSoonWidgetProps {
  receiving: EndingSoonStream[];
  sending: EndingSoonStream[];
  loading: boolean;
}

function formatTimeRemaining(endTime: number, now: number): string {
  const secondsRemaining = Math.max(0, endTime - now);
  const daysRemaining = Math.floor(secondsRemaining / (24 * 60 * 60));
  const hoursRemaining = Math.floor((secondsRemaining % (24 * 60 * 60)) / (60 * 60));

  if (daysRemaining > 0) {
    return `${daysRemaining}d ${hoursRemaining}h`;
  } else if (hoursRemaining > 0) {
    return `${hoursRemaining}h`;
  } else {
    return 'Less than 1h';
  }
}

function isEndingSoon(endTime: number, now: number): boolean {
  if (endTime === 0) return false; // Open-ended streams never end
  return endTime > now && endTime - now <= ENDING_SOON_WINDOW_SECONDS;
}

export function EndingSoonWidget({
  receiving,
  sending,
  loading,
}: EndingSoonWidgetProps) {
  const now = Math.floor(Date.now() / 1000);

  const endingSoonReceiving = receiving.filter(
    (s) => s.status === 'active' && isEndingSoon(s.endTime, now)
  );

  const endingSoonSending = sending.filter(
    (s) => s.status === 'active' && isEndingSoon(s.endTime, now)
  );

  const allEndingSoon = [...endingSoonReceiving, ...endingSoonSending];

  if (loading || allEndingSoon.length === 0) {
    return null;
  }

  return (
    <div className="mb-6 p-4 border border-yellow-200 dark:border-yellow-900/50 rounded bg-yellow-50 dark:bg-yellow-900/20">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 shrink-0 text-yellow-600 dark:text-yellow-500 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
            {allEndingSoon.length === 1 ? 'Stream ending soon' : 'Streams ending soon'}
          </h3>
          <div className="space-y-2">
            {allEndingSoon.map((stream) => (
              <Link
                key={`${stream.role}-${stream.id}`}
                href={`/stream/${stream.id}`}
                className="flex items-center justify-between gap-2 p-2 rounded hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors group"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-yellow-700 dark:text-yellow-200 mb-0.5">
                    {stream.role === 'recipient' ? 'Receiving from' : 'Sending to'}
                  </p>
                  <div className="truncate max-w-[180px]">
                    <CopyAddress address={stream.counterparty} />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-mono font-semibold text-yellow-900 dark:text-yellow-100 whitespace-nowrap">
                    {formatTimeRemaining(stream.endTime, now)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
