import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './query-keys';

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60, // 1 minute
        refetchOnWindowFocus: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

/**
 * Returns a QueryClient instance. On the server, a new instance is created
 * per-request to avoid leaking state across concurrent requests in the App Router (#345).
 * In the browser, a singleton is preserved.
 */
export function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    // Server: always create a new query client per request
    return makeQueryClient();
  } else {
    // Browser: reuse browser singleton across components
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}

/**
 * Browser singleton QueryClient instance.
 */
export const queryClient: QueryClient = getQueryClient();

export async function refreshStreamData(): Promise<void> {
  try {
    const qc = getQueryClient();
    // Only the stream-related trees, not every active query in the app
    // (flagged in #215 / #354, structured for #431).
    await Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.streams.all, refetchType: 'active' }),
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all, refetchType: 'active' }),
      qc.invalidateQueries({ queryKey: queryKeys.transactions.all, refetchType: 'active' }),
    ]);
  } catch (error) {
    console.warn('Failed to refresh stream data after a transaction.', error);
  }
}
