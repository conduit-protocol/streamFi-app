import { withdraw, cancel, topUp } from './stream';
import type { WalletState } from '@/contexts/WalletContext';
type SignTransaction = WalletState['signTx'];

export type OfflineTransaction =
  | { id: string; kind: 'withdraw'; publicKey: string; streamAddress: string; amount: string }
  | { id: string; kind: 'cancel'; publicKey: string; streamAddress: string }
  | { id: string; kind: 'topup'; publicKey: string; streamAddress: string; amount: string };
type NewOfflineTransaction =
  | Omit<Extract<OfflineTransaction, { kind: 'withdraw' }>, 'id'>
  | Omit<Extract<OfflineTransaction, { kind: 'cancel' }>, 'id'>
  | Omit<Extract<OfflineTransaction, { kind: 'topup' }>, 'id'>;

const KEY = 'conduit-offline-transactions';

function read(): OfflineTransaction[] {
  if (typeof localStorage === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as OfflineTransaction[]; } catch { return []; }
}

function write(items: OfflineTransaction[]) { localStorage.setItem(KEY, JSON.stringify(items)); }

export function queueTransaction(transaction: NewOfflineTransaction): string {
  const id = crypto.randomUUID();
  write([...read(), { ...transaction, id } as OfflineTransaction]);
  navigator.serviceWorker?.controller?.postMessage({ type: 'REGISTER_BACKGROUND_SYNC' });
  return id;
}

export function queuedTransactions(): OfflineTransaction[] { return read(); }

export async function flushQueuedTransactions(signTx: SignTransaction): Promise<void> {
  if (!navigator.onLine) return;
  for (const item of read()) {
    try {
      if (item.kind === 'withdraw') await withdraw(item.publicKey, item.streamAddress, BigInt(item.amount), signTx);
      if (item.kind === 'cancel') await cancel(item.publicKey, item.streamAddress, signTx);
      if (item.kind === 'topup') await topUp(item.publicKey, item.streamAddress, BigInt(item.amount), signTx);
      write(read().filter((queued) => queued.id !== item.id));
    } catch (error) {
      console.error('Queued transaction failed:', error);
      break;
    }
  }
}
