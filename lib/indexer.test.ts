import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchTransactionHistory, fetchTransactionHistoryWithTimeout } from './indexer';

describe('indexer', () => {
  describe('fetchTransactionHistory', () => {
    it('should resolve with demo data when publicKey is provided', async () => {
      const result = await fetchTransactionHistory('GABC123');
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('type');
      expect(result[0]).toHaveProperty('amount');
      expect(result[0]).toHaveProperty('token');
      expect(result[0]).toHaveProperty('status');
      expect(result[0]).toHaveProperty('date');
      expect(result[0]).toHaveProperty('hash');
    });

    it('should resolve with empty array when no publicKey', async () => {
      const result = await fetchTransactionHistory();
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should reject immediately if signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        fetchTransactionHistory('GABC123', controller.signal)
      ).rejects.toThrow('Aborted');
    });

    it('should reject when signal is aborted during fetch', async () => {
      const controller = new AbortController();
      
      const promise = fetchTransactionHistory('GABC123', controller.signal);
      
      // Abort while the promise is pending
      controller.abort();

      await expect(promise).rejects.toThrow('Aborted');
    });

    it('should respect abort signal and reject with AbortError', async () => {
      const controller = new AbortController();
      
      const promise = fetchTransactionHistory('GABC123', controller.signal);
      controller.abort();

      try {
        await promise;
        expect.fail('Promise should have rejected');
      } catch (err) {
        expect(err).toBeInstanceOf(DOMException);
        expect((err as DOMException).name).toBe('AbortError');
      }
    });
  });

  describe('fetchTransactionHistoryWithTimeout', () => {
    it('should resolve normally when fetch completes in time', async () => {
      const result = await fetchTransactionHistoryWithTimeout('GABC123', 5000);
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should use default timeout of 10 seconds', async () => {
      const result = await fetchTransactionHistoryWithTimeout('GABC123');
      
      expect(Array.isArray(result)).toBe(true);
    });

    it('should timeout and reject with descriptive error', async () => {
      // Mock fetchTransactionHistory to hang indefinitely
      vi.mock('./indexer', async (importOriginal) => {
        const actual = await importOriginal<typeof import('./indexer')>();
        return {
          ...actual,
          fetchTransactionHistory: vi.fn().mockImplementation(
            () => new Promise(() => {}) // Never resolves
          ),
        };
      });

      // Set very short timeout to avoid waiting
      const promise = fetchTransactionHistoryWithTimeout('GABC123', 10);

      await expect(promise).rejects.toThrow(/timed out after/);
      await expect(promise).rejects.toThrow(/0.01s/);
    });

    it('should include timeout duration in error message', async () => {
      // Create a mock that delays longer than the timeout
      const mockFetch = vi.fn().mockImplementation(
        async (_publicKey: string | null | undefined, signal?: AbortSignal) => {
          return new Promise((resolve, reject) => {
            signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
            // Never resolve naturally
          });
        }
      );

      // Temporarily replace the function
      const originalFetch = fetchTransactionHistory;
      Object.defineProperty(globalThis, 'fetchTransactionHistory', {
        value: mockFetch,
        writable: true,
        configurable: true,
      });

      try {
        await fetchTransactionHistoryWithTimeout('GABC123', 50);
        expect.fail('Should have thrown timeout error');
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).toContain('0.05s');
        expect((err as Error).message).toContain('timed out');
      } finally {
        // Restore
        Object.defineProperty(globalThis, 'fetchTransactionHistory', {
          value: originalFetch,
          writable: true,
          configurable: true,
        });
      }
    });

    it('should clear timeout when fetch succeeds', async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

      await fetchTransactionHistoryWithTimeout('GABC123', 5000);

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it('should clear timeout when fetch fails for non-timeout reasons', async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      
      // Mock a non-AbortError failure
      const originalFetch = fetchTransactionHistory;
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      Object.defineProperty(globalThis, 'fetchTransactionHistory', {
        value: mockFetch,
        writable: true,
        configurable: true,
      });

      try {
        await fetchTransactionHistoryWithTimeout('GABC123', 5000);
      } catch {
        // Expected to throw
      }

      expect(clearTimeoutSpy).toHaveBeenCalled();

      // Restore
      Object.defineProperty(globalThis, 'fetchTransactionHistory', {
        value: originalFetch,
        writable: true,
        configurable: true,
      });
    });

    it('should rethrow non-AbortError exceptions as-is', async () => {
      const originalFetch = fetchTransactionHistory;
      const customError = new Error('Custom network error');
      const mockFetch = vi.fn().mockRejectedValue(customError);
      
      Object.defineProperty(globalThis, 'fetchTransactionHistory', {
        value: mockFetch,
        writable: true,
        configurable: true,
      });

      await expect(
        fetchTransactionHistoryWithTimeout('GABC123', 5000)
      ).rejects.toThrow('Custom network error');

      // Restore
      Object.defineProperty(globalThis, 'fetchTransactionHistory', {
        value: originalFetch,
        writable: true,
        configurable: true,
      });
    });

    it('should transform AbortError into descriptive timeout message', async () => {
      const originalFetch = fetchTransactionHistory;
      const mockFetch = vi.fn().mockImplementation(
        async (_pk: string | null | undefined, signal?: AbortSignal) => {
          return new Promise((_, reject) => {
            signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          });
        }
      );

      Object.defineProperty(globalThis, 'fetchTransactionHistory', {
        value: mockFetch,
        writable: true,
        configurable: true,
      });

      try {
        await fetchTransactionHistoryWithTimeout('GABC123', 100);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).not.toContain('Aborted');
        expect((err as Error).message).toContain('timed out');
        expect((err as Error).message).toContain('network may be slow');
      } finally {
        Object.defineProperty(globalThis, 'fetchTransactionHistory', {
          value: originalFetch,
          writable: true,
          configurable: true,
        });
      }
    });
  });
});
