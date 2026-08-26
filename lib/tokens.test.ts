import { describe, expect, it } from 'vitest';
import {
  TOKENS_TESTNET,
  TOKENS_MAINNET,
  getTokens,
  tokenByAddress,
  tokenBySymbol,
  tokenLogoUrl,
} from './tokens';

describe('tokens module', () => {
  it('returns testnet tokens by default', () => {
    expect(getTokens('testnet')).toEqual(TOKENS_TESTNET);
  });

  it('returns mainnet tokens when requested', () => {
    expect(getTokens('mainnet')).toEqual(TOKENS_MAINNET);
  });

  it('looks up tokens by symbol or address', () => {
    const usdc = TOKENS_TESTNET.find((t) => t.symbol === 'USDC');
    expect(tokenBySymbol('USDC', 'testnet')).toEqual(usdc);
    expect(tokenByAddress(usdc!.address!, 'testnet')).toEqual(usdc);
  });

  it('resolves token logo URLs with safe fallback', () => {
    expect(tokenLogoUrl('USDC')).toBe('/tokens/usdc.svg');
    expect(tokenLogoUrl('UNKNOWN')).toBe('/tokens/generic.svg');
  });
});
