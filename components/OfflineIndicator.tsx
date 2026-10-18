'use client';

import { useEffect, useState } from 'react';
import { queuedTransactions } from '@/lib/offline-transactions';

interface OfflineIndicatorProps {
  className?: string;
}

export function OfflineIndicator({ className = '' }: OfflineIndicatorProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [queuedCount, setQueuedCount] = useState(0);

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
      You are currently offline. Cached data is shown; {queueMessage}
    </div>
  );
}
