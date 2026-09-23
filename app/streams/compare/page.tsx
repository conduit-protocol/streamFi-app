'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams }               from 'next/navigation';
import Link                              from 'next/link';
import { ArrowLeft }                     from 'lucide-react';

import { Badge }             from '@/components/ui/Badge';
import { StreamProgressBar } from '@/components/stream/StreamProgressBar';
import { useWallet }         from '@/contexts/WalletContext';
import { getStreamAddress, getStreamInfo, type StreamInfo } from '@/lib/stream';
import { fromStroops, formatDuration, formatTimestamp, truncateAddress } from '@/lib/format';
import { tokenByAddress }    from '@/lib/tokens';
import {
  compareMetrics,
  parseCompareIds,
  MIN_COMPARE,
  type CompareMetrics,
} from '@/lib/stream-compare';

// ── Types ────────────────────────────────────────────────────────────────────

type Column =
  | { id: string; kind: 'ok'; info: StreamInfo }
  | { id: string; kind: 'error'; message: string };

async function loadColumn(publicKey: string, id: string): Promise<Column> {
  try {
    const addr = await getStreamAddress(publicKey, BigInt(id));
    if (!addr) return { id, kind: 'error', message: 'Stream not found.' };
    const info = await getStreamInfo(publicKey, addr);
    return { id, kind: 'ok', info };
  } catch (e) {
    return { id, kind: 'error', message: e instanceof Error ? e.message : 'Failed to load stream.' };
  }
}

// ── Table rows ───────────────────────────────────────────────────────────────

interface RowDef {
  label:  string;
  render: (info: StreamInfo, m: CompareMetrics, ctx: { publicKey: string; symbol: string }) => React.ReactNode;
}

const ROWS: RowDef[] = [
  {
    label:  'Status',
    render: (_info, m) => <Badge status={m.status} />,
  },
  {
    label:  'Counterparty',
    render: (info, _m, { publicKey }) => {
      const incoming = info.recipient === publicKey;
      return (
        <span className="font-mono">
          <span className="text-gray-400 dark:text-gray-500 font-sans">{incoming ? 'From ' : 'To '}</span>
          {truncateAddress(incoming ? info.sender : info.recipient)}
        </span>
      );
    },
  },
  {
    label:  'Rate / second',
    render: (info, _m, { symbol }) => (
      <span className="amount font-bold text-green-600 dark:text-green-400">
        {fromStroops(info.ratePerSecond)} {symbol}
      </span>
    ),
  },
  {
    label:  'Rate / day',
    render: (_info, m, { symbol }) => <span className="amount">{fromStroops(m.ratePerDay)} {symbol}</span>,
  },
  {
    label:  'Progress',
    render: (info, m) =>
      m.progressPct === null ? (
        <span className="text-gray-400">Open-ended</span>
      ) : (
        <div className="space-y-1 min-w-[100px]">
          <StreamProgressBar
            startTime={info.startTime}
            endTime={info.endTime}
            status={m.status}
            pausedAt={info.pausedAt}
          />
          <span className="font-mono text-xs">{Math.round(m.progressPct)}%</span>
        </div>
      ),
  },
  {
    label:  'Time remaining',
    render: (_info, m) =>
      m.remainingSec === null ? (
        <span className="text-gray-400">—</span>
      ) : (
        <span className="font-mono">
          {formatDuration(m.remainingSec)}
          {m.status === 'paused' && <span className="text-gray-400 font-sans"> (paused)</span>}
        </span>
      ),
  },
  {
    label:  'Left to stream',
    render: (_info, m, { symbol }) =>
      m.remainingAmount === null ? (
        <span className="text-gray-400">—</span>
      ) : (
        <span className="amount">{fromStroops(m.remainingAmount)} {symbol}</span>
      ),
  },
  {
    label:  'Ends',
    render: (info) =>
      info.endTime === 0 ? <span className="text-gray-400">—</span> : <span>{formatTimestamp(info.endTime)}</span>,
  },
];

// ── Page ─────────────────────────────────────────────────────────────────────

function CompareView() {
  const searchParams          = useSearchParams();
  const idsParam              = searchParams.get('ids');
  const { publicKey, connected } = useWallet();

  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(false);
  const [now, setNow]         = useState(() => Math.floor(Date.now() / 1000));

  // Refresh the metric snapshot so "time remaining" and "progress" don't go
  // stale while the page is open. A minute is plenty for these granularities.
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const ids = parseCompareIds(idsParam);
    if (!publicKey || ids.length < MIN_COMPARE) {
      setColumns([]);
      return;
    }
    let active = true;
    setLoading(true);
    Promise.all(ids.map((id) => loadColumn(publicKey, id)))
      .then((cols) => { if (active) setColumns(cols); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [publicKey, idsParam]);

  const ids = parseCompareIds(idsParam);

  let body: React.ReactNode;
  if (!connected || !publicKey) {
    body = (
      <div className="card text-center py-12 text-sm text-gray-400 dark:text-gray-500">
        Connect your wallet to compare your streams.
      </div>
    );
  } else if (ids.length < MIN_COMPARE) {
    body = (
      <div className="card text-center py-12 text-sm text-gray-400 dark:text-gray-500">
        Select at least {MIN_COMPARE} streams on the{' '}
        <Link href="/streams" className="underline hover:text-black dark:hover:text-white">streams page</Link>{' '}
        to compare them.
      </div>
    );
  } else if (loading && columns.length === 0) {
    body = (
      <div className="card text-center py-12 text-sm text-gray-400 dark:text-gray-500" aria-busy="true">
        Loading streams…
      </div>
    );
  } else {
    body = (
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th scope="col" className="text-left p-3 text-xs font-medium text-gray-400 dark:text-gray-500 w-32">
                <span className="sr-only">Metric</span>
              </th>
              {columns.map((col) => (
                <th key={col.id} scope="col" className="text-left p-3 font-black">
                  <Link href={`/stream/${col.id}`} className="hover:underline">Stream #{col.id}</Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label} className="border-b last:border-b-0 border-gray-100 dark:border-gray-800/60">
                <th scope="row" className="text-left p-3 text-xs font-medium text-gray-400 dark:text-gray-500 whitespace-nowrap align-top">
                  {row.label}
                </th>
                {columns.map((col) => (
                  <td key={col.id} className="p-3 align-top">
                    {col.kind === 'error' ? (
                      row === ROWS[0] ? <span role="alert" className="text-xs text-gray-500">{col.message}</span> : <span className="text-gray-300 dark:text-gray-700">—</span>
                    ) : (
                      row.render(col.info, compareMetrics(col.info, now), {
                        publicKey,
                        symbol: tokenByAddress(col.info.token, 'testnet')?.symbol ?? truncateAddress(col.info.token),
                      })
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <Link href="/streams" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-black dark:hover:text-white mb-6">
        <ArrowLeft className="w-3.5 h-3.5" /> All streams
      </Link>
      <h1 className="text-2xl font-black tracking-tight mb-8">Compare streams</h1>
      {body}
    </div>
  );
}

export default function ComparePage() {
  // useSearchParams() must sit under a Suspense boundary in Next 15, or the
  // whole route bails out of static rendering at build time.
  return (
    <Suspense fallback={null}>
      <CompareView />
    </Suspense>
  );
}
