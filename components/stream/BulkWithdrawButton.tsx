import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { withdraw } from '@/lib/stream';
import { Button } from '@/components/ui/Button';
import { withBoundedParallel, normalizeError } from '@/lib/safe-operations';
import { isValidStellarAddress } from '@/lib/stellar-address';
import { fromStroops } from '@/lib/format';
import { getFeeMultiplier } from '@/lib/env';
import { Modal } from '@/components/ui/Modal';
import { BASE_FEE } from '@stellar/stellar-sdk';

const MAX_I128 = BigInt('170141183460469231731687303715884105727');

export interface StreamEntry {
  id?: string;
  address: string;
  info?: { withdrawable: bigint };
  /** Shown next to the amount in the confirmation preview. */
  tokenSymbol?: string;
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
    isValidStellarAddress(s.address) &&
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
  const [confirmOpen, setConfirmOpen] = useState(false);
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

  // Lower bound only: each transaction also pays a Soroban resource fee that
  // is simulated at signing time, so the wallet may show a higher figure.
  const estimatedFeeStroops = useMemo(
    () =>
      BigInt(Math.ceil(Number(BASE_FEE) * getFeeMultiplier())) *
      BigInt(withdrawableStreams.length),
    [withdrawableStreams],
  );

  const excludedCount = activeStreams.length - withdrawableStreams.length;

  const handleBulkWithdraw = useCallback(async () => {
    if (!publicKey || isProcessing) return;

    setConfirmOpen(false);
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
        onClick={() => setConfirmOpen(true)}
        disabled={isProcessing || withdrawableStreams.length === 0}
        className="w-full mt-4"
      >
        {isProcessing
          ? `Processing ${progress.done}/${progress.total}...`
          : 'Withdraw All Available'}
      </Button>

      {confirmOpen && !isProcessing && (
        <Modal
          title="Confirm bulk withdrawal"
          onClose={() => setConfirmOpen(false)}
          size="max-w-lg"
        >
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            You will be asked to sign {withdrawableStreams.length} withdrawal
            {withdrawableStreams.length === 1 ? '' : 's'}.
          </p>
          <ul
            aria-label="Streams to withdraw from"
            className="max-h-56 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800 border border-gray-100 dark:border-gray-800 rounded"
          >
            {withdrawableStreams.map((s) => (
              <li key={s.id} className="flex justify-between gap-3 px-3 py-2 text-xs">
                <span className="font-mono truncate">{s.id}</span>
                <span className="font-mono shrink-0">
                  {fromStroops(s.info.withdrawable)}
                  {s.tokenSymbol ? ` ${s.tokenSymbol}` : ''}
                </span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 text-xs">
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Total claimable</dt>
              <dd className="font-mono font-semibold" data-testid="bulk-total">
                {fromStroops(totalAvailable)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">
                Estimated network fees (minimum)
              </dt>
              <dd className="font-mono" data-testid="bulk-fee">
                {fromStroops(estimatedFeeStroops)} XLM
              </dd>
            </div>
          </dl>
          <div className="flex gap-2 mt-4">
            <Button
              onClick={() => setConfirmOpen(false)}
              className="flex-1 bg-white text-black border border-gray-200 dark:bg-gray-900 dark:text-white dark:border-gray-700"
            >
              Cancel
            </Button>
            <Button onClick={handleBulkWithdraw} className="flex-1">
              Confirm withdrawal
            </Button>
          </div>
        </Modal>
      )}

      {excludedCount > 0 && !isProcessing && (
        <div
          role="status"
          className="text-xs text-gray-500 dark:text-gray-400 mt-1"
        >
          {excludedCount} stream{excludedCount === 1 ? '' : 's'} excluded due to invalid or missing data
        </div>
      )}

      {isProcessing && progress.total > 0 && (
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
          <div
            className="bg-black dark:bg-white h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${(progress.done / progress.total) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
