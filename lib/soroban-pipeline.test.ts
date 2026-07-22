import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { xdr } from '@stellar/stellar-sdk';

// This file tests invokeContract()/simulateReadOnly()'s control flow — the
// simulate → assemble → sign → submit → poll pipeline and its error paths —
// by mocking Contract/TransactionBuilder/SorobanRpc.Server entirely, rather
// than constructing real signed transaction envelopes. What's under test is
// the wrapper logic (does it call things in the right order, does it surface
// each failure mode correctly), not stellar-sdk's own XDR encoding.

const {
  mockGetAccount, mockSimulate, mockSend, mockGetTransaction, mockAssemble,
} = vi.hoisted(() => ({
  mockGetAccount:     vi.fn(),
  mockSimulate:       vi.fn(),
  mockSend:           vi.fn(),
  mockGetTransaction: vi.fn(),
  mockAssemble:       vi.fn(),
}));

vi.mock('./env.js', () => ({
  getRpcUrl:            vi.fn().mockReturnValue('https://soroban-testnet.stellar.org'),
  getNetworkPassphrase: vi.fn().mockReturnValue('Test SDF Network ; September 2015'),
}));

vi.mock('@stellar/stellar-sdk', async () => {
  const actual = await vi.importActual<typeof import('@stellar/stellar-sdk')>('@stellar/stellar-sdk');

  class MockContract {
    constructor(public id: string) {}
    call(method: string, ...args: unknown[]) { return { method, args }; }
  }

  class MockTransactionBuilder {
    constructor(_account: unknown, _opts: unknown) {}
    addOperation(_op: unknown) { return this; }
    setTimeout(_n: number) { return this; }
    build() {
      return { toEnvelope: () => ({ toXDR: () => 'unsigned-envelope-b64' }) };
    }
    static fromXDR(xdrStr: string, passphrase: string) {
      return { _signedTx: true, xdrStr, passphrase };
    }
  }

  return {
    ...actual,
    Contract: MockContract,
    TransactionBuilder: MockTransactionBuilder,
    SorobanRpc: {
      ...actual.SorobanRpc,
      Server: class {
        getAccount          = mockGetAccount;
        simulateTransaction = mockSimulate;
        sendTransaction     = mockSend;
        getTransaction      = mockGetTransaction;
      },
      assembleTransaction: mockAssemble,
    },
  };
});

const SOURCE      = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';
const CONTRACT_ID = 'CCWAMYJME27OHTPKVSV252YRPXEO4BSKBHVLQ7ML3OWYNMB5RQEVHSM';

function simSuccess(retval?: xdr.ScVal) {
  return retval === undefined
    ? { transactionData: {} }
    : { transactionData: {}, result: { retval } };
}

function simMissingRetval() {
  return { transactionData: {}, result: {} };
}

function simError(message: string) {
  return { error: message };
}

beforeEach(() => {
  vi.useFakeTimers();
  mockGetAccount.mockReset().mockResolvedValue({ accountId: () => SOURCE, sequenceNumber: () => '1' });
  mockSimulate.mockReset();
  mockSend.mockReset().mockResolvedValue({ status: 'PENDING', hash: 'deadbeef' });
  mockGetTransaction.mockReset();
  mockAssemble.mockReset().mockReturnValue({
    build: () => ({ toEnvelope: () => ({ toXDR: () => 'assembled-envelope-b64' }) }),
  });
});

afterEach(() => {
  vi.useRealTimers();
});

async function runThroughFirstPoll<T>(fn: () => Promise<T>): Promise<T> {
  const promise = fn();
  promise.catch(() => {});
  await vi.advanceTimersByTimeAsync(1000);
  return promise;
}

describe('invokeContract', () => {
  it('simulates, signs via the provided callback, submits, and returns the hash on success', async () => {
    mockSimulate.mockResolvedValue(simSuccess());
    mockGetTransaction.mockResolvedValue({ status: 'SUCCESS' });
    const signTx = vi.fn().mockResolvedValue('signed-envelope-b64');

    const { invokeContract } = await import('./soroban.js');
    const hash = await runThroughFirstPoll(() =>
      invokeContract(SOURCE, CONTRACT_ID, 'withdraw', [], signTx),
    );

    expect(hash).toBe('deadbeef');
    expect(signTx).toHaveBeenCalledWith('assembled-envelope-b64');
  });

  it('throws on simulation failure without ever calling signTx', async () => {
    mockSimulate.mockResolvedValue(simError('HostError: Error(Contract, #6)'));
    const signTx = vi.fn();

    const { invokeContract } = await import('./soroban.js');
    await expect(invokeContract(SOURCE, CONTRACT_ID, 'withdraw', [], signTx))
      .rejects.toThrow(/Simulation failed/);
    expect(signTx).not.toHaveBeenCalled();
  });

  it('throws when the submitted transaction is rejected', async () => {
    mockSimulate.mockResolvedValue(simSuccess());
    mockSend.mockResolvedValue({ status: 'ERROR', errorResult: 'boom' });
    const signTx = vi.fn().mockResolvedValue('signed-envelope-b64');

    const { invokeContract } = await import('./soroban.js');
    await expect(invokeContract(SOURCE, CONTRACT_ID, 'withdraw', [], signTx))
      .rejects.toThrow(/Submission failed/);
  });

  it('throws when the transaction fails on-chain', async () => {
    mockSimulate.mockResolvedValue(simSuccess());
    mockGetTransaction.mockResolvedValue({ status: 'FAILED' });
    const signTx = vi.fn().mockResolvedValue('signed-envelope-b64');

    const { invokeContract } = await import('./soroban.js');
    await expect(runThroughFirstPoll(() =>
      invokeContract(SOURCE, CONTRACT_ID, 'withdraw', [], signTx),
    )).rejects.toThrow(/Transaction failed/);
  });
});

describe('simulateReadOnly', () => {
  it('returns the decoded simulation result', async () => {
    const retval = xdr.ScVal.scvU32(42);
    mockSimulate.mockResolvedValue(simSuccess(retval));

    const { simulateReadOnly } = await import('./soroban.js');
    const result = await simulateReadOnly(SOURCE, CONTRACT_ID, 'stream_count', []);
    expect(result.u32()).toBe(42);
  });

  it('throws on simulation error', async () => {
    mockSimulate.mockResolvedValue(simError('HostError: Error(Contract, #2)'));
    const { simulateReadOnly } = await import('./soroban.js');
    await expect(simulateReadOnly(SOURCE, CONTRACT_ID, 'info', []))
      .rejects.toThrow(/Simulation error/);
  });

  it('throws when simulation succeeds but returns no result', async () => {
    mockSimulate.mockResolvedValue(simSuccess());
    const { simulateReadOnly } = await import('./soroban.js');
    await expect(simulateReadOnly(SOURCE, CONTRACT_ID, 'info', []))
      .rejects.toThrow(/No result returned/);
  });

  it('throws when simulation succeeds but omits retval', async () => {
    mockSimulate.mockResolvedValue(simMissingRetval());
    const { simulateReadOnly } = await import('./soroban.js');
    await expect(simulateReadOnly(SOURCE, CONTRACT_ID, 'info', []))
      .rejects.toThrow(/No result returned/);
  });
});
