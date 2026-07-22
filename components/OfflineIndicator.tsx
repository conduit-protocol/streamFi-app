'use client';

import { useEffect, useState } from 'react';

interface OfflineIndicatorProps {
  className?: string;
}

export function OfflineIndicator({ className = '' }: OfflineIndicatorProps) {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) {
    return null;
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
      You are currently offline. Some features are limited.
    </div>
  );
}
