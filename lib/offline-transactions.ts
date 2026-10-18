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

function notifyQueueChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('offline-transactions-changed'));
  }
}

export function queueTransaction(transaction: NewOfflineTransaction): string {
  const id = crypto.randomUUID();
  write([...read(), { ...transaction, id } as OfflineTransaction]);
  notifyQueueChanged();
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
      notifyQueueChanged();
    } catch (error) {
      console.error('Queued transaction failed:', error);
      break;
    }
  }
}

// ── IndexedDB Storage Adapter for Draft Streams (#753) ─────────────────────────

const IDB_NAME = 'conduit-offline-db';
const IDB_VERSION = 1;
const DRAFTS_STORE = 'draft-stream-batches';

export interface DraftStreamBatch {
  id: string;
  name: string;
  streams: Array<Record<string, unknown>>;
  createdAt: number;
  updatedAt: number;
}

function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DRAFTS_STORE)) {
        db.createObjectStore(DRAFTS_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveDraftStreamBatch(batch: DraftStreamBatch): Promise<void> {
  try {
    const db = await openIndexedDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DRAFTS_STORE, 'readwrite');
      tx.objectStore(DRAFTS_STORE).put(batch);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    if (typeof localStorage !== 'undefined') {
      const drafts = getLocalDraftBatches();
      const updated = drafts.filter((d) => d.id !== batch.id).concat(batch);
      localStorage.setItem(`${KEY}-drafts`, JSON.stringify(updated));
    }
  }
}

export async function getDraftStreamBatches(): Promise<DraftStreamBatch[]> {
  try {
    const db = await openIndexedDB();
    return await new Promise<DraftStreamBatch[]>((resolve, reject) => {
      const tx = db.transaction(DRAFTS_STORE, 'readonly');
      const req = tx.objectStore(DRAFTS_STORE).getAll();
      req.onsuccess = () => resolve(req.result as DraftStreamBatch[]);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return getLocalDraftBatches();
  }
}

export async function deleteDraftStreamBatch(id: string): Promise<void> {
  try {
    const db = await openIndexedDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DRAFTS_STORE, 'readwrite');
      tx.objectStore(DRAFTS_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    if (typeof localStorage !== 'undefined') {
      const drafts = getLocalDraftBatches().filter((d) => d.id !== id);
      localStorage.setItem(`${KEY}-drafts`, JSON.stringify(drafts));
    }
  }
}

function getLocalDraftBatches(): DraftStreamBatch[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(`${KEY}-drafts`) ?? '[]') as DraftStreamBatch[];
  } catch {
    return [];
  }
}

