import { describe, it, expect } from 'vitest';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import {
  isValidStellarPublicKey,
  isValidStellarContract,
  isValidStellarAddress,
} from './stellar-address';

describe('stellar-address', () => {
  // Known valid addresses
  const validPubKey1 = 'GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR';
  const validPubKey2 = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
  const generatedPubKey = Keypair.random().publicKey();

  const validContract1 = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
  const validContract2 = 'CCDT45LNPDPGPJGWNMWN7F3D7QNLBE2SZN4YY7GDKMLS4YVFV7QIB7N6';
  const generatedContract = StrKey.encodeContract(Buffer.alloc(32, 42));

  // Invalid addresses / other key types
  const secretKey = Keypair.random().secret(); // Starts with 'S'
  const malformedChecksum = validPubKey1.slice(0, -1) + (validPubKey1.endsWith('A') ? 'B' : 'A');
  const arbitraryString = 'not-a-stellar-address';
  const aPrefixedString = 'A' + validPubKey1.slice(1);

  describe('isValidStellarPublicKey', () => {
    it('returns true for valid ed25519 public keys (G...)', () => {
      expect(isValidStellarPublicKey(validPubKey1)).toBe(true);
      expect(isValidStellarPublicKey(validPubKey2)).toBe(true);
      expect(isValidStellarPublicKey(generatedPubKey)).toBe(true);
    });

    it('returns false for Soroban contract addresses (C...)', () => {
      expect(isValidStellarPublicKey(validContract1)).toBe(false);
      expect(isValidStellarPublicKey(validContract2)).toBe(false);
      expect(isValidStellarPublicKey(generatedContract)).toBe(false);
    });

    it('returns false for secret keys (S...)', () => {
      expect(isValidStellarPublicKey(secretKey)).toBe(false);
    });

    it('returns false for addresses with invalid checksums or characters', () => {
      expect(isValidStellarPublicKey(malformedChecksum)).toBe(false);
      expect(isValidStellarPublicKey(validPubKey1.toLowerCase())).toBe(false);
      expect(isValidStellarPublicKey(aPrefixedString)).toBe(false);
    });

    it('returns false for empty, truncated, or whitespace-padded strings', () => {
      expect(isValidStellarPublicKey('')).toBe(false);
      expect(isValidStellarPublicKey('G')).toBe(false);
      expect(isValidStellarPublicKey(validPubKey1.slice(0, 20))).toBe(false);
      expect(isValidStellarPublicKey(` ${validPubKey1} `)).toBe(false);
      expect(isValidStellarPublicKey(arbitraryString)).toBe(false);
    });
  });

  describe('isValidStellarContract', () => {
    it('returns true for valid Soroban contract addresses (C...)', () => {
      expect(isValidStellarContract(validContract1)).toBe(true);
      expect(isValidStellarContract(validContract2)).toBe(true);
      expect(isValidStellarContract(generatedContract)).toBe(true);
    });

    it('returns false for ed25519 public keys (G...)', () => {
      expect(isValidStellarContract(validPubKey1)).toBe(false);
      expect(isValidStellarContract(validPubKey2)).toBe(false);
      expect(isValidStellarContract(generatedPubKey)).toBe(false);
    });

    it('returns false for secret keys (S...)', () => {
      expect(isValidStellarContract(secretKey)).toBe(false);
    });

    it('returns false for malformed contract addresses', () => {
      const corruptContract = validContract1.slice(0, -1) + (validContract1.endsWith('A') ? 'B' : 'A');
      expect(isValidStellarContract(corruptContract)).toBe(false);
      expect(isValidStellarContract(validContract1.toLowerCase())).toBe(false);
      expect(isValidStellarContract('')).toBe(false);
      expect(isValidStellarContract(` ${validContract1} `)).toBe(false);
      expect(isValidStellarContract(arbitraryString)).toBe(false);
    });
  });

  describe('isValidStellarAddress', () => {
    it('returns true for valid public keys (G...)', () => {
      expect(isValidStellarAddress(validPubKey1)).toBe(true);
      expect(isValidStellarAddress(validPubKey2)).toBe(true);
      expect(isValidStellarAddress(generatedPubKey)).toBe(true);
    });

    it('returns true for valid contract addresses (C...)', () => {
      expect(isValidStellarAddress(validContract1)).toBe(true);
      expect(isValidStellarAddress(validContract2)).toBe(true);
      expect(isValidStellarAddress(generatedContract)).toBe(true);
    });

    it('returns false for secret keys (S...)', () => {
      expect(isValidStellarAddress(secretKey)).toBe(false);
    });

    it('returns false for invalid addresses, empty strings, and random strings', () => {
      expect(isValidStellarAddress('')).toBe(false);
      expect(isValidStellarAddress(malformedChecksum)).toBe(false);
      expect(isValidStellarAddress(aPrefixedString)).toBe(false);
      expect(isValidStellarAddress(arbitraryString)).toBe(false);
      expect(isValidStellarAddress('GCFIR')).toBe(false);
    });
  });
});
