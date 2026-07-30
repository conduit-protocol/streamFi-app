import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      refetchOnWindowFocus: false,
    },
  },
});

export async function refreshStreamData(): Promise<void> {
  try {
    await queryClient.invalidateQueries({ refetchType: 'active' });
  } catch (error) {
    console.warn('Failed to refresh stream data after a transaction.', error);
  }
}
