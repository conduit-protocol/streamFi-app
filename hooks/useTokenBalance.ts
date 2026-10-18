'use client';

import { useQuery, type QueryClient } from '@tanstack/react-query';

export const tokenBalanceKey = (address: string, token: string) =>
  ['tokenBalance', address, token] as const;

/**
 * Invalidate a token balance after a deposit (create stream / top-up) so the
 * displayed balance reflects the deducted funds immediately (#756).
 */
export function invalidateTokenBalance(
  qc: QueryClient,
  address: string | null | undefined,
  token: string | null | undefined,
): Promise<void> {
  if (!address || !token) return Promise.resolve();
  return qc.invalidateQueries({ queryKey: tokenBalanceKey(address, token) });
}

export function useTokenBalance(
  address: string | null | undefined,
  token: string | null | undefined,
  fetchBalance: (address: string, token: string) => Promise<bigint>,
) {
  return useQuery({
    queryKey: tokenBalanceKey(address ?? '', token ?? ''),
    queryFn: () => fetchBalance(address as string, token as string),
    enabled: !!address && !!token,
  });
}
