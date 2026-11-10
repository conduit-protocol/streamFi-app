import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { useTransactionStore, type TransactionStatus } from './store';

// Module-level guard so a remount, React StrictMode's double-invoke, or a
// second <ServiceWorkerRegistrar> can't kick off a duplicate registration
// (#351).
let registrationStarted = false;

const TERMINAL_TRANSACTION_STATUSES = new Set<TransactionStatus>(['success', 'failed']);

export function hasInFlightTransactions(): boolean {
  return Object.values(useTransactionStore.getState().transactions).some(
    (tx) => !TERMINAL_TRANSACTION_STATUSES.has(tx.status),
  );
}

/**
 * Register `/sw.js` once per page load and activate a new worker when one ships.
 *
 * Without update handling a changed `sw.js` installs but sits in `waiting`
 * forever — existing users keep the old (previously "always-caching") worker
 * until every tab is closed. Here, when a new worker reaches `installed` while
 * one is already controlling the page, we ask it to take over. If transactions
 * are still signing/broadcasting/confirming, the reload waits until they settle
 * so the app does not discard an in-flight operation.
 */
export function useServiceWorker() {
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      registrationStarted
    ) {
      return;
    }
    registrationStarted = true;

    let reloading = false;
    let unsubscribeFromTransactions: (() => void) | undefined;

    const reloadPage = () => {
      if (reloading) return;
      reloading = true;
      unsubscribeFromTransactions?.();
      window.location.reload();
    };

    const reloadWhenSafe = () => {
      if (!hasInFlightTransactions()) {
        reloadPage();
        return;
      }

      toast('Update available. The app will reload after pending transactions finish.', {
        id: 'service-worker-update',
        duration: 5000,
      });

      unsubscribeFromTransactions?.();
      unsubscribeFromTransactions = useTransactionStore.subscribe(() => {
        if (!hasInFlightTransactions()) {
          reloadPage();
        }
      });
    };

    const onControllerChange = () => {
      reloadWhenSafe();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const promoteWhenReady = (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        // When a new worker finishes installing while another controls the page,
        // it enters the 'waiting' state. Users are notified to click 'Update App'
        // before SKIP_WAITING is sent (#822).
      });
    };

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        const periodicSync = (registration as ServiceWorkerRegistration & {
          periodicSync?: { register: (tag: string, options: { minInterval: number }) => Promise<void> };
        }).periodicSync;
        void periodicSync?.register('conduit-cache-update', { minInterval: 24 * 60 * 60 * 1000 });
        promoteWhenReady(registration.installing);
        registration.addEventListener('updatefound', () => {
          promoteWhenReady(registration.installing);
        });
      })
      .catch((error) => {
        registrationStarted = false;
        console.error('Service Worker registration failed:', error);
      });

    return () => {
      unsubscribeFromTransactions?.();
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);
}
