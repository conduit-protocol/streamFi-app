import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ENV_KEYS = [
  'NEXT_PUBLIC_SOROBAN_RPC_URL',
  'NEXT_PUBLIC_NETWORK_PASSPHRASE',
  'NEXT_PUBLIC_FACTORY_CONTRACT_ID',
  'NEXT_PUBLIC_GOVERNOR_CONTRACT_ID',
  'NEXT_PUBLIC_HORIZON_URL',
  'NEXT_PUBLIC_SOROBAN_FEE_MULTIPLIER',
] as const;

const original: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    original[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

describe('getRpcUrl / getNetworkPassphrase / getFactoryContractId', () => {
  it('throws a clear, actionable error naming the missing var', async () => {
    const { getRpcUrl } = await import('./env.js');
    expect(() => getRpcUrl()).toThrow(/NEXT_PUBLIC_SOROBAN_RPC_URL/);
    expect(() => getRpcUrl()).toThrow(/\.env\.local/);
  });

  it('returns the value once set', async () => {
    process.env['NEXT_PUBLIC_SOROBAN_RPC_URL'] = 'https://soroban-testnet.stellar.org';
    const { getRpcUrl } = await import('./env.js');
    expect(getRpcUrl()).toBe('https://soroban-testnet.stellar.org');
  });

  it('getNetworkPassphrase names its own var when missing', async () => {
    const { getNetworkPassphrase } = await import('./env.js');
    expect(() => getNetworkPassphrase()).toThrow(/NEXT_PUBLIC_NETWORK_PASSPHRASE/);
  });

  it('getFactoryContractId names its own var when missing', async () => {
    const { getFactoryContractId } = await import('./env.js');
    expect(() => getFactoryContractId()).toThrow(/NEXT_PUBLIC_FACTORY_CONTRACT_ID/);
  });
});

describe('getGovernorContractId / getHorizonUrl', () => {
  it('return undefined rather than throwing when unset (optional)', async () => {
    const { getGovernorContractId, getHorizonUrl } = await import('./env.js');
    expect(getGovernorContractId()).toBeUndefined();
    expect(getHorizonUrl()).toBeUndefined();
  });

  it('return the value once set', async () => {
    process.env['NEXT_PUBLIC_HORIZON_URL'] = 'https://horizon-testnet.stellar.org';
    const { getHorizonUrl } = await import('./env.js');
    expect(getHorizonUrl()).toBe('https://horizon-testnet.stellar.org');
  });
});
describe('getFeeMultiplier (#428)', () => {
  it('defaults to 2 when the var is unset', async () => {
    const { getFeeMultiplier } = await import('./env.js');
    expect(getFeeMultiplier()).toBe(2);
  });

  it('accepts a value inside [1, 10], including the boundaries', async () => {
    const { getFeeMultiplier } = await import('./env.js');
    process.env['NEXT_PUBLIC_SOROBAN_FEE_MULTIPLIER'] = '3.5';
    expect(getFeeMultiplier()).toBe(3.5);
    process.env['NEXT_PUBLIC_SOROBAN_FEE_MULTIPLIER'] = '1';
    expect(getFeeMultiplier()).toBe(1);
    process.env['NEXT_PUBLIC_SOROBAN_FEE_MULTIPLIER'] = '10';
    expect(getFeeMultiplier()).toBe(10);
  });

  it('rejects a fat-fingered 200 and warns, falling back to the default', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env['NEXT_PUBLIC_SOROBAN_FEE_MULTIPLIER'] = '200';
    const { getFeeMultiplier } = await import('./env.js');
    expect(getFeeMultiplier()).toBe(2);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('rejects a non-numeric value and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env['NEXT_PUBLIC_SOROBAN_FEE_MULTIPLIER'] = 'fast';
    const { getFeeMultiplier } = await import('./env.js');
    expect(getFeeMultiplier()).toBe(2);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('rejects zero and negative values', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { getFeeMultiplier } = await import('./env.js');
    process.env['NEXT_PUBLIC_SOROBAN_FEE_MULTIPLIER'] = '0';
    expect(getFeeMultiplier()).toBe(2);
    process.env['NEXT_PUBLIC_SOROBAN_FEE_MULTIPLIER'] = '-3';
    expect(getFeeMultiplier()).toBe(2);
    vi.restoreAllMocks();
  });
});
