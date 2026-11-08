'use client';

import { useEffect, useState, useCallback } from 'react';
import { queuedTransactions } from '@/lib/offline-transactions';

interface OfflineIndicatorProps {
  className?: string;
  /** #738 — Set to true while a transaction is being signed to show a more urgent banner */
  isSigning?: boolean;
}

/**
 * #738 — Display banner when network connection is lost during transaction sign.
 *
 * When `isSigning` is true and the connection drops, shows an urgent warning
 * banner so the user knows their transaction will be queued, not lost.
 */
export function OfflineIndicator({ className = '', isSigning = false }: OfflineIndicatorProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [queuedCount, setQueuedCount] = useState(0);
  const [retrying, setRetrying] = useState(false);

  // #794 — Ping Horizon to manually test connectivity
  const handleRetry = useCallback(async () => {
    setRetrying(true);
    try {
      const horizonUrl = process.env.NEXT_PUBLIC_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
      await fetch(horizonUrl, { method: 'HEAD', cache: 'no-store' });
      setIsOnline(true);
    } catch {
      setIsOnline(false);
    } finally {
      setRetrying(false);
    }
  }, []);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    setQueuedCount(queuedTransactions().length);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleQueueChange = () => setQueuedCount(queuedTransactions().length);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('offline-transactions-changed', handleQueueChange);
    window.addEventListener('storage', handleQueueChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('offline-transactions-changed', handleQueueChange);
      window.removeEventListener('storage', handleQueueChange);
    };
  }, []);

  if (isOnline) {
    return null;
  }

  const queueMessage =
    queuedCount === 0
      ? 'transactions will be queued.'
      : `${queuedCount} transaction${queuedCount === 1 ? '' : 's'} queued for sync.`;

  // #738 — During transaction signing, show a more urgent banner
  if (isSigning) {
    return (
      <div
        className={`
          fixed top-0 left-0 right-0 bg-red-600 dark:bg-red-700
          text-white text-sm px-4 py-3 text-center
          z-50 shadow-lg ${className}
        `}
        role="alert"
        aria-live="assertive"
        aria-label="Connection lost during transaction"
      >
        <strong>Connection lost.</strong> Your transaction will be queued and submitted automatically when you reconnect.
      </div>
    );
  }

  return (
    <div
      className={`
        fixed bottom-4 right-4 bg-gray-900 dark:bg-gray-100
        text-white dark:text-black text-xs px-3 py-2 rounded
        border border-gray-700 dark:border-gray-300 z-50 ${className}
      `}
      role="status"
      aria-live="polite"
      aria-label="Offline status"
    >
      <span>You are currently offline. Cached data is shown; {queueMessage}</span>
      <button
        type="button"
        onClick={handleRetry}
        disabled={retrying}
        aria-label="Retry connection"
        className="ml-2 underline disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {retrying ? 'Retrying…' : 'Retry Connection'}
      </button>
    </div>
  );
}
