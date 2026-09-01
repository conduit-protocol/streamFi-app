/**
 * Known Stellar asset contracts for each network.
 *
 * Addresses here are testnet by default. Update for mainnet.
 * See: https://stellar.expert/explorer/testnet
 */

export interface TokenMeta {
  symbol: string;
  name: string;
  decimals: number;
  /** Stellar asset contract address — undefined for native XLM */
  address?: string;
  logoUrl?: string;
}

export const TOKENS_TESTNET: TokenMeta[] = [
  {
    symbol: 'XLM',
    name: 'Stellar Lumens',
    decimals: 7,
    // Native XLM is accessed via the Stellar Asset Contract (SAC)
    address: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
    logoUrl: '/tokens/xlm.svg',
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 7,
    address: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
    // Circle's USDC logo — NOT the Tether (USDT) icon (issue #142).
    logoUrl: '/tokens/usdc.svg',
  },
  {
    symbol: 'EURC',
    name: 'Euro Coin',
    decimals: 7,
    // Derived from Circle's published testnet issuer
    // (EURC-GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO, see
    // https://developers.circle.com/stablecoins/eurc-contract-addresses)
    // via `new Asset('EURC', issuer).contractId(Networks.TESTNET)`. The
    // previous value here was USDC's issuer G-address (not even a contract
    // address) pasted in by mistake.
    address: 'CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ',
    logoUrl: '/tokens/eurc.svg',
  },
];

export const TOKENS_MAINNET: TokenMeta[] = [
  {
    symbol: 'XLM',
    name: 'Stellar Lumens',
    decimals: 7,
    address: 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA',
    logoUrl: '/tokens/xlm.svg',
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 7,
    address: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
    logoUrl: '/tokens/usdc.svg',
  },
];

export const TOKENS_LOCAL: TokenMeta[] = [];

export function getTokens(network: 'mainnet' | 'testnet' | 'local'): TokenMeta[] {
  if (network === 'mainnet') return TOKENS_MAINNET;
  if (network === 'local') return TOKENS_LOCAL;
  return TOKENS_TESTNET;
}

export function tokenByAddress(address: string, network: 'mainnet' | 'testnet' | 'local'): TokenMeta | undefined {
  return getTokens(network).find(t => t.address === address);
}

export function tokenBySymbol(symbol: string, network: 'mainnet' | 'testnet' | 'local'): TokenMeta | undefined {
  return getTokens(network).find(t => t.symbol === symbol);
}

/**
 * Resolve a token's logo URL by symbol. Each symbol maps to its own logo, so
 * USDC never falls back to (or is confused with) another asset's icon such as
 * USDT (issue #142). Returns a neutral placeholder when the symbol is unknown.
 */
export function tokenLogoUrl(symbol: string, network: 'mainnet' | 'testnet' | 'local' = 'testnet'): string {
  return tokenBySymbol(symbol, network)?.logoUrl ?? '/tokens/generic.svg';
}

/**
 * Symbol used as the safe fallback when a previously-selected token is not
 * available on the active network (#429). It is present on every network list.
 */
export const DEFAULT_TOKEN_SYMBOL = 'XLM';

export interface TokenResolution {
  /** The resolved token — never `undefined`; falls back to {@link DEFAULT_TOKEN_SYMBOL}. */
  token: TokenMeta;
  /** `true` when `symbol` was absent on `network` and the default was substituted. */
  wasReset: boolean;
}

/**
 * Resolve a token by symbol on a network, falling back to that network's
 * default token (XLM) instead of returning `undefined`.
 *
 * The testnet and mainnet symbol sets differ — testnet has EURC, mainnet does
 * not (#429) — so a symbol carried over from a previous network selection can
 * be missing on the new one, leaving `TokenSelector` with no selection and
 * breaking `/create` / top-up flows that assume a resolved `TokenMeta`.
 * Callers that need a concrete token should use this and surface `wasReset`
 * (e.g. a toast) rather than dereferencing a possibly-`undefined` lookup.
 */
export function resolveTokenBySymbol(
  symbol: string,
  network: 'mainnet' | 'testnet' | 'local',
): TokenResolution {
  const match = tokenBySymbol(symbol, network);
  if (match) return { token: match, wasReset: false };

  const list = getTokens(network);
  const fallback = list.find(t => t.symbol === DEFAULT_TOKEN_SYMBOL) ?? list[0];
  if (!fallback) {
    throw new Error(`No tokens configured for network "${network}"`);
  }
  return { token: fallback, wasReset: true };
}

/**
 * The networks on which `symbol` is a known token. Lets the UI say "EURC
 * exists on testnet but not mainnet" instead of a bare "unknown token".
 */
export function networksForSymbol(symbol: string): Array<'mainnet' | 'testnet'> {
  const networks: Array<'mainnet' | 'testnet'> = [];
  if (TOKENS_MAINNET.some(t => t.symbol === symbol)) networks.push('mainnet');
  if (TOKENS_TESTNET.some(t => t.symbol === symbol)) networks.push('testnet');
  return networks;
}

/** Companion to {@link networksForSymbol} for the address-based selector. */
export function networksForAddress(address: string): Array<'mainnet' | 'testnet'> {
  const networks: Array<'mainnet' | 'testnet'> = [];
  if (TOKENS_MAINNET.some(t => t.address === address)) networks.push('mainnet');
  if (TOKENS_TESTNET.some(t => t.address === address)) networks.push('testnet');
  return networks;
}

// ── Token Allowance Helpers (SEP-41) ──────────────────────────────────────────

import {
  getTokenAllowanceGateway,
  DEFAULT_EXPIRATION_LEDGER,
} from './token-allowance-gateway';

export interface AllowanceResult {
  /**
   * Whether the spender has sufficient allowance.
   * - `true`  → allowance >= requiredAmount (checked, sufficient)
   * - `false` → allowance < requiredAmount (checked, insufficient — needs approve)
   * - `undefined` → allowance could not be checked (e.g. transient RPC failure).
   *   Callers MUST check `error` first and retry the read rather than treating
   *   `undefined` as "needs approval", otherwise a hiccup triggers an
   *   unnecessary SEP-41 approve() transaction and fee.
   */
  hasAllowance: boolean | undefined;
  currentAllowance: bigint;
  error?: string;
}

export interface ApproveResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Fetch token allowance from a Stellar Asset Contract (SAC).
 * Throws an explicit error if required arguments are missing (#348)
 * or if the network/contract call fails.
 */
export async function getAllowance(
  source: string,
  tokenAddress: string,
  spender: string,
  options?: { signal?: AbortSignal },
): Promise<bigint> {
  if (!source || !tokenAddress || !spender) {
    throw new Error(
      'Missing required arguments for getAllowance: source, tokenAddress, and spender are all required',
    );
  }

  const gateway = getTokenAllowanceGateway();
  const res = await gateway.checkAllowance({
    token: tokenAddress,
    owner: source,
    spender,
    source,
    signal: options?.signal,
  });

  if (!res.success) {
    throw new Error(res.error?.message ?? 'Failed to check token allowance');
  }

  return res.data ?? 0n;
}

/**
 * Check whether the source address has sufficient token allowance for spender.
 * Throws an explicit error on missing arguments (#348), returns structured status on check completion.
 *
 * IMPORTANT: On a successful RPC read, `hasAllowance` is `true`|`false` and
 * `error` is absent. On a transient RPC/network failure, `hasAllowance` is
 * `undefined` and `error` is set — callers must surface the error and retry
 * the read rather than treating it as "insufficient allowance" (which would
 * trigger an unnecessary approve() transaction and fee).
 */
export async function checkAllowance(
  source: string,
  tokenAddress: string,
  spender: string,
  requiredAmount: bigint,
  options?: { signal?: AbortSignal },
): Promise<AllowanceResult> {
  if (!source || !tokenAddress || !spender) {
    throw new Error(
      'Missing required arguments for checkAllowance: source, tokenAddress, and spender are all required',
    );
  }

  try {
    const currentAllowance = await getAllowance(source, tokenAddress, spender, options);
    return {
      hasAllowance: currentAllowance >= requiredAmount,
      currentAllowance,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to check token allowance';
    return {
      hasAllowance: undefined,
      currentAllowance: 0n,
      error: message,
    };
  }
}

/**
 * Approve a token allowance for a spender on a Stellar Asset Contract (SEP-41).
 * Calls approve with 4 arguments: (from, spender, amount, expiration_ledger).
 */
export async function approveAllowance(
  source: string,
  tokenAddress: string,
  spender: string,
  amount: bigint,
  signTx: (xdr: string, signal?: AbortSignal) => Promise<string>,
  expirationLedger: number = DEFAULT_EXPIRATION_LEDGER,
  options?: { signal?: AbortSignal },
): Promise<ApproveResult> {
  if (!source || !tokenAddress || !spender) {
    throw new Error(
      'Missing required arguments for approveAllowance: source, tokenAddress, and spender are all required',
    );
  }

  const gateway = getTokenAllowanceGateway();
  const res = await gateway.approve({
    token: tokenAddress,
    spender,
    amount,
    source,
    expirationLedger,
    signTx,
    signal: options?.signal,
  });

  if (!res.success) {
    return {
      success: false,
      error: res.error?.message ?? 'Token approval failed',
    };
  }

  return {
    success: true,
    txHash: res.data,
  };
}
