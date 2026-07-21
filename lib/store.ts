import { create } from 'zustand';
import { queryClient } from './queryClient';
import toast from 'react-hot-toast';

export type TransactionStatus = 'signing' | 'broadcasting' | 'confirming' | 'success' | 'failed';

interface Transaction {
  id: string;
  status: TransactionStatus;
  description: string;
  hash?: string;
  error?: string;
}

interface TransactionStore {
  transactions: Record<string, Transaction>;
  addTransaction: (id: string, description: string) => void;
  updateStatus: (id: string, status: TransactionStatus, hash?: string, error?: string) => void;
}

export const useTransactionStore = create<TransactionStore>((set) => ({
  transactions: {},
  
  addTransaction: (id, description) => {
    set((state) => ({
      transactions: {
        ...state.transactions,
        [id]: { id, description, status: 'signing' }
      }
    }));
    toast.loading(description, { id });
  },

  updateStatus: (id, status, hash, error) => {
    set((state) => {
      const tx = state.transactions[id];
      if (!tx) return state;

      const updated = { ...tx, status, hash, error };

      if (status === 'success') {
        toast.success(`${tx.description} successful!`, { id });
        // Automatically invalidate related queries to refresh the UI
        queryClient.invalidateQueries();
      } else if (status === 'failed') {
        toast.error(`Failed: ${error || 'Unknown error'}`, { id });
      } else if (status === 'broadcasting') {
        toast.loading('Broadcasting transaction...', { id });
      } else if (status === 'confirming') {
        toast.loading('Waiting for confirmation...', { id });
      }

      return {
        transactions: {
          ...state.transactions,
          [id]: updated
        }
      };
    });
  }
}));
