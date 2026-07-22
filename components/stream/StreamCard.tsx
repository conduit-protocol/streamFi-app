import Link                    from 'next/link';
import { Badge }               from '@/components/ui/Badge';
import { StreamProgressBar }   from '@/components/stream/StreamProgressBar';
import { truncateAddress }     from '@/lib/format';

interface StreamCardProps {
  id:            string;
  counterparty:  string;   // sender (if you're recipient) or recipient (if you're sender)
  role:          'sender' | 'recipient';
  token:         string;
  ratePerSecond: bigint;
  /** Unix timestamp (seconds) when the stream started */
  startTime:     number;
  /** Unix timestamp (seconds) when the stream ends (0 = open-ended) */
  endTime:       number;
  status:        'active' | 'paused' | 'ended' | 'cancelled';
}

export function StreamCard({
  id,
  counterparty,
  role,
  token,
  ratePerSecond,
  startTime,
  endTime,
  status,
}: StreamCardProps) {
  const rateFormatted = (Number(ratePerSecond) / 1e7).toFixed(4);

  // Derive a snapshot percentage for the text label only (no state, no timer)
  const pctSnapshot = (() => {
    if (endTime === 0) return 0;
    const now   = Date.now() / 1_000;
    const total = endTime - startTime;
    if (total <= 0) return 0;
    return Math.min(100, Math.max(0, ((now - startTime) / total) * 100));
  })();

  return (
    <Link href={`/stream/${id}`} className="card block hover:border-black dark:hover:border-white transition-colors group">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">
            {role === 'recipient' ? 'From' : 'To'}
          </p>
          <p className="font-mono text-xs text-black dark:text-white truncate max-w-[110px] sm:max-w-[180px]">
            {truncateAddress(counterparty)}
          </p>
        </div>

        {/* Rate number centered, green text */}
        <div className="amount text-xs sm:text-sm font-bold text-green-600 dark:text-green-400 truncate text-center px-1">
          {rateFormatted}/s
        </div>

        <div className="shrink-0">
          <Badge status={status} />
        </div>
      </div>

      {/* CSS-animated progress bar — zero React state updates */}
      <StreamProgressBar
        startTime={startTime}
        endTime={endTime}
        status={status}
      />

      <div className="flex items-center justify-between mt-3 text-xs">
        <span className="text-gray-500 dark:text-gray-400 font-mono truncate max-w-[200px] sm:max-w-[300px]">
          {truncateAddress(token)}
        </span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium font-mono">
          {Math.round(pctSnapshot)}%
        </span>
      </div>
    </Link>
  );
}
