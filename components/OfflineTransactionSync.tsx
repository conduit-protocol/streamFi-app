'use client';

import { useEffect } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { flushQueuedTransactions } from '@/lib/offline-transactions';

export function OfflineTransactionSync() {
  const { publicKey, signTx } = useWallet();
  useEffect(() => {
    if (!publicKey) return;
    const flush = () => void flushQueuedTransactions(signTx);
    window.addEventListener('online', flush);
    flush();
    return () => window.removeEventListener('online', flush);
  }, [publicKey, signTx]);
  return null;
}
