'use client';

import { useQuery } from '@tanstack/react-query';
import { getHorizonUrl } from '@/lib/env';
import { queryKeys } from '@/lib/query-keys';

/** Below this much native XLM, fees and reserves start failing (#757). */
export const LOW_RESERVE_THRESHOLD_XLM = 2.0;

export function isLowReserve(nativeBalance: number | null | undefined): boolean {
  if (nativeBalance == null || Number.isNaN(nativeBalance)) return false;
  return nativeBalance < LOW_RESERVE_THRESHOLD_XLM;
}

interface HorizonBalance {
  asset_type: string;
  balance: string;
}

export async function fetchNativeBalance(address: string): Promise<number | null> {
  const horizon = getHorizonUrl();
  if (!horizon) return null;
  const res = await fetch(`${horizon.replace(/\/$/, '')}/accounts/${address}`);
  if (res.status === 404) return 0;
  if (!res.ok) throw new Error(`Horizon request failed (${res.status})`);
  const body = (await res.json()) as { balances?: HorizonBalance[] };
  const native = body.balances?.find((b) => b.asset_type === 'native');
  return native ? Number(native.balance) : 0;
}

export function useWalletBalance(address: string | null | undefined) {
  const query = useQuery({
    queryKey: queryKeys.wallet.balance(address ?? ''),
    queryFn: () => fetchNativeBalance(address as string),
    enabled: !!address,
  });

  return {
    ...query,
    balance: query.data ?? null,
    isLowReserve: isLowReserve(query.data),
  };
}
