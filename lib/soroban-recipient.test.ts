import { describe, it, expect, vi, beforeEach } from 'vitest';
import { xdr } from '@stellar/stellar-sdk';

// #391 — checkRecipientExists() decided "this recipient does not exist" by
// substring-matching the RPC error text for "not found" / "404". These tests
// pin the replacement: only the ledger's own answer (an empty `entries`
// array) means "does not exist"; every failure means "couldn't check".

const { mockGetLedgerEntries } = vi.hoisted(() => ({
  mockGetLedgerEntries: vi.fn(),
}));

vi.mock('./env.js', () => ({
  getRpcUrl:            vi.fn().mockReturnValue('https://soroban-testnet.stellar.org'),
  getNetworkPassphrase: vi.fn().mockReturnValue('Test SDF Network ; September 2015'),
  getFeeMultiplier:     vi.fn().mockReturnValue(2),
}));

vi.mock('@stellar/stellar-sdk', async () => {
  const actual = await vi.importActual<typeof import('@stellar/stellar-sdk')>('@stellar/stellar-sdk');
  return {
    ...actual,
    SorobanRpc: {
      ...actual.SorobanRpc,
      Server: class {
        getLedgerEntries = mockGetLedgerEntries;
      },
    },
  };
});

const { checkRecipientExists, resetServer } = await import('./soroban.js');
const { OperationAbortedError } = await import('./errors.js');

const ACCOUNT  = 'GABBG5LDGECWWCJN7NGP6JIVY6M2PDMZXHFIWDBMR5WKZFGF5NPOILDL';
const CONTRACT = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

/** The single ledger key checkRecipientExists asked the RPC for. */
function requestedKey(): xdr.LedgerKey {
  return mockGetLedgerEntries.mock.calls[0]![0] as xdr.LedgerKey;
}

describe('checkRecipientExists — existence comes from the ledger, not the error text', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetServer();
  });

  it('reports an account that has a ledger entry as existing', async () => {
    mockGetLedgerEntries.mockResolvedValue({ entries: [{ val: {} }], latestLedger: 1 });

    await expect(checkRecipientExists(ACCOUNT)).resolves.toBe(true);
    expect(requestedKey().switch().name).toBe('account');
  });

  it('reports an account with no ledger entry as not existing', async () => {
    mockGetLedgerEntries.mockResolvedValue({ entries: [], latestLedger: 1 });

    await expect(checkRecipientExists(ACCOUNT)).resolves.toBe(false);
  });

  it('looks up a contract recipient by its persistent instance entry', async () => {
    mockGetLedgerEntries.mockResolvedValue({ entries: [{ val: {} }], latestLedger: 1 });

    await expect(checkRecipientExists(CONTRACT)).resolves.toBe(true);

    const key = requestedKey();
    expect(key.switch().name).toBe('contractData');
    expect(key.contractData().durability().name).toBe('persistent');
    expect(key.contractData().key().switch().name).toBe('scvLedgerKeyContractInstance');
  });

  it('reports a contract with no instance entry as not existing', async () => {
    mockGetLedgerEntries.mockResolvedValue({ entries: [], latestLedger: 1 });

    await expect(checkRecipientExists(CONTRACT)).resolves.toBe(false);
  });

  // The three failures that #391 misreported as "recipient does not exist".
  it('throws rather than reporting "does not exist" on a JSON-RPC "Method not found"', async () => {
    mockGetLedgerEntries.mockRejectedValue({ code: -32601, message: 'Method not found' });

    await expect(checkRecipientExists(ACCOUNT)).rejects.toBeDefined();
  });

  it('throws rather than reporting "does not exist" on an HTTP 404 from a mistyped RPC URL', async () => {
    mockGetLedgerEntries.mockRejectedValue(new Error('Request failed with status code 404'));

    await expect(checkRecipientExists(ACCOUNT)).rejects.toThrow(/404/);
  });

  it('throws rather than reporting "does not exist" on a gateway error page', async () => {
    mockGetLedgerEntries.mockRejectedValue(new Error('404 Not Found — nginx'));

    await expect(checkRecipientExists(ACCOUNT)).rejects.toThrow(/not found/i);
  });

  it('throws on a malformed payload instead of treating a missing entries array as absence', async () => {
    mockGetLedgerEntries.mockResolvedValue({ latestLedger: 1 });

    await expect(checkRecipientExists(ACCOUNT)).rejects.toThrow(/malformed rpc payload/i);
  });

  it('rejects an address that is neither a G… key nor a C… contract without calling the RPC', async () => {
    await expect(checkRecipientExists('not-an-address')).rejects.toThrow(/not a valid stellar address/i);
    expect(mockGetLedgerEntries).not.toHaveBeenCalled();
  });

  it('surfaces cancellation as OperationAbortedError so callers can tell it from a failure', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(checkRecipientExists(ACCOUNT, { signal: controller.signal }))
      .rejects.toBeInstanceOf(OperationAbortedError);
    expect(mockGetLedgerEntries).not.toHaveBeenCalled();
  });

  it('times out instead of hanging when the RPC never answers', async () => {
    mockGetLedgerEntries.mockReturnValue(new Promise(() => {}));

    await expect(checkRecipientExists(ACCOUNT, { timeoutMs: 10 })).rejects.toThrow(/timed out/i);
  });
});
