/**
 * Centralizes NEXT_PUBLIC_ env var access with a clear error instead of the
 * `process.env['X']!` non-null assertions previously scattered across
 * lib/soroban.ts, lib/factory.ts, and lib/stream.ts — those failed deep
 * inside unrelated Address/Contract construction if a var was unset,
 * instead of a message that says which var is missing.
 *
 * Reads happen lazily (inside functions, not at module-load time): Next.js's
 * `next build` static-generation pass evaluates client-page modules before
 * .env.local is guaranteed loaded for every route, and throwing at import
 * time would fail the build for pages that never touch Soroban (e.g. the
 * static /about page) if they end up transitively importing this module.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Set it in .env.local (see .env.example).`,
    );
  }
  return value;
}

export function getRpcUrl(): string {
  return required('NEXT_PUBLIC_SOROBAN_RPC_URL');
}

export function getNetworkPassphrase(): string {
  return required('NEXT_PUBLIC_NETWORK_PASSPHRASE');
}

export function getFactoryContractId(): string {
  return required('NEXT_PUBLIC_FACTORY_CONTRACT_ID');
}

export function tryGetFactoryContractId(): string | undefined {
  return process.env['NEXT_PUBLIC_FACTORY_CONTRACT_ID'] || undefined;
}

/** Not yet read by any contract call — reserved for a future governor-config view. */
export function getGovernorContractId(): string | undefined {
  return process.env['NEXT_PUBLIC_GOVERNOR_CONTRACT_ID'] || undefined;
}

/** Optional — only used for classic-account balance lookups, not required for Soroban calls. */
export function getHorizonUrl(): string | undefined {
  return process.env['NEXT_PUBLIC_HORIZON_URL'] || undefined;
}

const DEFAULT_FEE_MULTIPLIER = 2;

/**
 * Multiplier applied over the network's observed inclusion fee (and over
 * BASE_FEE as a floor) when building contract transactions.
 *
 * A bid of exactly BASE_FEE (100 stroops) is the network minimum and is not
 * selected under any inclusion-fee pressure, which surfaced to users as a
 * misleading "transaction timed out" instead of "fee too low" (see #360).
 * Defaults to 2×; ignores non-numeric or non-positive values.
 */
export function getFeeMultiplier(): number {
  const raw = process.env['NEXT_PUBLIC_SOROBAN_FEE_MULTIPLIER'];
  if (!raw) return DEFAULT_FEE_MULTIPLIER;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_FEE_MULTIPLIER;
  return parsed;
}
