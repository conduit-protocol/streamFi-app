import Link            from 'next/link';
import { Badge }       from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';

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
  return (
    <Link href={`/stream/${id}`} className="card block hover:border-black dark:hover:border-white transition-colors group">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">
            {role === 'recipient' ? 'From' : 'To'}
          </p>
          <p className="font-mono text-xs text-black dark:text-white truncate max-w-[180px]">{counterparty}</p>
        </div>
        <Badge status={status} />
      </div>

      <ProgressBar value={progress} />

      <div className="flex items-center justify-between mt-3 text-xs">
        <span className="text-gray-500 dark:text-gray-400">{token}</span>
        <span className="amount text-black dark:text-white font-semibold">
          {(Number(ratePerSecond) / 1e7).toFixed(4)}/s
        </span>
      </div>
    </Link>
  );
}
