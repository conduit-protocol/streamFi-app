import { useEffect } from 'react';

// Module-level guard so a remount, React StrictMode's double-invoke, or a
// second <ServiceWorkerRegistrar> can't kick off a duplicate registration
// (#351).
let registrationStarted = false;

/**
 * Register `/sw.js` once per page load and activate a new worker when one ships.
 *
 * Without update handling a changed `sw.js` installs but sits in `waiting`
 * forever — existing users keep the old (previously "always-caching") worker
 * until every tab is closed. Here, when a new worker reaches `installed` while
 * one is already controlling the page, we ask it to take over and reload once
 * it does.
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
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const promoteWhenReady = (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        // A new worker finished installing while another controls the page →
        // there's an update waiting. Tell it to skip `waiting`; `sw.js` should
        // handle a `SKIP_WAITING` message (a no-op if it doesn't, in which
        // case the update lands on the next full close).
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          worker.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    };

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
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
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);
}
