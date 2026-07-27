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
  tryGetFactoryContractId: () => mockGetFactoryContractId(),
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

  it('gracefully falls back to mock data when factory contract ID is not set', async () => {
    vi.resetModules();
    mockGetFactoryContractId.mockReturnValue(undefined);
    const { streamCount } = await import('./factory.js');
    await expect(streamCount(SENDER)).resolves.toBe(5n); // MOCK_STREAM_IDS.length
  });
});

describe('streamsBySender / streamsByRecipient', () => {
  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an out-of-range pagination value (%s)',
    async (value) => {
      const { streamsBySender } = await import('./factory.js');
      await expect(streamsBySender(SENDER, SENDER, value, 20)).rejects.toThrow(RangeError);
      expect(mockSimulateReadOnly).not.toHaveBeenCalled();
    },
  );

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
      undefined,
    );
  });

  // Regression test for issue #209: options.signal was accepted in the
  // signature but silently dropped before reaching simulateReadOnly, so
  // aborting never actually cancelled the in-flight call.
  it.each([
    ['streamsBySender', SENDER] as const,
    ['streamsByRecipient', RECIPIENT] as const,
  ])('%s forwards options.signal to simulateReadOnly so aborting cancels the call', async (fnName, addr) => {
    const controller = new AbortController();
    mockSimulateReadOnly.mockImplementation((...args: unknown[]) => {
      const options = args[4] as { signal?: AbortSignal } | undefined;
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    });

    const factory = await import('./factory.js');
    const fn = factory[fnName] as (
      source: string, addr: string, offset: number, limit: number, options?: { signal?: AbortSignal },
    ) => Promise<bigint[]>;

    const promise = fn(SENDER, addr, 0, 20, { signal: controller.signal });
    controller.abort();

    await expect(promise).rejects.toThrow(/aborted/i);
    expect(mockSimulateReadOnly).toHaveBeenCalledWith(
      SENDER, FACTORY_ID, expect.any(String), expect.any(Array), { signal: controller.signal },
    );
  });

  // A malformed RPC response (e.g. a simulation error page or a stale node
  // returning the wrong shape) can hand back a non-vec ScVal. This used to
  // crash with a raw TypeError from the `.vec()!` non-null assertion instead
  // of a boundary-checked, catchable error.
  it('rejects a non-vec result instead of crashing on the vec() assertion', async () => {
    mockSimulateReadOnly.mockResolvedValue(xdr.ScVal.scvVoid());
    const { streamsBySender } = await import('./factory.js');
    await expect(streamsBySender(SENDER, SENDER, 0, 20)).rejects.toThrow(/expected a vec/i);
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
