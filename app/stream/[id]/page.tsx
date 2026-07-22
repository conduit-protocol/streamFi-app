'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams }                         from 'next/navigation';
import Link                                  from 'next/link';
import { ArrowLeft }                         from 'lucide-react';

import { Badge }           from '@/components/ui/Badge';
import { Card }            from '@/components/ui/Card';
import { RateTicker }      from '@/components/stream/RateTicker';
import { StreamTimeline }  from '@/components/stream/StreamTimeline';
import { StreamActions }   from '@/components/stream/StreamActions';
import { useWallet }       from '@/contexts/WalletContext';
import { getStreamAddress, getStreamInfo, getWithdrawable } from '@/lib/stream';
import { fromStroops, formatTimestamp, truncateAddress }    from '@/lib/format';
import type { StreamInfo } from '@/lib/stream';

// ── Types ────────────────────────────────────────────────────────────────────

type StreamStatus = 'active' | 'paused' | 'ended' | 'cancelled';

function deriveStatus(info: StreamInfo): StreamStatus {
  if (info.cancelled) return 'cancelled';
  if (info.paused)    return 'paused';
  const now = Math.floor(Date.now() / 1000);
  if (info.endTime > 0 && now >= info.endTime) return 'ended';
  return 'active';
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function StreamPage() {
  const { id }                                    = useParams<{ id: string }>();
  const { publicKey }                             = useWallet();
  const callerAddr                                = publicKey ?? 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';

  const [streamAddress, setStreamAddress]         = useState<string | null>(null);
  const [info,          setInfo]                  = useState<StreamInfo | null>(null);
  const [withdrawable,  setWithdrawable]          = useState<bigint>(0n);
  const [status,        setStatus]                = useState<StreamStatus>('active');
  const [loading,       setLoading]               = useState(true);
  const [error,         setError]                 = useState<string | null>(null);

  const loadStream = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const addr = await getStreamAddress(callerAddr, BigInt(id));
      if (!addr) { setError('Stream not found.'); return; }

      const [streamInfo, wAmt] = await Promise.all([
        getStreamInfo(callerAddr, addr),
        getWithdrawable(callerAddr, addr),
      ]);

      setStreamAddress(addr);
      setInfo(streamInfo);
      setWithdrawable(wAmt);
      setStatus(deriveStatus(streamInfo));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stream.');
    } finally {
      setLoading(false);
    }
  }, [id, callerAddr]);

  useEffect(() => { loadStream(); }, [loadStream]);

  // ── Render states ─────────────────────────────────────────────────────────

  if (loading) return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="h-6 w-32 bg-gray-100 dark:bg-gray-800 rounded animate-pulse mb-6" />
      <div className="h-8 w-48 bg-gray-100 dark:bg-gray-800 rounded animate-pulse mb-4" />
      <div className="card animate-pulse h-40 bg-gray-50 dark:bg-gray-800 mb-4" />
      <div className="card animate-pulse h-60 bg-gray-50 dark:bg-gray-800" />
    </div>
  );

  if (error || !info || !streamAddress) return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <Link href="/streams" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-black dark:hover:text-white mb-6">
        <ArrowLeft className="w-3.5 h-3.5" /> All streams
      </Link>
      <p className="text-sm text-gray-500 dark:text-gray-400">{error ?? 'Stream not found.'}</p>
    </div>
  );

  const isSender    = !!publicKey && publicKey === info.sender;
  const isRecipient = !!publicKey && publicKey === info.recipient;
  const totalDeposited = info.withdrawn + withdrawable;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">

      {/* Back */}
      <Link href="/streams" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-black dark:hover:text-white mb-6">
        <ArrowLeft className="w-3.5 h-3.5" /> All streams
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-1 font-mono">{truncateAddress(streamAddress)}</p>
          <h1 className="text-2xl font-black tracking-tight">Stream #{id}</h1>
        </div>
        <Badge status={status} />
      </div>

      {/* Live withdrawable counter — active only */}
      {status === 'active' && (
        <Card className="mb-6 text-center">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Withdrawable now</p>
          <p className="text-4xl font-black font-mono tabular-nums">
            <RateTicker
              ratePerSecond={info.ratePerSecond}
              startBalance={withdrawable}
            />
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{truncateAddress(info.token)}</p>
        </Card>
      )}

      {/* Paused — show frozen withdrawable */}
      {status === 'paused' && (
        <Card className="mb-6 text-center">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Withdrawable (paused)</p>
          <p className="text-4xl font-black font-mono tabular-nums">
            {fromStroops(withdrawable)}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{truncateAddress(info.token)}</p>
          <p className="text-xs text-amber-600 mt-2">Stream is paused — balance frozen</p>
        </Card>
      )}

      {/* Timeline */}
      {info.endTime > 0 && (
        <div className="mb-6">
          <StreamTimeline
            startTime={info.startTime}
            endTime={info.endTime}
            paused={info.paused}
            pausedAt={info.pausedAt}
          />
        </div>
      )}

      {/* Details table */}
      <Card className="mb-6">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {[
              { label: 'Sender',          value: truncateAddress(info.sender)    },
              { label: 'Recipient',       value: truncateAddress(info.recipient) },
              { label: 'Token',           value: truncateAddress(info.token)     },
              { label: 'Rate',            value: `${fromStroops(info.ratePerSecond)} / sec` },
              { label: 'Total deposited', value: fromStroops(totalDeposited)     },
              { label: 'Withdrawn',       value: fromStroops(info.withdrawn)     },
              ...(info.endTime > 0 ? [
                { label: 'Start',  value: formatTimestamp(info.startTime) },
                { label: 'End',    value: formatTimestamp(info.endTime)   },
              ] : [
                { label: 'Start',  value: formatTimestamp(info.startTime) },
                { label: 'End',    value: 'Open-ended'                   },
              ]),
              { label: 'Clawback', value: info.clawbackEnabled ? 'Enabled' : 'Disabled' },
            ].map(({ label, value }) => (
              <tr key={label}>
                <td className="py-2.5 text-gray-400 dark:text-gray-500 w-40">{label}</td>
                <td className="py-2.5 font-mono text-black dark:text-white text-right">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Actions */}
      {(isSender || isRecipient) && (
        <StreamActions
          streamAddress={streamAddress}
          status={status}
          clawbackEnabled={info.clawbackEnabled}
          isSender={isSender}
          isRecipient={isRecipient}
          withdrawable={withdrawable}
          token={truncateAddress(info.token)}
          onSuccess={loadStream}
        />
      )}

      {/* Clawback warning */}
      {info.clawbackEnabled && status !== 'cancelled' && (
        <p className="mt-4 text-xs text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-800 rounded p-3">
          ⚠ This stream has clawback enabled. The sender may reclaim unstreamed tokens at any time.
        </p>
      )}
    </div>
  );
}
