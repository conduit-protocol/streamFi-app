'use client';

import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { useServiceWorker } from '@/lib/useServiceWorker';

export function promptUpdateToast(waitingWorker?: ServiceWorker | null) {
  return toast(
    (t) => (
      <span className="flex items-center gap-3" data-testid="sw-update-toast">
        <span className="font-medium text-xs">Update Available</span>
        <button
          type="button"
          onClick={() => {
            if (waitingWorker) {
              waitingWorker.postMessage({ type: 'SKIP_WAITING' });
            }
            toast.dismiss(t.id);
            if (typeof window !== 'undefined') {
              window.location.reload();
            }
          }}
          className="px-2 py-1 rounded bg-black text-white text-xs font-semibold dark:bg-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200"
          data-testid="sw-update-reload-btn"
        >
          Update App
        </button>
      </span>
    ),
    {
      id: 'app-update-available',
      duration: Infinity,
    }
  );
}

/**
 * Registers service worker for caching static assets including token icons (#766).
 * Prompts a toast notification when a new app version is available (#822).
 */
export function ServiceWorkerRegistrar() {
  useServiceWorker();

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const sw = navigator.serviceWorker;
    if (!sw) return;

    const notifyIfWaiting = (worker: ServiceWorker | null) => {
      if (!worker || !sw.controller) return;
      promptUpdateToast(worker);
    };

    if (typeof sw.getRegistration === 'function') {
      sw.getRegistration()
        .then((reg) => {
          if (!reg) return;

          if (reg.waiting) {
            notifyIfWaiting(reg.waiting);
          }

          if (typeof reg.addEventListener === 'function') {
            reg.addEventListener('updatefound', () => {
              const installing = reg.installing;
              if (!installing) return;
              installing.addEventListener('statechange', () => {
                if (installing.state === 'installed' && sw.controller) {
                  notifyIfWaiting(installing);
                }
              });
            });
          }
        })
        .catch(() => {});
    }
  }, []);

  return null;
}

