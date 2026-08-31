import { describe, expect, it, vi, beforeEach } from 'vitest';
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
  resolveTokenBySymbol,
  networksForSymbol,
  networksForAddress,
} from './tokens';
import { StrKey, Keypair } from '@stellar/stellar-sdk';
import { resetTokenAllowanceGateway } from './token-allowance-gateway';
import * as soroban from './soroban';

vi.mock('./soroban', async () => {
  const actual = await vi.importActual<typeof import('./soroban')>('./soroban');
  return {
    ...actual,
    simulateReadOnly: vi.fn(),
    invokeContract: vi.fn(),
    scValToI128: (val: any) => {
      if (typeof val === 'bigint') return val;
      return 1000n;
    },
  };
});

const VALID_TOKEN = StrKey.encodeContract(Buffer.alloc(32, 1));
const VALID_SPENDER = StrKey.encodeContract(Buffer.alloc(32, 2));
const VALID_SOURCE = Keypair.random().publicKey();

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

describe('SEP-41 Token Allowance Helpers (#347, #348)', () => {
  beforeEach(() => {
    resetTokenAllowanceGateway();
    vi.clearAllMocks();
  });

  it('getAllowance throws an explicit error when source is missing (#348)', async () => {
    await expect(getAllowance('', VALID_TOKEN, VALID_SPENDER)).rejects.toThrow(
      /Missing required arguments for getAllowance/
    );
  });

  it('getAllowance throws an explicit error when tokenAddress is missing (#348)', async () => {
    await expect(getAllowance(VALID_SOURCE, '', VALID_SPENDER)).rejects.toThrow(
      /Missing required arguments for getAllowance/
    );
  });

  it('getAllowance throws an explicit error when spender is missing (#348)', async () => {
    await expect(getAllowance(VALID_SOURCE, VALID_TOKEN, '')).rejects.toThrow(
      /Missing required arguments for getAllowance/
    );
  });

  it('checkAllowance throws an explicit error when arguments are missing (#348)', async () => {
    await expect(checkAllowance('', VALID_TOKEN, VALID_SPENDER, 100n)).rejects.toThrow(
      /Missing required arguments for checkAllowance/
    );
  });

  it('approveAllowance throws an explicit error when arguments are missing (#348)', async () => {
    const mockSignTx = vi.fn();
    await expect(
      approveAllowance('', VALID_TOKEN, VALID_SPENDER, 100n, 500000, mockSignTx)
    ).rejects.toThrow(/Missing required arguments for approveAllowance/);
  });

  it('getAllowance returns the fetched allowance on success', async () => {
    vi.mocked(soroban.simulateReadOnly).mockResolvedValueOnce(5000n as any);
    const allowance = await getAllowance(VALID_SOURCE, VALID_TOKEN, VALID_SPENDER);
    expect(allowance).toBe(5000n);
  });

  it('checkAllowance reports hasAllowance status correctly', async () => {
    vi.mocked(soroban.simulateReadOnly).mockResolvedValueOnce(1000n as any);
    const result = await checkAllowance(VALID_SOURCE, VALID_TOKEN, VALID_SPENDER, 500n);
    expect(result.hasAllowance).toBe(true);
    expect(result.currentAllowance).toBe(1000n);
  });

  it('checkAllowance distinguishes RPC failure from insufficient allowance (hasAllowance undefined, not false)', async () => {
    vi.mocked(soroban.simulateReadOnly).mockRejectedValueOnce(new Error('Network request timed out'));
    const result = await checkAllowance(VALID_SOURCE, VALID_TOKEN, VALID_SPENDER, 500n);
    // Must NOT be `false` — false means "checked, insufficient" and would
    // trigger an unnecessary approve() and fee. Undefined means "couldn't check".
    expect(result.hasAllowance).toBeUndefined();
    expect(result.currentAllowance).toBe(0n);
    expect(result.error).toMatch(/Network request timed out/);
    // Callers must check error first; a falsy check `!hasAllowance` would
    // still be true for undefined, so the correct guard is `hasAllowance === false`.
    expect(result.hasAllowance === false).toBe(false);
  });

  it('approveAllowance calls SAC with 4 arguments and succeeds (#347)', async () => {
    vi.mocked(soroban.invokeContract).mockResolvedValueOnce({ hash: 'tx_hash_123' } as any);
    const mockSignTx = vi.fn().mockResolvedValue('signed');

    const result = await approveAllowance(
      VALID_SOURCE,
      VALID_TOKEN,
      VALID_SPENDER,
      2000n,
      600000,
      mockSignTx
    );

    expect(result.success).toBe(true);
    expect(result.txHash).toBe('tx_hash_123');
    expect(soroban.invokeContract).toHaveBeenCalledWith(
      VALID_SOURCE,
      VALID_TOKEN,
      'approve',
      expect.any(Array),
      expect.any(Function),
      expect.any(Object)
    );

    // Verify 4 arguments were passed to invokeContract
    const passedArgs = vi.mocked(soroban.invokeContract).mock.calls[0]![3] as unknown[];
    expect(passedArgs).toHaveLength(4);
  });
});
describe('resolveTokenBySymbol / cross-network helpers (#429)', () => {
  it('resolves a symbol that exists on the network without resetting', () => {
    const { token, wasReset } = resolveTokenBySymbol('USDC', 'mainnet');
    expect(token.symbol).toBe('USDC');
    expect(wasReset).toBe(false);
  });

  it('falls back to XLM with wasReset when the symbol is missing on the network', () => {
    // EURC is only in the testnet list.
    const { token, wasReset } = resolveTokenBySymbol('EURC', 'mainnet');
    expect(token.symbol).toBe('XLM');
    expect(wasReset).toBe(true);
  });

  it('does not reset for a symbol that does exist on the target network', () => {
    expect(resolveTokenBySymbol('EURC', 'testnet').wasReset).toBe(false);
  });

  it('reports which networks a symbol belongs to', () => {
    expect(networksForSymbol('EURC')).toEqual(['testnet']);
    expect(networksForSymbol('USDC').sort()).toEqual(['mainnet', 'testnet']);
    expect(networksForSymbol('DOGE')).toEqual([]);
  });

  it('reports which networks an address belongs to', () => {
    const eurc = TOKENS_TESTNET.find(t => t.symbol === 'EURC');
    expect(networksForAddress(eurc!.address!)).toEqual(['testnet']);
    expect(networksForAddress('CNOTATOKEN')).toEqual([]);
  });
});
