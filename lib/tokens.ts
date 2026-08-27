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

export function getTokens(network: 'mainnet' | 'testnet' | 'local'): TokenMeta[] {
  return network === 'mainnet' ? TOKENS_MAINNET : TOKENS_TESTNET;
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

// ── Token Allowance Helpers (SEP-41) ──────────────────────────────────────────

import {
  getTokenAllowanceGateway,
  DEFAULT_EXPIRATION_LEDGER,
} from './token-allowance-gateway';

export interface AllowanceResult {
  hasAllowance: boolean;
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
      hasAllowance: false,
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
  expirationLedger: number = DEFAULT_EXPIRATION_LEDGER,
  signTx: (xdr: string, signal?: AbortSignal) => Promise<string>,
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

