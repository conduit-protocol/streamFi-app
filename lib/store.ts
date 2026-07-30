import { create } from 'zustand';
import { refreshStreamData } from './queryClient';
import toast from 'react-hot-toast';

export type TransactionStatus = 'signing' | 'broadcasting' | 'confirming' | 'success' | 'failed';

interface Transaction {
  id: string;
  status: TransactionStatus;
  description: string;
  hash?: string;
  error?: string;
}

/**
 * Max transactions retained at once. Terminal (success/failed) entries are
 * pruned oldest-first once this cap is exceeded — in-flight entries are
 * never evicted. Without a cap, a long session performing many operations
 * grows `transactions` forever, and every update pays an O(n) spread cost
 * against that ever-growing record.
 */
const MAX_RETAINED_TRANSACTIONS = 20;

function isTerminal(status: TransactionStatus): boolean {
  return status === 'success' || status === 'failed';
}

function pruneOldestTerminal(
  transactions: Record<string, Transaction>,
  order: string[],
): { transactions: Record<string, Transaction>; order: string[] } {
  if (order.length <= MAX_RETAINED_TRANSACTIONS) return { transactions, order };

  const nextOrder = [...order];
  const nextTransactions = { ...transactions };
  let i = 0;
  while (nextOrder.length > MAX_RETAINED_TRANSACTIONS && i < nextOrder.length) {
    const id: string | undefined = nextOrder[i];
    const tx = id ? nextTransactions[id] : undefined;
    if (id && tx && isTerminal(tx.status)) {
      nextOrder.splice(i, 1);
      delete nextTransactions[id];
    } else {
      i++; // in-flight (or already gone) — keep it, look further back
    }
  }
  return { transactions: nextTransactions, order: nextOrder };
}

interface TransactionStore {
  transactions: Record<string, Transaction>;
  /** Insertion order of transaction IDs, oldest first — drives pruning. */
  order: string[];
  addTransaction: (id: string, description: string) => void;
  updateStatus: (id: string, status: TransactionStatus, hash?: string, error?: string) => void;
  /** Remove all tracked transactions — called on wallet disconnect (fixes #81). */
  clearTransactions: () => void;
}

export const useTransactionStore = create<TransactionStore>((set) => ({
  transactions: {},
  order: [],

  addTransaction: (id, description) => {
    set((state) => {
      const { transactions, order } = pruneOldestTerminal(
        { ...state.transactions, [id]: { id, description, status: 'signing' } },
        state.order.includes(id) ? state.order : [...state.order, id],
      );
      return { transactions, order };
    });
    toast.loading(description, { id });
  },

  updateStatus: (id, status, hash, error) => {
    set((state) => {
      const tx = state.transactions[id];
      if (!tx) return state;

      // Merge hash/error — only overwrite if explicitly provided, to avoid
      // silently losing a hash from an earlier call when updateStatus is
      // invoked later with only a status transition (no hash param).
      const updated: Transaction = {
        ...tx,
        status,
        ...(hash !== undefined ? { hash } : {}),
        ...(error !== undefined ? { error } : {}),
      };

      if (status === 'success') {
        toast.success(`${tx.description} successful!`, { id });
        // Automatically invalidate and refetch stream-related queries to refresh the UI
        void refreshStreamData();
      } else if (status === 'failed') {
        toast.error(`Failed: ${error || 'Unknown error'}`, { id });
      } else if (status === 'broadcasting') {
        toast.loading('Broadcasting transaction...', { id });
      } else if (status === 'confirming') {
        toast.loading('Waiting for confirmation...', { id });
      }

      const { transactions, order } = pruneOldestTerminal(
        { ...state.transactions, [id]: updated },
        state.order,
      );
      return { transactions, order };
    });
  },

  clearTransactions: () => {
    set({ transactions: {}, order: [] });
  },
}));
