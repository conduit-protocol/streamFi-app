'use client';

import { useEffect, useRef, useState } from 'react';
import { UserX } from 'lucide-react';
import { Card }              from '@/components/ui/Card';
import { useWallet }         from '@/contexts/WalletContext';
import * as streamLib        from '@/lib/stream';
import { truncateAddress }   from '@/lib/format';
import { queryClient }       from '@/lib/queryClient';
import { invalidateStreamMutation } from '@/lib/query-keys';

interface OperatorInfoProps {
  streamAddress: string;
  operator:      string;
  isSender:      boolean;
  onSuccess?:    () => void;
}

/**
 * Shows the stream's delegated operator, if one is set, and lets the sender
 * revoke it. Renders nothing when there's no operator — callers should still
 * guard on `info.operator` before mounting this (see stream detail page).
 */
export function OperatorInfo({ streamAddress, operator, isSender, onSuccess }: OperatorInfoProps) {
  const { publicKey, signTx } = useWallet();
  const mounted = useRef(true);
  const [pending, setPending] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    return () => { mounted.current = false; };
  }, []);

  async function handleRevoke() {
    if (!publicKey) return;
    setPending(true);
    setError(null);
    try {
      await streamLib.revokeOperator(publicKey, streamAddress, signTx);
      if (!mounted.current) return;
      await invalidateStreamMutation(queryClient, streamAddress);
      onSuccess?.();
    } catch (e) {
      if (!mounted.current) return;
      console.error('[revoke-operator] error:', e);
      setError(e instanceof Error ? e.message : 'Failed to revoke operator.');
    } finally {
      if (mounted.current) setPending(false);
    }
  }

  return (
    <Card>
      <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">
        Delegated operator
      </h3>
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-sm text-black dark:text-white">
          {truncateAddress(operator)}
        </span>
        {isSender && (
          <button
            onClick={handleRevoke}
            disabled={pending}
            className="btn-secondary text-xs"
          >
            <UserX className="w-3.5 h-3.5" />
            {pending ? 'Revoking…' : 'Revoke'}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </Card>
  );
}
