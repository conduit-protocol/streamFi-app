/**
 * Global RPC / network-health signal.
 *
 * The Soroban circuit breaker in `lib/soroban.ts` already tracks per-endpoint
 * transport failures, but that state lives in a module-local Map with no way
 * for the UI to react to it. This module is the bridge: `lib/soroban.ts`
 * reports transport failures and healthy round-trips here, and the UI
 * subscribes so a single dismissible "network trouble" banner can stand in for
 * a dozen per-card error states when the RPC is unreachable or the breaker is
 * open (see conduit-protocol/streamFi-app "Offline / RPC-down banner").
 *
 * It is deliberately framework-agnostic — no React — so `lib/` can import it
 * without a dependency cycle and it can be unit-tested in isolation.
 */

export type NetworkStatus = 'ok' | 'trouble';

type Listener = (status: NetworkStatus) => void;

const listeners = new Set<Listener>();

let status: NetworkStatus = 'ok';

// Bumped every time we enter a fresh trouble episode (an `ok -> trouble`
// transition). The banner remembers which episode the user dismissed so a
// later, unrelated outage shows the banner again instead of staying hidden.
let episode = 0;

export function getNetworkStatus(): NetworkStatus {
  return status;
}

export function getNetworkEpisode(): number {
  return episode;
}

function emit(): void {
  for (const listener of listeners) listener(status);
}

/**
 * Subscribe to status changes. The listener fires only on an actual
 * transition. Returns an unsubscribe function.
 */
export function subscribeNetworkStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * A Soroban RPC round-trip failed at the transport level, or a call was
 * refused because the circuit breaker is open. No-op if we already know the
 * network is in trouble.
 */
export function reportRpcFailure(): void {
  if (status === 'trouble') return;
  status = 'trouble';
  episode++;
  emit();
}

/**
 * A Soroban RPC round-trip completed — a successful read/submit, or an
 * on-chain revert (the RPC itself worked). No-op if we already believe the
 * network is healthy.
 */
export function reportRpcSuccess(): void {
  if (status === 'ok') return;
  status = 'ok';
  emit();
}

/** Test-only: restore module state between cases. */
export function resetNetworkStatus(): void {
  status = 'ok';
  episode = 0;
  listeners.clear();
}
