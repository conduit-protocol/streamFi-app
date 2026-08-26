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
