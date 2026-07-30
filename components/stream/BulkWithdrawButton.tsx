import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { withdraw } from '@/lib/stream';
import { Button } from '@/components/ui/Button';
import { withBoundedParallel, normalizeError } from '@/lib/safe-operations';

const STELLAR_ADDRESS_RE = /^[GC][A-Z0-9]{55}$/;
const MAX_I128 = BigInt('170141183460469231731687303715884105727');

export interface StreamEntry {
  id?: string;
  address: string;
  info?: { withdrawable: bigint };
}

interface BulkWithdrawResult {
  successCount: number;
  totalCount: number;
  errors: Array<{ streamId: string; error: string }>;
}

type ValidStream = StreamEntry & { id: string; info: { withdrawable: bigint } };

function isStreamValid(s: StreamEntry): s is ValidStream {
  return (
    typeof s.id === 'string' &&
    s.id.length > 0 &&
    typeof s.address === 'string' &&
    STELLAR_ADDRESS_RE.test(s.address) &&
    s.info?.withdrawable != null &&
    typeof s.info.withdrawable === 'bigint' &&
    s.info.withdrawable > 0n &&
    s.info.withdrawable <= MAX_I128
  );
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

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const withdrawableStreams = useMemo(
    () => activeStreams.filter(isStreamValid),
    [activeStreams],
  );

  const totalAvailable = useMemo(
    () => withdrawableStreams.reduce((sum, s) => sum + s.info.withdrawable, 0n),
    [withdrawableStreams],
  );

  const excludedCount = activeStreams.length - withdrawableStreams.length;

  const handleBulkWithdraw = useCallback(async () => {
    if (!publicKey || isProcessing) return;

    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    setIsProcessing(true);

    setProgress({ done: 0, total: withdrawableStreams.length });

    const errors: Array<{ streamId: string; error: string }> = [];
    let successCount = 0;

    await withBoundedParallel(
      withdrawableStreams,
      async (stream, index) => {
        if (signal.aborted || !mounted.current) {
          return { success: false, error: normalizeError(new Error('Bulk operation aborted')) };
        }

        try {
          const streamId = stream.id;
          const streamAddress = stream.address;
          const amount = stream.info.withdrawable;
          await withdraw(publicKey!, streamAddress, amount, signTx, signal);

          if (mounted.current) {
            successCount++;
            setProgress((p) => ({ ...p, done: p.done + 1 }));
          }

          return { success: true, data: streamId };
        } catch (err) {
          const normalized = normalizeError(err, `Stream ${stream.id}`);
          errors.push({ streamId: stream.id ?? 'unknown', error: normalized.message });

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

    if (signal.aborted || !mounted.current) {
      setIsProcessing(false);
      return;
    }

    setIsProcessing(false);

    if (onComplete && mounted.current) {
      onComplete({ successCount, totalCount: withdrawableStreams.length, errors });
    }
  }, [publicKey, isProcessing, withdrawableStreams, signTx, maxConcurrency, onComplete]);

  return (
    <div className="space-y-2">
      <Button
        onClick={handleBulkWithdraw}
        disabled={isProcessing || withdrawableStreams.length === 0}
        className="w-full mt-4"
      >
        {isProcessing
          ? `Processing ${progress.done}/${progress.total}...`
          : 'Withdraw All Available'}
      </Button>

      {excludedCount > 0 && !isProcessing && (
        <div
          role="status"
          className="text-xs text-amber-600 dark:text-amber-400 mt-1"
        >
          {excludedCount} stream{excludedCount === 1 ? '' : 's'} excluded due to invalid or missing data
        </div>
      )}

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
