import Link            from 'next/link';
import { Badge }       from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { truncateAddress } from '@/lib/format';

interface StreamCardProps {
  id:            string;
  counterparty:  string;   // sender (if you're recipient) or recipient (if you're sender)
  role:          'sender' | 'recipient';
  token:         string;
  ratePerSecond: bigint;
  progress:      number;   // 0–1
  status:        'active' | 'paused' | 'ended' | 'cancelled';
}

export function StreamCard({ id, counterparty, role, token, ratePerSecond, progress, status }: StreamCardProps) {
  const rateFormatted = (Number(ratePerSecond) / 1e7).toFixed(4);

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

      <ProgressBar value={progress} />

      <div className="flex items-center justify-between mt-3 text-xs">
        <span className="text-gray-500 dark:text-gray-400 font-mono truncate max-w-[200px] sm:max-w-[300px]">
          {truncateAddress(token)}
        </span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium font-mono">
          {Math.round(progress * 100)}%
        </span>
      </div>
    </Link>
  );
}
