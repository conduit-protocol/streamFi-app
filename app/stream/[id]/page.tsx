'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams }                         from 'next/navigation';
import Link                                  from 'next/link';
import { ArrowLeft }                         from 'lucide-react';

import { Badge }           from '@/components/ui/Badge';
import { Card }            from '@/components/ui/Card';
import { RateTicker }      from '@/components/stream/RateTicker';
import { StreamTimeline }  from '@/components/stream/StreamTimeline';
import { StreamFlowChart } from '@/components/stream/StreamFlowChart';
import { StreamActions }   from '@/components/stream/StreamActions';
import { OperatorInfo }    from '@/components/stream/OperatorInfo';
import { OperatorInfo }    from '@/components/stream/OperatorInfo';
import { useWallet }       from '@/contexts/WalletContext';
import { getStreamAddress, getStreamInfo, getWithdrawable } from '@/lib/stream';
import { fromStroops, formatTimestamp, truncateAddress }    from '@/lib/format';
import { tokenByAddress } from '@/lib/tokens';
import type { StreamInfo } from '@/lib/stream';

// ── Types ────────────────────────────────────────────────────────────────────

type StreamStatus = 'active' | 'paused' | 'ended' | 'cancelled';

/** Derive the badge status from stream state and the *current* wall clock —
 *  `nowSeconds` is passed in (not read here) so the page can re-derive it on a
 *  tick and reflect the `active → ended` transition without a reload (#401). */
function deriveStatus(info: StreamInfo, nowSeconds: number): StreamStatus {
  if (info.cancelled) return 'cancelled';
  if (info.paused)    return 'paused';
  if (info.endTime > 0 && nowSeconds >= info.endTime) return 'ended';
  return 'active';
}

/** How often to re-fetch stream state so a pause/cancel done from another
 *  device/tab shows up without a manual reload. */
const STREAM_REFRESH_MS = 20_000;

// ── Page ─────────────────────────────────────────────────────────────────────

export default function StreamPage() {
  const { id }                                    = useParams<{ id: string }>();
  const { publicKey, connected }                  = useWallet();
  const mounted                                   = useRef(true);
  const loadSeq                                   = useRef(0);

  const [streamAddress, setStreamAddress]         = useState<string | null>(null);
  const [info,          setInfo]                  = useState<StreamInfo | null>(null);
  const [withdrawable,  setWithdrawable]          = useState<bigint>(0n);
  const [nowSeconds,    setNowSeconds]            = useState(() => Math.floor(Date.now() / 1000));
  const [loading,       setLoading]               = useState(true);
  const [error,         setError]                 = useState<string | null>(null);

  useEffect(() => {
    return () => { mounted.current = false; };
  }, []);

  // Tick the clock every second so a time-based `active → ended` transition
  // (and RateTicker) update while the tab stays open (#401).
  useEffect(() => {
    const t = setInterval(() => setNowSeconds(Math.floor(Date.now() / 1000)), 1_000);
    return () => clearInterval(t);
  }, []);

  const loadStream = useCallback(async () => {
    if (!publicKey) {
      setStreamAddress(null);
      setInfo(null);
      setWithdrawable(0n);
      setLoading(false);
      setError(null);
      return;
    }

    const seq = ++loadSeq.current;
    const isCurrent = () => mounted.current && seq === loadSeq.current;

    setLoading(true);
    setError(null);
    try {
      if (!/^\d+$/.test(id)) {
        if (isCurrent()) setError('Invalid stream ID.');
        return;
      }

      const addr = await getStreamAddress(publicKey, BigInt(id));
      if (!isCurrent()) return;
      if (!addr) { setError('Stream not found.'); return; }

      const streamInfo = await getStreamInfo(publicKey, addr);
      if (!isCurrent()) return;

      setStreamAddress(addr);
      setInfo(streamInfo);

      try {
        const wAmt = await getWithdrawable(publicKey, addr);
        if (isCurrent()) setWithdrawable(wAmt);
      } catch {
        if (isCurrent()) setWithdrawable(0n);
      }
    } catch (e) {
      if (!isCurrent()) return;
      setError(e instanceof Error ? e.message : 'Failed to load stream.');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [id, publicKey]);

  useEffect(() => { loadStream(); }, [loadStream]);

  useEffect(() => {
    if (!info || status !== 'active' || info.endTime === 0) return;

    const endAt = info.endTime * 1000;
    let id: ReturnType<typeof setTimeout>;
    let active = true;
    const scheduleEnd = () => {
      const remaining = endAt - Date.now();
      if (remaining <= 0) {
        setStatus('ended');
        if (publicKey && streamAddress) {
          void getWithdrawable(publicKey, streamAddress)
            .then((amount) => { if (active) setWithdrawable(amount); })
            .catch(() => { /* keep the last known balance on refresh failure */ });
        }
        return;
      }
      id = setTimeout(scheduleEnd, Math.min(remaining, 2_147_483_647));
    };
    scheduleEnd();
    return () => {
      active = false;
      clearTimeout(id);
    };
  }, [info, status, publicKey, streamAddress]);

  // ── Render states ─────────────────────────────────────────────────────────

  if (!connected) return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <Link href="/streams" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-black dark:hover:text-white mb-6">
        <ArrowLeft className="w-3.5 h-3.5" /> All streams
      </Link>
      <div className="card text-center py-12 text-sm text-gray-400 dark:text-gray-500">
        Connect your wallet to view this stream.
      </div>
    </div>
  );

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
  // #361 — withdrawn + withdrawable is the amount streamed so far (already
  // claimed plus currently claimable), not what the sender deposited: it
  // excludes principal still escrowed in the DripStream contract that
  // hasn't streamed yet. For fixed-duration streams the deposit is
  // rate_per_second * duration; open-ended streams (endTime === 0) have no
  // fixed deposit to derive this way, so fall back to the streamed-so-far
  // total as the best available estimate.
  const totalDeposited = info.endTime > 0
    ? info.ratePerSecond * BigInt(info.endTime - info.startTime)
    : info.withdrawn + withdrawable;
  // #318 — info.token is the SEP-41 contract address, not a display symbol;
  // truncateAddress(info.token) rendered e.g. "Withdraw 42.50 CDLZ…CYSC"
  // instead of "Withdraw 42.50 XLM". Resolve to a symbol where known,
  // falling back to the truncated address only for unrecognized tokens.
  const tokenSymbol = tokenByAddress(info.token, 'testnet')?.symbol ?? truncateAddress(info.token);

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
              endTime={info.endTime}
            />
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{tokenSymbol}</p>
        </Card>
      )}

      {/* Ended — show the final claimable balance */}
      {status === 'ended' && (
        <Card className="mb-6 text-center">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Final balance, ready to withdraw</p>
          <p className="text-4xl font-black font-mono tabular-nums">
            {fromStroops(withdrawable)}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{tokenSymbol}</p>
        </Card>
      )}

      {/* Paused — show frozen withdrawable */}
      {status === 'paused' && (
        <Card className="mb-6 text-center">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Withdrawable (paused)</p>
          <p className="text-4xl font-black font-mono tabular-nums">
            {fromStroops(withdrawable)}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{tokenSymbol}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Stream is paused — balance frozen</p>
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

      {/* Stream Flow Chart Visualization */}
      <div className="mb-6">
        <StreamFlowChart
          startTime={info.startTime}
          endTime={info.endTime}
          ratePerSecond={info.ratePerSecond}
          withdrawn={info.withdrawn}
          withdrawable={withdrawable}
          paused={info.paused}
          pausedAt={info.pausedAt}
          cancelled={info.cancelled}
          tokenSymbol={tokenSymbol}
        />
      </div>

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
          token={tokenSymbol}
          onSuccess={loadStream}
        />
      )}

      {/* Delegated operator — shown when the stream has one set (#473) */}
      {info.operator && (
        <div className="mt-4">
          <OperatorInfo
            streamAddress={streamAddress}
            operator={info.operator}
            isSender={isSender}
            onSuccess={loadStream}
          />
        </div>
      )}

      {info.operator && (
        <div className="mt-4">
          <OperatorInfo
            streamAddress={streamAddress}
            operator={info.operator}
            isSender={isSender}
            onSuccess={loadStream}
          />
        </div>
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
