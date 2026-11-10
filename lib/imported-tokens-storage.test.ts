import { describe, it, expect, beforeEach } from 'vitest';
import { StrKey } from '@stellar/stellar-sdk';
import {
  IMPORTED_TOKENS_STORAGE_KEY,
  loadImportedTokens,
  saveImportedToken,
  removeImportedToken,
  __clearImportedTokensMemory,
} from './imported-tokens-storage';

const TOKEN_A = StrKey.encodeContract(Buffer.alloc(32, 7));
const TOKEN_B = StrKey.encodeContract(Buffer.alloc(32, 8));

describe('imported-tokens-storage (#789)', () => {
  beforeEach(() => {
    localStorage.clear();
    __clearImportedTokensMemory();
  });

  it('returns an empty list when nothing is stored', () => {
    expect(loadImportedTokens('testnet')).toEqual([]);
  });

  it('persists an imported token and always marks it unverified', () => {
    saveImportedToken('testnet', {
      symbol: 'NEW', name: 'New Token', decimals: 7, address: TOKEN_A, verified: true,
    });
    expect(loadImportedTokens('testnet')).toEqual([
      { symbol: 'NEW', name: 'New Token', decimals: 7, address: TOKEN_A, verified: false },
    ]);
    expect(localStorage.getItem(IMPORTED_TOKENS_STORAGE_KEY)).toContain(TOKEN_A);
  });

  it('scopes imported tokens per network', () => {
    saveImportedToken('testnet', { symbol: 'NEW', name: 'New', decimals: 7, address: TOKEN_A });
    expect(loadImportedTokens('mainnet')).toEqual([]);
    expect(loadImportedTokens('testnet')).toHaveLength(1);
  });

  it('replaces an existing entry when the same address is re-imported', () => {
    saveImportedToken('testnet', { symbol: 'OLD', name: 'Old', decimals: 7, address: TOKEN_A });
    saveImportedToken('testnet', { symbol: 'NEW', name: 'New', decimals: 6, address: TOKEN_A });
    const list = loadImportedTokens('testnet');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ symbol: 'NEW', decimals: 6 });
  });

  it('removes an imported token', () => {
    saveImportedToken('testnet', { symbol: 'A', name: 'A', decimals: 7, address: TOKEN_A });
    saveImportedToken('testnet', { symbol: 'B', name: 'B', decimals: 7, address: TOKEN_B });
    expect(removeImportedToken('testnet', TOKEN_A).map(t => t.address)).toEqual([TOKEN_B]);
    expect(loadImportedTokens('testnet').map(t => t.address)).toEqual([TOKEN_B]);
  });

  it('rejects tokens without a valid contract address', () => {
    expect(() =>
      saveImportedToken('testnet', { symbol: 'X', name: 'X', decimals: 7, address: 'CNOTVALID' }),
    ).toThrow(/valid Soroban contract address/);
  });

  it('ignores malformed or tampered storage entries', () => {
    localStorage.setItem(
      IMPORTED_TOKENS_STORAGE_KEY,
      JSON.stringify({
        testnet: [
          { symbol: 'OK', name: 'Ok', decimals: 7, address: TOKEN_A },
          { symbol: 'BAD', name: 'Bad', decimals: 'seven', address: TOKEN_B },
          { symbol: 'BAD', name: 'Bad', decimals: 7, address: 'not-an-address' },
          null,
        ],
      }),
    );
    expect(loadImportedTokens('testnet').map(t => t.symbol)).toEqual(['OK']);
  });

  it('returns an empty list for unparseable storage', () => {
    localStorage.setItem(IMPORTED_TOKENS_STORAGE_KEY, '{not json');
    expect(loadImportedTokens('testnet')).toEqual([]);
  });
});
