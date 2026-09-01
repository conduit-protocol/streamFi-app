import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./queryClient', () => ({
  queryClient: { invalidateQueries: vi.fn() },
  refreshStreamData: vi.fn(() => Promise.resolve()),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    loading: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}));

// The transaction store never removed a transaction after it reached a
// terminal state (success/failed) — only clearTransactions() (called on
// wallet disconnect) ever emptied it. Over a long session with many
// operations, `transactions` grows without bound, and every update pays an
// O(n) object-spread cost against that growing record: a textbook "memory
// leak leading to degraded performance over time" (#91).
describe('useTransactionStore — bounded growth', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('prunes the oldest terminal transactions once the cap is exceeded', async () => {
    const { useTransactionStore } = await import('./store.js');
    const { addTransaction, updateStatus } = useTransactionStore.getState();

    // Fill well past any reasonable cap, resolving each immediately.
    for (let i = 0; i < 50; i++) {
      addTransaction(`tx-${i}`, `operation ${i}`);
      updateStatus(`tx-${i}`, 'success', `hash-${i}`);
    }

    const { transactions } = useTransactionStore.getState();
    const count = Object.keys(transactions).length;
    expect(count).toBeLessThan(50);
    expect(count).toBeGreaterThan(0);

    // The oldest ones should have been evicted first.
    expect(transactions['tx-0']).toBeUndefined();
    expect(transactions['tx-49']).toBeDefined();
  });

  it('never evicts a transaction that is still in-flight', async () => {
    const { useTransactionStore } = await import('./store.js');
    const { addTransaction, updateStatus } = useTransactionStore.getState();

    addTransaction('tx-inflight', 'still going');
    updateStatus('tx-inflight', 'broadcasting');

    for (let i = 0; i < 50; i++) {
      addTransaction(`tx-${i}`, `operation ${i}`);
      updateStatus(`tx-${i}`, 'success', `hash-${i}`);
    }

    const { transactions } = useTransactionStore.getState();
    expect(transactions['tx-inflight']).toBeDefined();
    expect(transactions['tx-inflight']?.status).toBe('broadcasting');
  });

  it('clearTransactions empties the store and its bookkeeping', async () => {
    const { useTransactionStore } = await import('./store.js');
    const { addTransaction, clearTransactions } = useTransactionStore.getState();

    addTransaction('tx-a', 'a');
    addTransaction('tx-b', 'b');
    clearTransactions();

    for (let i = 0; i < 50; i++) {
      useTransactionStore.getState().addTransaction(`tx2-${i}`, `op ${i}`);
      useTransactionStore.getState().updateStatus(`tx2-${i}`, 'success');
    }

    // No leftover bookkeeping from before the clear should affect pruning.
    const { transactions } = useTransactionStore.getState();
    expect(transactions['tx-a']).toBeUndefined();
    expect(transactions['tx-b']).toBeUndefined();
    expect(Object.keys(transactions).length).toBeLessThan(50);
  });

  it('triggers side effects (toast and refreshStreamData) when updateStatus is called', async () => {
    const toast = (await import('react-hot-toast')).default;
    const { refreshStreamData } = await import('./queryClient.js');
    const { useTransactionStore } = await import('./store.js');
    const { addTransaction, updateStatus } = useTransactionStore.getState();

    addTransaction('tx-test', 'Send payment');
    expect(toast.loading).toHaveBeenCalledWith('Send payment', { id: 'tx-test' });

    updateStatus('tx-test', 'broadcasting');
    expect(toast.loading).toHaveBeenCalledWith('Broadcasting transaction...', { id: 'tx-test' });

    updateStatus('tx-test', 'confirming');
    expect(toast.loading).toHaveBeenCalledWith('Waiting for confirmation...', { id: 'tx-test' });

    updateStatus('tx-test', 'success', 'hash-123');
    expect(toast.success).toHaveBeenCalledWith('Send payment successful!', { id: 'tx-test' });
    expect(refreshStreamData).toHaveBeenCalled();

    addTransaction('tx-fail', 'Withdraw funds');
    updateStatus('tx-fail', 'failed', undefined, 'User declined');
    expect(toast.error).toHaveBeenCalledWith('Failed: User declined', { id: 'tx-fail' });
  });

  it('clearTransactions dismisses active in-flight toasts on wallet disconnect (#386)', async () => {
    const toast = (await import('react-hot-toast')).default;
    const { useTransactionStore } = await import('./store.js');
    const { addTransaction, clearTransactions } = useTransactionStore.getState();

    addTransaction('tx-pending-1', 'Signing transaction...');
    addTransaction('tx-pending-2', 'Waiting for signature...');
    expect(toast.loading).toHaveBeenCalledWith('Signing transaction...', { id: 'tx-pending-1' });
    expect(toast.loading).toHaveBeenCalledWith('Waiting for signature...', { id: 'tx-pending-2' });

    clearTransactions();

    expect(toast.dismiss).toHaveBeenCalledWith('tx-pending-1');
    expect(toast.dismiss).toHaveBeenCalledWith('tx-pending-2');
    expect(useTransactionStore.getState().transactions).toEqual({});
  });

  it('prunes and dismisses toasts for oldest terminal transactions exceeding cap (#386)', async () => {
    const toast = (await import('react-hot-toast')).default;
    const { useTransactionStore } = await import('./store.js');
    const { addTransaction, updateStatus } = useTransactionStore.getState();

    for (let i = 0; i < 30; i++) {
      addTransaction(`tx-prune-${i}`, `operation ${i}`);
      updateStatus(`tx-prune-${i}`, 'success');
    }

    expect(toast.dismiss).toHaveBeenCalledWith('tx-prune-0');
  });
});
