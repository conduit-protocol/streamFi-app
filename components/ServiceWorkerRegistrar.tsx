'use client';

import { useServiceWorker } from '@/lib/useServiceWorker';

export function ServiceWorkerRegistrar() {
  useServiceWorker();
  return null;
}
