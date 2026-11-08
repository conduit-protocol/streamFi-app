'use client';

import { useEffect, useState } from 'react';
import {
  dismissNotificationPermissionPrompt,
  requestNotificationPermissionAfterFirstStream,
  shouldRequestNotificationPermission,
} from '@/lib/notifications';

interface FirstStreamNotificationPromptProps {
  /** True when this render follows the creation of the user's first stream. */
  firstStream: boolean;
  className?: string;
}

/**
 * Contextual notification opt-in shown after a stream is created (#810).
 * Asking here — rather than on first page load — means the request arrives
 * right after the user has seen value, and the browser prompt is triggered by
 * an explicit click instead of a cold landing-page visit.
 */
export function FirstStreamNotificationPrompt({
  firstStream,
  className = '',
}: FirstStreamNotificationPromptProps) {
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setVisible(firstStream && shouldRequestNotificationPermission());
  }, [firstStream]);

  if (!visible) return null;

  const handleEnable = async () => {
    setVisible(false);
    setError(null);
    const result = await requestNotificationPermissionAfterFirstStream();
    if (result === 'denied') {
      setError('Notifications are blocked in your browser settings.');
    }
  };

  const handleDismiss = () => {
    dismissNotificationPermissionPrompt();
    setVisible(false);
  };

  return (
    <div
      role="status"
      className={`border border-gray-200 dark:border-gray-700 rounded px-3 py-3 mt-6 text-left ${className}`}
    >
      <p className="text-sm font-semibold dark:text-white">Get notified when your stream pays out</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        We can let you know when funds are ready to withdraw and when a claim confirms.
      </p>
      {error && (
        <p role="alert" className="text-xs text-red-600 mt-2">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2 mt-3">
        <button type="button" onClick={() => void handleEnable()} className="btn-primary text-xs">
          Enable notifications
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="text-xs underline text-gray-400 hover:text-black dark:hover:text-white"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
