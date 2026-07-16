import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Keypair, StrKey, xdr } from '@stellar/stellar-sdk';

const { mockSimulateReadOnly, mockInvokeContract, mockGetFactoryContractId } = vi.hoisted(() => ({
  mockSimulateReadOnly:      vi.fn(),
  mockInvokeContract:        vi.fn(),
  mockGetFactoryContractId:  vi.fn(),
}));

vi.mock('./soroban.js', () => ({
  simulateReadOnly: mockSimulateReadOnly,
  invokeContract:   mockInvokeContract,
  scValToU64: (v: xdr.ScVal) => BigInt(v.u64().toString()),
}));

vi.mock('./env.js', () => ({
  getFactoryContractId: mockGetFactoryContractId,
}));

const FACTORY_ID = StrKey.encodeContract(Buffer.alloc(32, 1));
const SENDER     = Keypair.random().publicKey();
const RECIPIENT  = Keypair.random().publicKey();
const TOKEN      = StrKey.encodeContract(Buffer.alloc(32, 2));

function u64Vec(...values: bigint[]): xdr.ScVal {
  return xdr.ScVal.scvVec(values.map(v => xdr.ScVal.scvU64(xdr.Uint64.fromString(v.toString()))));
}

function u64(n: bigint): xdr.ScVal {
  return xdr.ScVal.scvU64(xdr.Uint64.fromString(n.toString()));
}

beforeEach(() => {
  mockSimulateReadOnly.mockReset();
  mockInvokeContract.mockReset();
  mockGetFactoryContractId.mockReset().mockReturnValue(FACTORY_ID);
});

describe('streamCount', () => {
  it('decodes the u64 result', async () => {
    mockSimulateReadOnly.mockResolvedValue(u64(42n));
    const { streamCount } = await import('./factory.js');
    expect(await streamCount(SENDER)).toBe(42n);
    expect(mockSimulateReadOnly).toHaveBeenCalledWith(SENDER, FACTORY_ID, 'stream_count', []);
  });

  it('propagates the missing-env-var error instead of silently using an empty contract ID', async () => {
    // factory.ts memoizes the resolved contract ID at module scope
    // (`_factory ??= getFactoryContractId()`) — reset modules so this test
    // gets a fresh, unmemoized instance rather than reusing whatever a
    // previous test already cached.
    vi.resetModules();
    mockGetFactoryContractId.mockImplementation(() => {
      throw new Error('Missing required environment variable: NEXT_PUBLIC_FACTORY_CONTRACT_ID.');
    });
    const { streamCount } = await import('./factory.js');
    await expect(streamCount(SENDER)).rejects.toThrow(/NEXT_PUBLIC_FACTORY_CONTRACT_ID/);
  });
});

describe('streamsBySender / streamsByRecipient', () => {
  it('decodes an empty vec as an empty array', async () => {
    mockSimulateReadOnly.mockResolvedValue(xdr.ScVal.scvVec([]));
    const { streamsBySender } = await import('./factory.js');
    expect(await streamsBySender(SENDER, SENDER, 0, 20)).toEqual([]);
  });

  it('decodes a vec of stream IDs', async () => {
    mockSimulateReadOnly.mockResolvedValue(u64Vec(0n, 1n, 7n));
    const { streamsBySender } = await import('./factory.js');
    expect(await streamsBySender(SENDER, SENDER, 0, 20)).toEqual([0n, 1n, 7n]);
  });

  it('streamsByRecipient parses identically and passes recipient through', async () => {
    mockSimulateReadOnly.mockResolvedValue(u64Vec(3n));
    const { streamsByRecipient } = await import('./factory.js');
    const ids = await streamsByRecipient(SENDER, RECIPIENT, 5, 10);
    expect(ids).toEqual([3n]);
    expect(mockSimulateReadOnly).toHaveBeenCalledWith(
      SENDER, FACTORY_ID, 'streams_by_recipient',
      expect.arrayContaining([expect.anything(), expect.anything(), expect.anything()]),
    );
  });
});

describe('createStream', () => {
  it('invokes create_stream on the factory contract with all args', async () => {
    mockInvokeContract.mockResolvedValue('deadbeef');
    const { createStream } = await import('./factory.js');
    const signTx = vi.fn();

    const hash = await createStream({
      sender:     SENDER,
      recipient:  RECIPIENT,
      token:      TOKEN,
      deposit:    1_000_000n,
      ratePerSec: 100n,
      startTime:  1_700_000_000,
      endTime:    1_700_003_600,
      clawback:   false,
    }, signTx);

    expect(hash).toBe('deadbeef');
    expect(mockInvokeContract).toHaveBeenCalledWith(
      SENDER, FACTORY_ID, 'create_stream', expect.any(Array), signTx,
    );
    // sender, recipient, token, deposit, rate, start, end, clawback
    expect(mockInvokeContract.mock.calls[0]?.[3]).toHaveLength(8);
  });
});
