import type { QueryClient } from '@tanstack/react-query';

/**
 * Central, structured React Query keys (#431).
 *
 * Stream reads were previously unkeyed, so any stream action fell back to a
 * blanket `queryClient.invalidateQueries()` that marked every query in the app
 * stale and refetched the active ones (wallet balance, allowance, the full
 * /streams list, /dashboard, /transactions). Structured keys make a targeted
 * `invalidateQueries({ queryKey: queryKeys.streams.detail(address) })`
 * possible instead — new stream queries should adopt these.
 */
export const queryKeys = {
  wallet: {
    all: ['wallet'] as const,
    balance: (address: string) => ['wallet', 'balance', address] as const,
  },
  transactions: {
    all: ['transactions'] as const,
    list: (address: string | null) => ['transactions', address] as const,
  },
  streams: {
    all: ['stream'] as const,
    lists: () => ['stream', 'list'] as const,
    detail: (address: string) => ['stream', address] as const,
    info: (address: string) => ['stream', address, 'info'] as const,
    withdrawable: (address: string) => ['stream', address, 'withdrawable'] as const,
  },
  dashboard: {
    all: ['dashboard'] as const,
  },
} as const;

/**
 * Invalidate exactly the queries a single-stream mutation (pause / resume /
 * cancel / top-up / clawback / withdraw) can affect:
 *
 *  - that stream's own reads (`detail` is a prefix of `info` / `withdrawable`),
 *  - the streams list and dashboard aggregate that include it,
 *  - the transactions list, which gains a row,
 *  - the wallet balance, for the actions that move tokens.
 *
 * Replaces the unfiltered `queryClient.invalidateQueries()` in StreamActions
 * and WithdrawButton (#431).
 */
export async function invalidateStreamMutation(
  qc: QueryClient,
  streamAddress: string,
): Promise<void> {
  await Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.streams.detail(streamAddress) }),
    qc.invalidateQueries({ queryKey: queryKeys.streams.lists() }),
    qc.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
    qc.invalidateQueries({ queryKey: queryKeys.transactions.all }),
    qc.invalidateQueries({ queryKey: queryKeys.wallet.all }),
  ]);
}

// Extend with profile and allowance query keys (#448)
// These are appended after the existing queryKeys object and
// invalidateStreamMutation function.

export const extendedQueryKeys = {
  ...queryKeys,
  profile: {
    all: ['profile'] as const,
    summary: (address: string) => ['profile', address] as const,
  },
  allowance: {
    all: ['allowance'] as const,
    forToken: (owner: string, token: string) => ['allowance', owner, token] as const,
  },
} as const;

/**
 * Invalidate profile and allowance queries after a mutation (#448).
 * Call after invalidateStreamMutation to also refresh profile
 * aggregates and the token-allowance gateway state.
 */
export async function invalidateProfileAndAllowance(
  qc: QueryClient,
  address: string | null,
  token?: string,
): Promise<void> {
  if (!address) return;
  await Promise.all([
    qc.invalidateQueries({ queryKey: extendedQueryKeys.profile.summary(address) }),
    qc.invalidateQueries({ queryKey: extendedQueryKeys.allowance.all }),
    ...(token
      ? [qc.invalidateQueries({ queryKey: extendedQueryKeys.allowance.forToken(address, token) })]
      : []
    ),
  ]);
}
