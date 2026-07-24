'use client';

import { useEffect, useState } from 'react';

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<string[]>([]);

  useEffect(() => {
    const handleNotification = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail) {
        setNotifications((prev) => [...prev, customEvent.detail]);
      }
    };

    window.addEventListener('notification', handleNotification);

    // Fix: Add cleanup for the event listener to prevent memory bloat
    return () => {
      window.removeEventListener('notification', handleNotification);
    };
  }, []);

  return (
    <div className="fixed bottom-0 right-0 p-4">
      {notifications.map((note, idx) => (
        <div key={idx} className="bg-white p-2 shadow rounded mb-2">
          {note}
        </div>
      ))}
    </div>
  );
}
