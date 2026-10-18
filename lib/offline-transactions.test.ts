import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  queueTransaction,
  queuedTransactions,
  flushQueuedTransactions,
  type OfflineTransaction,
} from './offline-transactions';
import * as streamModule from './stream';

vi.mock('./stream', () => ({
  withdraw: vi.fn(),
  cancel: vi.fn(),
  topUp: vi.fn(),
}));

const store = new Map<string, string>();

const localStorageMock: Storage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => { store.set(k, v); },
  removeItem: (k) => { store.delete(k); },
  clear: () => { store.clear(); },
  key: (i) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

describe('offline-transactions', () => {
  const mockSignTx = vi.fn().mockResolvedValue('signed-tx-xdr');
  const KEY = 'conduit-offline-transactions';

  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    store.clear();
  });

  describe('queuedTransactions', () => {
    it('returns an empty array when nothing is stored', () => {
      expect(queuedTransactions()).toEqual([]);
    });

    it('returns parsed transactions from localStorage', () => {
      const sample: OfflineTransaction[] = [
        {
          id: 'tx-1',
          kind: 'withdraw',
          publicKey: 'GABC',
          streamAddress: 'CXYZ',
          amount: '1000',
        },
      ];
      store.set(KEY, JSON.stringify(sample));
      expect(queuedTransactions()).toEqual(sample);
    });

    it('recovers gracefully with an empty array if storage contains invalid JSON', () => {
      store.set(KEY, 'not-valid-json{{{');
      expect(queuedTransactions()).toEqual([]);
    });

    it('returns empty array when localStorage is undefined', () => {
      const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
      try {
        // @ts-expect-error Simulating SSR where localStorage is undefined
        delete (globalThis as any).localStorage;
        expect(queuedTransactions()).toEqual([]);
      } finally {
        if (originalDescriptor) {
          Object.defineProperty(globalThis, 'localStorage', originalDescriptor);
        } else {
          Object.defineProperty(globalThis, 'localStorage', {
            value: localStorageMock,
            writable: true,
            configurable: true,
          });
        }
      }
    });
  });

  describe('queueTransaction', () => {
    it('queues a withdraw transaction, assigns a UUID, and persists to localStorage', () => {
      const id = queueTransaction({
        kind: 'withdraw',
        publicKey: 'G_SENDER',
        streamAddress: 'C_STREAM',
        amount: '5000000',
      });

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);

      const items = queuedTransactions();
      expect(items).toHaveLength(1);
      expect(items[0]).toEqual({
        id,
        kind: 'withdraw',
        publicKey: 'G_SENDER',
        streamAddress: 'C_STREAM',
        amount: '5000000',
      });
    });

    it('queues cancel and topup transactions correctly', () => {
      const cancelId = queueTransaction({
        kind: 'cancel',
        publicKey: 'G_SENDER',
        streamAddress: 'C_STREAM_1',
      });
      const topupId = queueTransaction({
        kind: 'topup',
        publicKey: 'G_SENDER',
        streamAddress: 'C_STREAM_2',
        amount: '2000000',
      });

      const items = queuedTransactions();
      expect(items).toHaveLength(2);
      expect(items[0].id).toBe(cancelId);
      expect(items[0].kind).toBe('cancel');
      expect(items[1].id).toBe(topupId);
      expect(items[1].kind).toBe('topup');
    });

    it('notifies service worker controller if available', () => {
      const postMessageMock = vi.fn();
      const originalServiceWorker = navigator.serviceWorker;

      Object.defineProperty(navigator, 'serviceWorker', {
        value: {
          controller: {
            postMessage: postMessageMock,
          },
        },
        configurable: true,
      });

      queueTransaction({
        kind: 'cancel',
        publicKey: 'G_TEST',
        streamAddress: 'C_TEST',
      });

      expect(postMessageMock).toHaveBeenCalledWith({
        type: 'REGISTER_BACKGROUND_SYNC',
      });

      Object.defineProperty(navigator, 'serviceWorker', {
        value: originalServiceWorker,
        configurable: true,
      });
    });

    it('does not throw when serviceWorker or controller is missing', () => {
      const originalServiceWorker = navigator.serviceWorker;
      Object.defineProperty(navigator, 'serviceWorker', {
        value: undefined,
        configurable: true,
      });

      expect(() => {
        queueTransaction({
          kind: 'cancel',
          publicKey: 'G_TEST',
          streamAddress: 'C_TEST',
        });
      }).not.toThrow();

      Object.defineProperty(navigator, 'serviceWorker', {
        value: originalServiceWorker,
        configurable: true,
      });
    });
  });

  describe('flushQueuedTransactions', () => {
    it('does nothing when navigator is offline', async () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
        writable: true,
      });

      queueTransaction({
        kind: 'withdraw',
        publicKey: 'G_TEST',
        streamAddress: 'C_STREAM',
        amount: '100',
      });

      await flushQueuedTransactions(mockSignTx);

      expect(streamModule.withdraw).not.toHaveBeenCalled();
      expect(queuedTransactions()).toHaveLength(1);
    });

    it('does nothing when queue is empty', async () => {
      await flushQueuedTransactions(mockSignTx);
      expect(streamModule.withdraw).not.toHaveBeenCalled();
      expect(streamModule.cancel).not.toHaveBeenCalled();
      expect(streamModule.topUp).not.toHaveBeenCalled();
    });

    it('executes each transaction type and clears queue sequentially upon success', async () => {
      vi.mocked(streamModule.withdraw).mockResolvedValueOnce({} as any);
      vi.mocked(streamModule.cancel).mockResolvedValueOnce({} as any);
      vi.mocked(streamModule.topUp).mockResolvedValueOnce({} as any);

      queueTransaction({
        kind: 'withdraw',
        publicKey: 'G_PUB1',
        streamAddress: 'C_STR1',
        amount: '12345',
      });
      queueTransaction({
        kind: 'cancel',
        publicKey: 'G_PUB2',
        streamAddress: 'C_STR2',
      });
      queueTransaction({
        kind: 'topup',
        publicKey: 'G_PUB3',
        streamAddress: 'C_STR3',
        amount: '67890',
      });

      await flushQueuedTransactions(mockSignTx);

      expect(streamModule.withdraw).toHaveBeenCalledTimes(1);
      expect(streamModule.withdraw).toHaveBeenCalledWith(
        'G_PUB1',
        'C_STR1',
        BigInt('12345'),
        mockSignTx
      );

      expect(streamModule.cancel).toHaveBeenCalledTimes(1);
      expect(streamModule.cancel).toHaveBeenCalledWith(
        'G_PUB2',
        'C_STR2',
        mockSignTx
      );

      expect(streamModule.topUp).toHaveBeenCalledTimes(1);
      expect(streamModule.topUp).toHaveBeenCalledWith(
        'G_PUB3',
        'C_STR3',
        BigInt('67890'),
        mockSignTx
      );

      expect(queuedTransactions()).toEqual([]);
    });

    it('stops processing on error, leaves remaining items in queue, and logs error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.mocked(streamModule.withdraw).mockResolvedValueOnce({} as any);
      vi.mocked(streamModule.cancel).mockRejectedValueOnce(new Error('Network failure'));

      queueTransaction({
        kind: 'withdraw',
        publicKey: 'G_P1',
        streamAddress: 'C_S1',
        amount: '100',
      });
      queueTransaction({
        kind: 'cancel',
        publicKey: 'G_P2',
        streamAddress: 'C_S2',
      });
      queueTransaction({
        kind: 'topup',
        publicKey: 'G_P3',
        streamAddress: 'C_S3',
        amount: '200',
      });

      await flushQueuedTransactions(mockSignTx);

      // First tx should have succeeded and been removed
      expect(streamModule.withdraw).toHaveBeenCalledTimes(1);

      // Second tx failed
      expect(streamModule.cancel).toHaveBeenCalledTimes(1);

      // Third tx should not have been attempted
      expect(streamModule.topUp).not.toHaveBeenCalled();

      // Error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Queued transaction failed:',
        expect.any(Error)
      );

      // Remaining items in queue should be the failed cancel and the untouched topup
      const remaining = queuedTransactions();
      expect(remaining).toHaveLength(2);
      expect(remaining[0].kind).toBe('cancel');
      expect(remaining[1].kind).toBe('topup');

      consoleErrorSpy.mockRestore();
    });
  });
});
