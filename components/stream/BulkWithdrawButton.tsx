import { useEffect, useRef, useState, useCallback } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { withdraw } from '@/lib/stream';
import { Button } from '@/components/ui/Button';
import { withBoundedParallel, normalizeError } from '@/lib/safe-operations';

interface StreamEntry {
  id: string;
  info?: {
    withdrawable: bigint;
  };
}

interface BulkWithdrawResult {
  successCount: number;
  totalCount: number;
  errors: Array<{ streamId: string; error: string }>;
}

export function BulkWithdrawButton({
  activeStreams,
  onComplete,
  maxConcurrency = 3,
}: {
  activeStreams: StreamEntry[];
  onComplete?: (result: BulkWithdrawResult) => void;
  /** Max concurrent withdraw operations (default: 3) */
  maxConcurrency?: number;
}) {
  const { publicKey, signTx } = useWallet();
  const mounted = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  useEffect(() => {
    return () => {
      mounted.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleBulkWithdraw = useCallback(async () => {
    if (!publicKey) return;
    setIsProcessing(true);
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // Filter streams with withdrawable balance
    const withdrawableStreams = activeStreams.filter(
      (s) => s.info?.withdrawable != null && s.info.withdrawable > 0n && s.id,
    );

    setProgress({ done: 0, total: withdrawableStreams.length });

    const errors: Array<{ streamId: string; error: string }> = [];
    let successCount = 0;

    await withBoundedParallel(
      withdrawableStreams,
      async (stream, index) => {
        if (signal.aborted) {
          return { success: false, error: normalizeError(new Error('Bulk operation aborted')) };
        }

        try {
          const streamId = stream.id;
          const amount = stream.info!.withdrawable!;
          await withdraw(publicKey!, streamId, amount, signTx, signal);

          if (mounted.current) {
            successCount++;
            setProgress((p) => ({ ...p, done: p.done + 1 }));
          }

          return { success: true, data: streamId };
        } catch (err) {
          const normalized = normalizeError(err, `Stream ${stream.id}`);
          errors.push({ streamId: stream.id, error: normalized.message });

          if (mounted.current) {
            setProgress((p) => ({ ...p, done: p.done + 1 }));
          }

          return {
            success: false,
            error: normalized,
          };
        }
      },
      {
        maxConcurrency,
        signal,
        itemLabel: (item) => `withdraw(${item.id})`,
      },
    );

    // Check if we were aborted
    if (signal.aborted && mounted.current) {
      setIsProcessing(false);
      onComplete?.({
        successCount,
        totalCount: withdrawableStreams.length,
        errors: [...errors, { streamId: 'ABORT', error: 'Operation was cancelled' }],
      });
      return;
    }

    if (!mounted.current) return;
    setIsProcessing(false);

    if (onComplete) {
      onComplete({ successCount, totalCount: withdrawableStreams.length, errors });
    }
  }, [publicKey, activeStreams, signTx, maxConcurrency, onComplete]);

  const totalAvailable = activeStreams.reduce(
    (sum, s) => sum + (s.info?.withdrawable || 0n),
    0n,
  );

  return (
    <div className="space-y-2">
      <Button
        onClick={handleBulkWithdraw}
        disabled={isProcessing || totalAvailable === 0n}
        className="w-full mt-4"
      >
        {isProcessing
          ? `Processing ${progress.done}/${progress.total}...`
          : 'Withdraw All Available'}
      </Button>

      {isProcessing && progress.total > 0 && (
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
          <div
            className="bg-green-500 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${(progress.done / progress.total) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
