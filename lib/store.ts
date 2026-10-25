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
      toast.dismiss(id);
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
  /** Remove all tracked transactions and dismiss toasts — called on wallet disconnect (fixes #81, #386). */
  clearTransactions: () => void;
  /**
   * Number of signed transactions currently submitted to the network and
   * awaiting a verdict. Drives the pending badge on the Navbar wallet
   * button so users who navigate away still see that a submit is in flight
   * (#791). Deliberately not reset by `clearTransactions`: disconnecting the
   * wallet does not cancel a transaction that is already on its way to a
   * ledger.
   */
  pendingSubmissions: number;
  beginSubmission: () => void;
  /** Clamped at zero so an unbalanced call can never show a negative count. */
  endSubmission: () => void;
}

export const useTransactionStore = create<TransactionStore>((set, get) => ({
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
    const tx = get().transactions[id];
    if (!tx) return;

    set((state) => {
      const currentTx = state.transactions[id];
      if (!currentTx) return state;

      // Merge hash/error — only overwrite if explicitly provided, to avoid
      // silently losing a hash from an earlier call when updateStatus is
      // invoked later with only a status transition (no hash param).
      const updated: Transaction = {
        ...currentTx,
        status,
        ...(hash !== undefined ? { hash } : {}),
        ...(error !== undefined ? { error } : {}),
      };

      const { transactions, order } = pruneOldestTerminal(
        { ...state.transactions, [id]: updated },
        state.order,
      );
      return { transactions, order };
    });

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
  },

  clearTransactions: () => {
    Object.keys(get().transactions).forEach((id) => {
      toast.dismiss(id);
    });
    set({ transactions: {}, order: [] });
  },

  pendingSubmissions: 0,

  beginSubmission: () => {
    set((state) => ({ pendingSubmissions: state.pendingSubmissions + 1 }));
  },

  endSubmission: () => {
    set((state) => ({ pendingSubmissions: Math.max(0, state.pendingSubmissions - 1) }));
  },
}));

/**
 * Run `submit` while counting it as a pending submission. The count is
 * released in `finally`, so a confirmed, reverted, aborted or timed-out
 * submission always clears its badge entry (#791).
 */
export async function trackPendingSubmission<T>(submit: () => Promise<T>): Promise<T> {
  const { beginSubmission, endSubmission } = useTransactionStore.getState();
  beginSubmission();
  try {
    return await submit();
  } finally {
    endSubmission();
  }
}
