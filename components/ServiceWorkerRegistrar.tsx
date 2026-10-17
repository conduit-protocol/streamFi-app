'use client';

import { useServiceWorker } from '@/lib/useServiceWorker';

/**
 * Registers service worker for caching static assets including token icons (#766).
 */
export function ServiceWorkerRegistrar() {
  useServiceWorker();
  return null;
}
