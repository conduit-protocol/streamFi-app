import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Account,
  Keypair,
  Networks,
  Operation,
  Asset,
  TransactionBuilder,
  hash,
} from '@stellar/stellar-sdk';

/**
 * Tests for lib/ledger-wallet.ts (#792).
 *
 * The WebHID transport and the Stellar app client are mocked — there is no
 * physical device in CI — so these cover the error mapping, transport
 * lifecycle and the signature plumbing around the device calls.
 */

const { transportMock, appMock, TransportWebHIDMock } = vi.hoisted(() => {
  const listeners = new Map<string, Set<() => void>>();
  const transportMock = {
    on: vi.fn((event: string, cb: () => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
    }),
    off: vi.fn((event: string, cb: () => void) => {
      listeners.get(event)?.delete(cb);
    }),
    close: vi.fn(async () => undefined),
    emit(event: string) {
      for (const cb of [...(listeners.get(event) ?? [])]) cb();
    },
    reset() {
      listeners.clear();
    },
  };
  const appMock = {
    getPublicKey: vi.fn(),
    signTransaction: vi.fn(),
  };
  const TransportWebHIDMock = {
    openConnected: vi.fn(),
    request: vi.fn(),
  };
  return { transportMock, appMock, TransportWebHIDMock };
});

vi.mock('@ledgerhq/hw-transport-webhid', () => ({ default: TransportWebHIDMock }));
vi.mock('@ledgerhq/hw-app-str', () => ({
  default: class MockStr {
    getPublicKey = appMock.getPublicKey;
    signTransaction = appMock.signTransaction;
  },
}));

import {
  LedgerError,
  closeLedger,
  connectLedger,
  isWebHIDSupported,
  onLedgerDisconnect,
  signWithLedger,
  toLedgerError,
} from './ledger-wallet';

const keypair = Keypair.random();

function setWebHID(available: boolean) {
  if (available) {
    Object.defineProperty(navigator, 'hid', { value: {}, configurable: true });
  } else {
    delete (navigator as any).hid;
  }
}

function statusError(statusCode: number, name = 'TransportStatusError') {
  return Object.assign(new Error(`Ledger device: status 0x${statusCode.toString(16)}`), { name, statusCode });
}

function namedError(name: string) {
  return Object.assign(new Error(name), { name });
}

function buildTxXdr(source: string) {
  const tx = new TransactionBuilder(new Account(source, '1'), {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.payment({ destination: Keypair.random().publicKey(), asset: Asset.native(), amount: '1' }))
    .setTimeout(30)
    .build();
  return tx.toXDR();
}

describe('ledger-wallet', () => {
  beforeEach(async () => {
    await closeLedger();
    onLedgerDisconnect(null);
    vi.clearAllMocks();
    transportMock.reset();
    setWebHID(true);
    TransportWebHIDMock.openConnected.mockResolvedValue(null);
    TransportWebHIDMock.request.mockResolvedValue(transportMock);
    appMock.getPublicKey.mockResolvedValue({ rawPublicKey: keypair.rawPublicKey() });
  });

  afterEach(() => {
    setWebHID(false);
  });

  describe('isWebHIDSupported', () => {
    it('is true when navigator.hid exists', () => {
      expect(isWebHIDSupported()).toBe(true);
    });

    it('is false when the browser has no WebHID', () => {
      setWebHID(false);
      expect(isWebHIDSupported()).toBe(false);
    });
  });

  describe('toLedgerError', () => {
    it.each([
      [namedError('TransportOpenUserCancelled'), 'cancelled'],
      [namedError('NotFoundError'), 'cancelled'],
      [namedError('LockedDeviceError'), 'locked'],
      [statusError(0x5515), 'locked'],
      [statusError(0x6511), 'app-not-open'],
      [statusError(0x6e00), 'app-not-open'],
      [statusError(0x6d00), 'app-not-open'],
      [statusError(0x6985), 'rejected'],
      [namedError('StellarUserRefusedError'), 'rejected'],
      [namedError('DisconnectedDevice'), 'disconnected'],
      [namedError('DisconnectedDeviceDuringOperation'), 'disconnected'],
      [namedError('TransportInterfaceNotAvailable'), 'busy'],
      [new Error('boom'), 'unknown'],
    ])('maps %s to %s', (error, code) => {
      const mapped = toLedgerError(error);
      expect(mapped).toBeInstanceOf(LedgerError);
      expect(mapped.code).toBe(code);
      expect(mapped.message).toBeTruthy();
    });

    it('passes an existing LedgerError through unchanged', () => {
      const original = new LedgerError('locked', 'locked');
      expect(toLedgerError(original)).toBe(original);
    });
  });

  describe('connectLedger', () => {
    it('opens the device picker and returns the G-address of the first account', async () => {
      await expect(connectLedger()).resolves.toBe(keypair.publicKey());
      expect(TransportWebHIDMock.request).toHaveBeenCalledTimes(1);
      expect(appMock.getPublicKey).toHaveBeenCalledWith("44'/148'/0'");
    });

    it('reuses a device already granted to this origin without showing the picker', async () => {
      TransportWebHIDMock.openConnected.mockResolvedValue(transportMock);
      await connectLedger();
      expect(TransportWebHIDMock.request).not.toHaveBeenCalled();
    });

    it('never shows the picker in non-interactive mode', async () => {
      await expect(connectLedger({ interactive: false })).rejects.toMatchObject({ code: 'disconnected' });
      expect(TransportWebHIDMock.request).not.toHaveBeenCalled();
    });

    it('rejects with "unsupported" and never loads the transport when WebHID is missing', async () => {
      setWebHID(false);
      await expect(connectLedger()).rejects.toMatchObject({ code: 'unsupported' });
      expect(TransportWebHIDMock.openConnected).not.toHaveBeenCalled();
    });

    it('rejects with "cancelled" when the user dismisses the device picker', async () => {
      TransportWebHIDMock.request.mockRejectedValue(namedError('TransportOpenUserCancelled'));
      await expect(connectLedger()).rejects.toMatchObject({ code: 'cancelled' });
    });

    it('rejects with "locked" and closes the transport when the device is locked', async () => {
      appMock.getPublicKey.mockRejectedValue(statusError(0x5515, 'LockedDeviceError'));
      await expect(connectLedger()).rejects.toMatchObject({ code: 'locked' });
      expect(transportMock.close).toHaveBeenCalled();
    });

    it('rejects with "app-not-open" when the Stellar app is not running', async () => {
      appMock.getPublicKey.mockRejectedValue(statusError(0x6e00));
      await expect(connectLedger()).rejects.toMatchObject({ code: 'app-not-open' });
    });

    it('fires the disconnect handler when the device is unplugged', async () => {
      const handler = vi.fn();
      onLedgerDisconnect(handler);
      await connectLedger();
      transportMock.emit('disconnect');
      expect(handler).toHaveBeenCalledTimes(1);

      // The dropped transport is not reused — the next connect opens afresh.
      await connectLedger();
      expect(TransportWebHIDMock.request).toHaveBeenCalledTimes(2);
    });

    it('does not fire the disconnect handler after an explicit close', async () => {
      const handler = vi.fn();
      onLedgerDisconnect(handler);
      await connectLedger();
      await closeLedger();
      transportMock.emit('disconnect');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('signWithLedger', () => {
    // The Stellar app receives the signature base and signs its SHA-256 hash.
    it('signs the transaction signature base on the device and attaches the signature', async () => {
      appMock.signTransaction.mockImplementation(async (_path: string, base: Buffer) => ({
        signature: keypair.sign(hash(base)),
      }));
      const xdr = buildTxXdr(keypair.publicKey());

      const signedXdr = await signWithLedger(xdr, Networks.TESTNET, keypair.publicKey());

      const signed = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
      expect(signed.signatures).toHaveLength(1);
      expect(keypair.verify(signed.hash(), signed.signatures[0]!.signature())).toBe(true);
      expect(appMock.signTransaction).toHaveBeenCalledWith("44'/148'/0'", expect.any(Buffer));
    });

    it('refuses to sign when the device holds a different account', async () => {
      const other = Keypair.random();
      await expect(
        signWithLedger(buildTxXdr(other.publicKey()), Networks.TESTNET, other.publicKey()),
      ).rejects.toMatchObject({ code: 'wrong-account' });
      expect(appMock.signTransaction).not.toHaveBeenCalled();
    });

    it('rejects with "rejected" when the user declines on the device', async () => {
      appMock.signTransaction.mockRejectedValue(statusError(0x6985));
      await expect(
        signWithLedger(buildTxXdr(keypair.publicKey()), Networks.TESTNET, keypair.publicKey()),
      ).rejects.toMatchObject({ code: 'rejected' });
    });

    it('serialises concurrent requests so device exchanges never overlap', async () => {
      let active = 0;
      let maxActive = 0;
      appMock.signTransaction.mockImplementation(async (_path: string, base: Buffer) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return { signature: keypair.sign(hash(base)) };
      });
      const xdr = buildTxXdr(keypair.publicKey());
      await Promise.all([
        signWithLedger(xdr, Networks.TESTNET, keypair.publicKey()),
        signWithLedger(xdr, Networks.TESTNET, keypair.publicKey()),
        signWithLedger(xdr, Networks.TESTNET, keypair.publicKey()),
      ]);
      expect(maxActive).toBe(1);
      expect(appMock.signTransaction).toHaveBeenCalledTimes(3);
    });
  });
});
