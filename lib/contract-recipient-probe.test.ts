/**
 * contract-recipient-probe.test.ts
 *
 * Covers checkContractHasWithdraw: happy path (returns true), simulation
 * error (returns false), and abort signal handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSimulateReadOnly = vi.fn();

vi.mock('./soroban.js', () => ({
  simulateReadOnly: mockSimulateReadOnly,
}));

const CONTRACT = 'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const SOURCE   = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

beforeEach(() => {
  mockSimulateReadOnly.mockReset();
});

describe('checkContractHasWithdraw', () => {
  it('returns true when the simulation succeeds', async () => {
    mockSimulateReadOnly.mockResolvedValue(undefined);
    const { checkContractHasWithdraw } = await import('./contract-recipient-probe.js');
    const result = await checkContractHasWithdraw(CONTRACT, SOURCE);
    expect(result).toBe(true);
    expect(mockSimulateReadOnly).toHaveBeenCalledWith(
      SOURCE,
      CONTRACT,
      'withdraw',
      expect.any(Array),
      expect.objectContaining({ timeoutMs: 10_000 }),
    );
  });

  it('returns false when the simulation throws', async () => {
    mockSimulateReadOnly.mockRejectedValue(new Error('function not found'));
    const { checkContractHasWithdraw } = await import('./contract-recipient-probe.js');
    const result = await checkContractHasWithdraw(CONTRACT, SOURCE);
    expect(result).toBe(false);
  });

  it('returns false when the simulation returns a HostFunctionError', async () => {
    mockSimulateReadOnly.mockRejectedValue(new Error('HostFunctionError: unknown'));
    const { checkContractHasWithdraw } = await import('./contract-recipient-probe.js');
    const result = await checkContractHasWithdraw(CONTRACT, SOURCE);
    expect(result).toBe(false);
  });

  it('passes the abort signal through to simulateReadOnly', async () => {
    mockSimulateReadOnly.mockResolvedValue(undefined);
    const controller = new AbortController();
    const { checkContractHasWithdraw } = await import('./contract-recipient-probe.js');
    await checkContractHasWithdraw(CONTRACT, SOURCE, { signal: controller.signal });
    expect(mockSimulateReadOnly).toHaveBeenCalledWith(
      SOURCE,
      CONTRACT,
      'withdraw',
      expect.any(Array),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('passes custom timeoutMs through to simulateReadOnly', async () => {
    mockSimulateReadOnly.mockResolvedValue(undefined);
    const { checkContractHasWithdraw } = await import('./contract-recipient-probe.js');
    await checkContractHasWithdraw(CONTRACT, SOURCE, { timeoutMs: 5000 });
    expect(mockSimulateReadOnly).toHaveBeenCalledWith(
      SOURCE,
      CONTRACT,
      'withdraw',
      expect.any(Array),
      expect.objectContaining({ timeoutMs: 5000 }),
    );
  });
});
