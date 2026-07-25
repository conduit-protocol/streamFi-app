import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Address, Keypair, StrKey, xdr } from '@stellar/stellar-sdk';

const { mockSimulateReadOnly, mockInvokeContract, mockGetFactoryContractId } = vi.hoisted(() => ({
  mockSimulateReadOnly:     vi.fn(),
  mockInvokeContract:       vi.fn(),
  mockGetFactoryContractId: vi.fn(),
}));

vi.mock('./soroban.js', () => ({
  simulateReadOnly: mockSimulateReadOnly,
  invokeContract:   mockInvokeContract,
  scValToI128: (v: xdr.ScVal) => {
    const i128 = v.i128();
    return (BigInt(i128.hi().toString()) << 64n) | BigInt(i128.lo().toString());
  },
  scValToU64: (v: xdr.ScVal) => BigInt(v.u64().toString()),
}));

vi.mock('./env.js', () => ({
  getFactoryContractId: mockGetFactoryContractId,
  tryGetFactoryContractId: () => mockGetFactoryContractId(),
}));

const FACTORY_ID       = StrKey.encodeContract(Buffer.alloc(32, 1));
const STREAM_ADDRESS   = StrKey.encodeContract(Buffer.alloc(32, 2));
const TOKEN            = StrKey.encodeContract(Buffer.alloc(32, 3));
const SENDER           = Keypair.random().publicKey();
const RECIPIENT        = Keypair.random().publicKey();

function i128(n: bigint): xdr.ScVal {
  const lo = n & 0xffffffffffffffffn;
  const hi = n >> 64n;
  return xdr.ScVal.scvI128(
    new xdr.Int128Parts({ hi: xdr.Int64.fromString(hi.toString()), lo: xdr.Uint64.fromString(lo.toString()) }),
  );
}

function u64(n: bigint): xdr.ScVal {
  return xdr.ScVal.scvU64(xdr.Uint64.fromString(n.toString()));
}

function scvMap(entries: Record<string, xdr.ScVal>): xdr.ScVal {
  return xdr.ScVal.scvMap(
    Object.entries(entries).map(([k, v]) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: v })),
  );
}

beforeEach(() => {
  mockSimulateReadOnly.mockReset();
  mockInvokeContract.mockReset();
  mockGetFactoryContractId.mockReset().mockReturnValue(FACTORY_ID);
});

describe('getStreamAddress', () => {
  it('returns the address when the factory resolves the stream ID', async () => {
    mockSimulateReadOnly.mockResolvedValue(new Address(STREAM_ADDRESS).toScVal());
    const { getStreamAddress } = await import('./stream.js');
    expect(await getStreamAddress(SENDER, 1n)).toBe(STREAM_ADDRESS);
  });

  it('returns null for scvVoid (Option::None)', async () => {
    mockSimulateReadOnly.mockResolvedValue(xdr.ScVal.scvVoid());
    const { getStreamAddress } = await import('./stream.js');
    expect(await getStreamAddress(SENDER, 999n)).toBeNull();
  });

  it('returns null (not throw) when the underlying call rejects', async () => {
    mockSimulateReadOnly.mockRejectedValue(new Error('rpc down'));
    const { getStreamAddress } = await import('./stream.js');
    expect(await getStreamAddress(SENDER, 1n)).toBeNull();
  });
});

describe('getWithdrawable', () => {
  it('decodes the i128 result', async () => {
    mockSimulateReadOnly.mockResolvedValue(i128(50_000n));
    const { getWithdrawable } = await import('./stream.js');
    expect(await getWithdrawable(SENDER, STREAM_ADDRESS)).toBe(50_000n);
  });
});

describe('getStreamInfo', () => {
  it('parses every field of the info struct', async () => {
    mockSimulateReadOnly.mockResolvedValue(scvMap({
      sender:            new Address(SENDER).toScVal(),
      recipient:         new Address(RECIPIENT).toScVal(),
      token:             new Address(TOKEN).toScVal(),
      rate_per_second:   i128(100n),
      start_time:        u64(1_700_000_000n),
      end_time:          u64(1_700_003_600n),
      withdrawn:         i128(1_000n),
      paused:            xdr.ScVal.scvBool(false),
      paused_at:         u64(0n),
      clawback_enabled:  xdr.ScVal.scvBool(true),
      cancelled:         xdr.ScVal.scvBool(false),
    }));

    const { getStreamInfo } = await import('./stream.js');
    const info = await getStreamInfo(SENDER, STREAM_ADDRESS);

    expect(info).toEqual({
      sender:          SENDER,
      recipient:       RECIPIENT,
      token:           TOKEN,
      ratePerSecond:   100n,
      startTime:       1_700_000_000,
      endTime:         1_700_003_600,
      withdrawn:       1_000n,
      paused:          false,
      pausedAt:        0,
      clawbackEnabled: true,
      cancelled:       false,
    });
  });

  it('throws a clear error when a field is missing rather than silently defaulting', async () => {
    mockSimulateReadOnly.mockResolvedValue(scvMap({
      sender: new Address(SENDER).toScVal(),
      // recipient deliberately omitted
    }));
    const { getStreamInfo } = await import('./stream.js');
    await expect(getStreamInfo(SENDER, STREAM_ADDRESS)).rejects.toThrow(/Missing field: recipient/);
  });

  it('throws a clear error when the info result is not a map', async () => {
    mockSimulateReadOnly.mockResolvedValue(xdr.ScVal.scvVoid());
    const { getStreamInfo } = await import('./stream.js');
    await expect(getStreamInfo(SENDER, STREAM_ADDRESS)).rejects.toThrow(/expected map/i);
  });

  it('throws a clear error when a field has the wrong ScVal type', async () => {
    mockSimulateReadOnly.mockResolvedValue(scvMap({
      sender:            new Address(SENDER).toScVal(),
      recipient:         new Address(RECIPIENT).toScVal(),
      token:             new Address(TOKEN).toScVal(),
      rate_per_second:   xdr.ScVal.scvBool(true),
      start_time:        u64(1_700_000_000n),
      end_time:          u64(1_700_003_600n),
      withdrawn:         i128(1_000n),
      paused:            xdr.ScVal.scvBool(false),
      paused_at:         u64(0n),
      clawback_enabled:  xdr.ScVal.scvBool(true),
      cancelled:         xdr.ScVal.scvBool(false),
    }));
    const { getStreamInfo } = await import('./stream.js');
    await expect(getStreamInfo(SENDER, STREAM_ADDRESS)).rejects.toThrow(/rate_per_second.*i128/i);
  });
});

describe('mutating calls', () => {
  it('withdraw() invokes withdraw with the i128 amount', async () => {
    mockInvokeContract.mockResolvedValue('hash1');
    const { withdraw } = await import('./stream.js');
    const signTx = vi.fn();
    const hash = await withdraw(SENDER, STREAM_ADDRESS, 5_000n, signTx);
    expect(hash).toBe('hash1');
    expect(mockInvokeContract).toHaveBeenCalledWith(
      SENDER, STREAM_ADDRESS, 'withdraw', expect.any(Array), signTx,
    );
  });

  it('cancel() invokes cancel with no args', async () => {
    mockInvokeContract.mockResolvedValue('hash2');
    const { cancel } = await import('./stream.js');
    const signTx = vi.fn();
    expect(await cancel(SENDER, STREAM_ADDRESS, signTx)).toBe('hash2');
    expect(mockInvokeContract).toHaveBeenCalledWith(SENDER, STREAM_ADDRESS, 'cancel', [], signTx);
  });

  it('pause()/resume() invoke their respective methods', async () => {
    mockInvokeContract.mockResolvedValue('hash3');
    const { pause, resume } = await import('./stream.js');
    const signTx = vi.fn();
    await pause(SENDER, STREAM_ADDRESS, signTx);
    expect(mockInvokeContract).toHaveBeenCalledWith(SENDER, STREAM_ADDRESS, 'pause', [], signTx);
    await resume(SENDER, STREAM_ADDRESS, signTx);
    expect(mockInvokeContract).toHaveBeenCalledWith(SENDER, STREAM_ADDRESS, 'resume', [], signTx);
  });

  it('topUp() invokes top_up with the i128 amount', async () => {
    mockInvokeContract.mockResolvedValue('hash4');
    const { topUp } = await import('./stream.js');
    const signTx = vi.fn();
    await topUp(SENDER, STREAM_ADDRESS, 25_000n, signTx);
    expect(mockInvokeContract).toHaveBeenCalledWith(
      SENDER, STREAM_ADDRESS, 'top_up', expect.any(Array), signTx,
    );
  });

  it('clawback() invokes clawback with no args', async () => {
    mockInvokeContract.mockResolvedValue('hash5');
    const { clawback } = await import('./stream.js');
    const signTx = vi.fn();
    expect(await clawback(SENDER, STREAM_ADDRESS, signTx)).toBe('hash5');
    expect(mockInvokeContract).toHaveBeenCalledWith(SENDER, STREAM_ADDRESS, 'clawback', [], signTx);
  });
});
