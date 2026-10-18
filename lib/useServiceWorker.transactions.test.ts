import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./queryClient', () => ({
  queryClient: { invalidateQueries: vi.fn() },
  refreshStreamData: vi.fn(() => Promise.resolve()),
}));

vi.mock('react-hot-toast', () => {
  const toast = vi.fn();
  return {
    default: Object.assign(toast, {
      loading: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
    }),
  };
});

describe('service worker reload safety', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('detects signing, broadcasting, and confirming transactions as in-flight', async () => {
    const { useTransactionStore } = await import('./store.js');
    const { hasInFlightTransactions } = await import('./useServiceWorker.js');

    useTransactionStore.getState().addTransaction('tx-signing', 'Signing');
    expect(hasInFlightTransactions()).toBe(true);

    useTransactionStore.getState().updateStatus('tx-signing', 'broadcasting');
    expect(hasInFlightTransactions()).toBe(true);

    useTransactionStore.getState().updateStatus('tx-signing', 'confirming');
    expect(hasInFlightTransactions()).toBe(true);
  });

  it('treats success and failed transactions as safe to reload', async () => {
    const { useTransactionStore } = await import('./store.js');
    const { hasInFlightTransactions } = await import('./useServiceWorker.js');

    useTransactionStore.getState().addTransaction('tx-success', 'Success');
    useTransactionStore.getState().updateStatus('tx-success', 'success');
    useTransactionStore.getState().addTransaction('tx-failed', 'Failed');
    useTransactionStore.getState().updateStatus('tx-failed', 'failed');

    expect(hasInFlightTransactions()).toBe(false);
  });
});
