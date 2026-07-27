import { describe, expect, it, vi } from 'vitest';
import {
  TOKENS_TESTNET,
  TOKENS_MAINNET,
  getTokens,
  tokenByAddress,
  tokenBySymbol,
  tokenLogoUrl,
  getAllowance,
  checkAllowance,
  approveAllowance,
} from './tokens';
import * as soroban from './soroban';

vi.mock('./soroban', async () => {
  const actual = await vi.importActual<typeof import('./soroban')>('./soroban');
  return {
    ...actual,
    simulateReadOnly: vi.fn(),
    invokeContract: vi.fn(),
  };
});

const SENDER = 'GBX5Y6CKRBK7TIUPAW67I2ZXWAV66WYFFEG5ZVY7MSEYPQ4HQ62GYPEL';
const TOKEN = 'CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ';
const SPENDER = 'CABAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAFNSZ';

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

describe('Token Allowance Gateway (promise rejection safety)', () => {
  it('getAllowance propagates RPC errors (does not silently return 0n)', async () => {
    vi.mocked(soroban.simulateReadOnly).mockRejectedValueOnce(new Error('RPC network failure'));

    await expect(getAllowance(SENDER, TOKEN, SPENDER)).rejects.toThrow('RPC network failure');
  });

  it('getAllowance returns 0n when parameters are missing', async () => {
    const allowance = await getAllowance('', TOKEN, SPENDER);
    expect(allowance).toBe(0n);
  });

  it('getAllowance propagates abort errors', async () => {
    vi.mocked(soroban.simulateReadOnly).mockRejectedValueOnce(new Error('AbortError: operation aborted'));

    await expect(getAllowance(SENDER, TOKEN, SPENDER)).rejects.toThrow('aborted');
  });

  it('checkAllowance surfaces errors in the result instead of silent zero', async () => {
    vi.mocked(soroban.simulateReadOnly).mockRejectedValueOnce(new Error('Simulation failed'));

    const result = await checkAllowance(SENDER, TOKEN, SPENDER, 1000n);
    expect(result).toEqual({
      hasAllowance: false,
      currentAllowance: 0n,
      error: 'Simulation failed',
    });
  });

  it('approveAllowance catches promise rejections gracefully without unhandled rejection', async () => {
    vi.mocked(soroban.invokeContract).mockRejectedValueOnce(new Error('User rejected signature'));
    const signTx = vi.fn().mockRejectedValue(new Error('Rejected'));

    const result = await approveAllowance(SENDER, TOKEN, SPENDER, 1000n, 1000000, signTx);
    expect(result).toEqual({
      success: false,
      error: 'User rejected signature',
    });
  });

  it('approveAllowance succeeds when invokeContract completes', async () => {
    vi.mocked(soroban.invokeContract).mockResolvedValueOnce('hash_approve_123');
    const signTx = vi.fn();

    const result = await approveAllowance(SENDER, TOKEN, SPENDER, 1000n, 1000000, signTx);
    expect(result).toEqual({
      success: true,
      txHash: 'hash_approve_123',
    });
  });
});
