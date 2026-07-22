'use client';

import { useState } from 'react';
import { Play, Pause, X, Plus, RotateCcw } from 'lucide-react';
import { WithdrawButton }    from './WithdrawButton';
import { Modal }             from '@/components/ui/Modal';
import { useWallet }         from '@/contexts/WalletContext';
import { Input }             from '@/components/ui/Input';
import * as streamLib        from '@/lib/stream';
import { toStroops }         from '@/lib/format';

type StreamStatus = 'active' | 'paused' | 'ended' | 'cancelled';

interface StreamActionsProps {
  streamAddress:   string;
  status:          StreamStatus;
  clawbackEnabled: boolean;
  isSender:        boolean;
  isRecipient:     boolean;
  withdrawable:    bigint;
  token:           string;
  onSuccess?:      () => void;
}

/**
 * Role-based action buttons for a stream.
 * Guards all mutating calls behind wallet auth via WalletContext.
 */
export function StreamActions({
  streamAddress, status, clawbackEnabled,
  isSender, isRecipient, withdrawable, token, onSuccess,
}: StreamActionsProps) {
  const { publicKey, signTx } = useWallet();

  const [pending,     setPending]     = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpAmt, setTopUpAmt]   = useState('');
  const [topUpErr, setTopUpErr]   = useState('');

  if (!publicKey) return null;

  const isActive = status === 'active';
  const isPaused = status === 'paused';
  const canAct   = isActive || isPaused;

  async function run(name: string, fn: () => Promise<unknown>) {
    setPending(name);
    setActionError(null);
    try {
      await fn();
      onSuccess?.();
    } catch (e) {
      console.error(`[${name}] error:`, e);
      setActionError(e instanceof Error ? e.message : `Failed to ${name}.`);
    } finally {
      setPending(null);
    }
  }

  const submitTopUp = async () => {
    const parsed = parseFloat(topUpAmt);
    if (!topUpAmt || isNaN(parsed) || parsed <= 0) {
      setTopUpErr('Enter a valid amount greater than 0.');
      return;
    }
    setTopUpErr('');
    const amount = toStroops(parsed.toString());
    await run('topup', () => streamLib.topUp(publicKey, streamAddress, amount, signTx));
    setTopUpOpen(false);
    setTopUpAmt('');
  };

  return (
    <>
      <div className="space-y-3">
        {actionError && (
          <p className="text-xs text-red-600">{actionError}</p>
        )}

        {/* Withdraw — recipient only, when there's something to withdraw */}
        {isRecipient && canAct && (
          <WithdrawButton
            streamAddress={streamAddress}
            withdrawable={withdrawable}
            token={token}
            onSuccess={onSuccess}
          />
        )}

        {/* Sender: Pause + Cancel (when active) */}
        {isSender && isActive && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => run('pause', () => streamLib.pause(publicKey, streamAddress, signTx))}
              disabled={pending !== null}
              className="btn-secondary"
            >
              <Pause className="w-4 h-4" />
              {pending === 'pause' ? 'Pausing…' : 'Pause'}
            </button>
            <button
              onClick={() => run('cancel', () => streamLib.cancel(publicKey, streamAddress, signTx))}
              disabled={pending !== null}
              className="btn-secondary"
            >
              <X className="w-4 h-4" />
              {pending === 'cancel' ? 'Cancelling…' : 'Cancel'}
            </button>
          </div>
        )}

        {/* Sender: Resume + Cancel (when paused) */}
        {isSender && isPaused && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => run('resume', () => streamLib.resume(publicKey, streamAddress, signTx))}
              disabled={pending !== null}
              className="btn-secondary"
            >
              <Play className="w-4 h-4" />
              {pending === 'resume' ? 'Resuming…' : 'Resume'}
            </button>
            <button
              onClick={() => run('cancel', () => streamLib.cancel(publicKey, streamAddress, signTx))}
              disabled={pending !== null}
              className="btn-secondary"
            >
              <X className="w-4 h-4" />
              {pending === 'cancel' ? 'Cancelling…' : 'Cancel'}
            </button>
          </div>
        )}

        {/* Top up — sender, any non-terminal state */}
        {isSender && canAct && (
          <button
            className="btn-secondary w-full"
            onClick={() => setTopUpOpen(true)}
            disabled={pending !== null}
          >
            <Plus className="w-4 h-4" />
            {pending === 'topup' ? 'Processing…' : 'Top up'}
          </button>
        )}

        {/* Clawback — sender, active, enabled at creation */}
        {isSender && clawbackEnabled && isActive && (
          <button
            className="btn-ghost w-full text-xs text-gray-500"
            onClick={() => run('clawback', () => streamLib.clawback(publicKey, streamAddress, signTx))}
            disabled={pending !== null}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {pending === 'clawback' ? 'Reclaiming…' : 'Clawback unstreamed tokens'}
          </button>
        )}
      </div>

      {/* Top-up modal */}
      {topUpOpen && (
        <Modal title="Top up stream" onClose={() => { setTopUpOpen(false); setTopUpAmt(''); setTopUpErr(''); }}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Add more {token} to extend the stream&apos;s lifetime at the current rate.
            </p>
            <div>
              <label className="block text-xs font-semibold mb-1">
                Amount ({token})
              </label>
              <Input
                type="number"
                placeholder="100"
                value={topUpAmt}
                onChange={e => { setTopUpAmt(e.target.value); setTopUpErr(''); }}
                min="0"
                step="any"
              />
              {topUpErr && <p className="text-xs text-red-600 mt-1">{topUpErr}</p>}
            </div>
            <div className="flex gap-2">
              <button
                className="btn-primary flex-1"
                onClick={submitTopUp}
                disabled={pending === 'topup'}
              >
                {pending === 'topup' ? 'Signing…' : 'Confirm top-up'}
              </button>
              <button
                className="btn-secondary"
                onClick={() => { setTopUpOpen(false); setTopUpAmt(''); setTopUpErr(''); }}
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
