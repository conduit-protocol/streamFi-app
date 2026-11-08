'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getHorizonUrl } from '@/lib/env';
import { queryKeys } from '@/lib/query-keys';

/** Below this much native XLM, fees and reserves start failing (#757). */
export const LOW_RESERVE_THRESHOLD_XLM = 2.0;

/** LocalStorage key for optimistic native XLM balance display (#813). */
export const CACHED_XLM_BALANCE_KEY = 'cached_xlm_balance';

export function getCachedXlmBalance(): number | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return null;
  }
  try {
    const raw = localStorage.getItem(CACHED_XLM_BALANCE_KEY);
    if (raw === null || raw.trim() === '') return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function setCachedXlmBalance(balance: number): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(CACHED_XLM_BALANCE_KEY, String(balance));
  } catch {
    // Ignore storage quota or private mode errors
  }
}

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
  if (res.status === 404) {
    setCachedXlmBalance(0);
    return 0;
  }
  if (!res.ok) throw new Error(`Horizon request failed (${res.status})`);
  const body = (await res.json()) as { balances?: HorizonBalance[] };
  const native = body.balances?.find((b) => b.asset_type === 'native');
  const bal = native ? Number(native.balance) : 0;
  setCachedXlmBalance(bal);
  return bal;
}

export function useWalletBalance(address: string | null | undefined) {
  const query = useQuery({
    queryKey: queryKeys.wallet.balance(address ?? ''),
    queryFn: () => fetchNativeBalance(address as string),
    enabled: !!address,
    initialData: () => {
      if (!address) return undefined;
      const cached = getCachedXlmBalance();
      return cached ?? undefined;
    },
  });

  useEffect(() => {
    if (typeof query.data === 'number') {
      setCachedXlmBalance(query.data);
    }
  }, [query.data]);

  return {
    ...query,
    balance: query.data ?? null,
    isLowReserve: isLowReserve(query.data),
  };
}
