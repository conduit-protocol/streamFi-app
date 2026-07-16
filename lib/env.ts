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

/** Not yet read by any contract call — reserved for a future governor-config view. */
export function getGovernorContractId(): string | undefined {
  return process.env['NEXT_PUBLIC_GOVERNOR_CONTRACT_ID'] || undefined;
}

/** Optional — only used for classic-account balance lookups, not required for Soroban calls. */
export function getHorizonUrl(): string | undefined {
  return process.env['NEXT_PUBLIC_HORIZON_URL'] || undefined;
}
