'use client';

import { useEffect, useRef, useState } from 'react';

const MAX_NOTIFICATIONS = 5;

/**
 * Timeout (ms) after which a notification is automatically dismissed.
 * Prevents stale loading-state notifications from hanging indefinitely
 * if the RPC provider times out and no dismissal event is dispatched.
 */
const NOTIFICATION_TTL_MS = 10_000;

export interface NotificationItem {
  id: number;
  message: string;
  /** Timestamp the notification was added — used to schedule auto-dismiss. */
  addedAt: number;
}

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const counterRef = useRef(0);

  useEffect(() => {
    const timers = new Map<number, ReturnType<typeof setTimeout>>();

    const dismiss = (id: number) => {
      timers.delete(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    };

    const handleNotification = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (typeof detail === 'string' && detail) {
        const id = ++counterRef.current;
        const item: NotificationItem = { id, message: detail, addedAt: Date.now() };

        setNotifications((prev) => {
          const next = [...prev, item];
          // If we're over the cap, cancel timers for the notifications being evicted
          const evicted = next.slice(0, next.length - MAX_NOTIFICATIONS);
          evicted.forEach((n) => {
            const t = timers.get(n.id);
            if (t !== undefined) clearTimeout(t);
            timers.delete(n.id);
          });
          return next.slice(-MAX_NOTIFICATIONS);
        });

        // Auto-dismiss after TTL so a hung RPC call never leaves a spinner on screen.
        timers.set(id, setTimeout(() => dismiss(id), NOTIFICATION_TTL_MS));
      }
    };

    window.addEventListener('notification', handleNotification);

    return () => {
      window.removeEventListener('notification', handleNotification);
      // Clear all pending auto-dismiss timers on unmount.
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  if (notifications.length === 0) return null;

  return (
    <div
      className="fixed bottom-0 right-0 p-4 space-y-2"
      role="status"
      aria-live="polite"
      aria-label="Notifications"
    >
      {notifications.map((note) => (
        <div
          key={note.id}
          className="bg-white dark:bg-gray-800 text-black dark:text-white p-3 shadow-md rounded-lg mb-2 text-sm max-w-xs"
        >
          {note.message}
        </div>
      ))}
    </div>
  );
}
