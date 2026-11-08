'use client';

import { useState, useEffect, useRef } from 'react';
import { Bell, X } from 'lucide-react';

/**
 * NotificationBell (#734)
 *
 * Dropdown bell that polls recent Horizon events for the connected wallet
 * and shows stream status alerts (paused, cliff reached, funds exhausted).
 */

interface StreamAlert {
  id: string;
  type: 'paused' | 'cliff' | 'funds_exhausted' | 'funded';
  message: string;
  timestamp: string;
  read: boolean;
}

const POLL_INTERVAL_MS = 60_000; // Poll every 60 seconds

export function NotificationBell() {
  const [alerts, setAlerts] = useState<StreamAlert[]>([]);
  const [open, setOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const unreadCount = alerts.filter(a => !a.read).length;

  useEffect(() => {
    // Check if wallet is connected via window.freighter or similar.
    // In a real app this would come from WalletContext.
    const hasWallet = typeof window !== 'undefined' && (
      !!(window as any).freighterApi || !!(window as any).freighter
    );
    setConnected(hasWallet);
    if (!hasWallet) return;

    // Poll for new alerts
    pollRef.current = setInterval(() => {
      // In a real app, fetch from Horizon or the indexer.
      // For now, this is a placeholder that demonstrates the UI.
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const markRead = (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true } : a));
  };

  const markAllRead = () => {
    setAlerts(prev => prev.map(a => ({ ...a, read: true })));
  };

  if (!connected) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="true"
        className="relative inline-flex items-center justify-center w-9 h-9 rounded text-gray-500 hover:text-black hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800 transition-colors"
      >
        <Bell className="w-4.5 h-4.5" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close notifications"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          {/* Dropdown */}
          <div
            role="dialog"
            aria-label="Notifications"
            className="absolute right-0 top-11 z-50 w-80 max-h-96 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-semibold">Stream Alerts</h3>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>

            {alerts.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                No notifications yet
              </div>
            ) : (
              <ul role="list" className="divide-y divide-gray-100 dark:divide-gray-800">
                {alerts.map(alert => (
                  <li
                    key={alert.id}
                    className={`px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 ${
                      !alert.read ? 'bg-blue-50 dark:bg-blue-950' : ''
                    }`}
                    onClick={() => markRead(alert.id)}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <p className={`text-sm ${!alert.read ? 'font-medium' : ''}`}>
                          {alert.message}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {new Date(alert.timestamp).toLocaleString()}
                        </p>
                      </div>
                      {!alert.read && (
                        <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5" aria-hidden="true" />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
