/**
 * Shared Stellar address validation (#310).
 *
 * Wraps @stellar/stellar-sdk's StrKey, which validates the full StrKey
 * format (version byte, base32 alphabet, and CRC16 checksum) instead of a
 * regex that only checks length and a loose character class. Ad-hoc regexes
 * copied across the app had drifted independently -- one (app/profile's
 * `[GA][A-Z0-9]{55}`) even accepted an `A`-prefixed string, which is not a
 * valid StrKey version byte at all (valid prefixes are G, C, M, S, T).
 */

import { StrKey } from '@stellar/stellar-sdk';

/** True for a valid ed25519 public key (G...) — a wallet/account address. */
export function isValidStellarPublicKey(address: string): boolean {
  return StrKey.isValidEd25519PublicKey(address);
}

/** True for a valid Soroban contract address (C...). */
export function isValidStellarContract(address: string): boolean {
  return StrKey.isValidContract(address);
}

/** True for either a public key (G...) or a contract address (C...). */
export function isValidStellarAddress(address: string): boolean {
  return isValidStellarPublicKey(address) || isValidStellarContract(address);
}

export interface FederationResolveOptions { signal?: AbortSignal; endpoint?: string; }

export function isFederationAddress(value: string): boolean {
  return /^[^*\s]+\*[A-Za-z0-9.-]+$/.test(value.trim());
}

export function parseFederationAddress(value: string): { account: string; domain: string } {
  const match = value.trim().match(/^([^*\s]+)\*([A-Za-z0-9.-]+)$/);
  if (!match) throw new Error('Invalid federation address (expected user*domain.com)');
  return { account: match[1], domain: match[2] };
}

/** Resolve a Stellar federation address such as `user*domain.com`. */
export async function resolveFederationAddress(federationAddress: string, options: FederationResolveOptions = {}): Promise<string> {
  const { domain } = parseFederationAddress(federationAddress);
  const endpoint = options.endpoint ?? `https://${domain}/federation`;
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Federation endpoint must use HTTP or HTTPS');
  url.searchParams.set('q', federationAddress.trim());
  url.searchParams.set('type', 'name');
  const response = await fetch(url, { signal: options.signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Federation lookup failed (${response.status})`);
  const payload = await response.json() as { account_id?: string };
  if (!payload.account_id || !isValidStellarPublicKey(payload.account_id)) throw new Error('Federation response did not contain a valid account');
  return payload.account_id;
}

/** True for a valid multiplexed Soroban address (M...) — used by centralized exchanges. */
export function isValidStellarMuxedAddress(address: string): boolean {
  return StrKey.isValidMuxedAccount(address);
}

/**
 * Extract sub-account ID from a multiplexed (M-) address (issue #804).
 * Multiplexed addresses are used by centralized exchanges to route customer deposits
 * to different accounts using a single main account with sub-account identifiers.
 */
export interface ParsedMuxedAddress {
  publicKey: string;
  subAccountId: string;
}

export function parseMuxedAddress(muxAddress: string): ParsedMuxedAddress {
  if (!isValidStellarMuxedAddress(muxAddress)) {
    throw new Error('Invalid multiplexed address: must be a valid M-address');
  }

  try {
    const muxedAccount = StrKey.decodeMuxedAccount(muxAddress);
    
    return {
      publicKey: muxedAccount.accountID,
      subAccountId: muxedAccount.id.toString(),
    };
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Failed to parse multiplexed address: ${error.message}`
        : 'Failed to parse multiplexed address'
    );
  }
}

/** True for either a public key (G...), contract address (C...), or multiplexed address (M...). */
export function isValidStellarAddressAny(address: string): boolean {
  return (
    isValidStellarPublicKey(address) ||
    isValidStellarContract(address) ||
    isValidStellarMuxedAddress(address)
  );
}
