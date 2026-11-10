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
const DEAD_LETTER_KEY = `${KEY}:dead-letter`;

/**
 * localStorage key the offline queue lives under. Other tabs that queue or
 * flush transactions announce it through `storage` events on this key, so
 * the queue badge can stay in sync across tabs (#795).
 */
export const OFFLINE_QUEUE_STORAGE_KEY = KEY;

/**
 * Text for the offline queue badge (#795): "1 draft queued offline",
 * "3 drafts queued offline". Negative or non-finite counts read as zero.
 */
export function queuedDraftsLabel(count: number): string {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return `${n} draft${n === 1 ? '' : 's'} queued offline`;
}
export const MAX_SYNC_ATTEMPTS = 3;

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
export function deadLetterTransactions(): OfflineTransaction[] {
  if (typeof localStorage === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(DEAD_LETTER_KEY) ?? '[]') as OfflineTransaction[]; } catch { return []; }
}

export async function flushQueuedTransactions(signTx: SignTransaction): Promise<void> {
  // Guard SSR and the offline case: there is no point submitting while the
  // browser reports no connectivity (#809).
  if (typeof navigator === 'undefined' || navigator.onLine === false) return;
  for (const item of read()) {
    try {
      if (item.kind === 'withdraw') await withdraw(item.publicKey, item.streamAddress, BigInt(item.amount), signTx);
      if (item.kind === 'cancel') await cancel(item.publicKey, item.streamAddress, signTx);
      if (item.kind === 'topup') await topUp(item.publicKey, item.streamAddress, BigInt(item.amount), signTx);
      write(read().filter((queued) => queued.id !== item.id));
      notifyQueueChanged();
    } catch (error) {
      console.error('Queued transaction failed:', error);
      const failed = { ...item, attempts: ((item as OfflineTransaction & { attempts?: number }).attempts ?? 0) + 1, lastError: error instanceof Error ? error.message : String(error) };
      if (failed.attempts >= MAX_SYNC_ATTEMPTS) {
        localStorage.setItem(DEAD_LETTER_KEY, JSON.stringify([...deadLetterTransactions(), failed]));
        write(read().filter((queued) => queued.id !== item.id));
      }
      break;
    }
  }
}

// ── Automatic reconnect sync (#809) ─────────────────────────────────────────
//
// The signer lives in React state, but the `online` event is owned by the
// browser. Binding here (instead of inside an effect) keeps the reconnect
// behaviour in one place, testable without rendering, and lets a single
// listener survive re-renders. Callers keep the signer fresh by calling
// `startOnlineSync` whenever it changes and `stopOnlineSync` on unmount.

let onlineSyncSigner: SignTransaction | null = null;
let onlineSyncHandler: (() => void) | null = null;
let onlineSyncInFlight = false;

function handleOnlineEvent() {
  const signTx = onlineSyncSigner;
  // A burst of `online` events (e.g. flaky cellular signal) must not kick off
  // overlapping flushes of the same queue.
  if (!signTx || onlineSyncInFlight) return;
  onlineSyncInFlight = true;
  void flushQueuedTransactions(signTx).finally(() => {
    onlineSyncInFlight = false;
  });
}

/**
 * Retry the offline transaction queue whenever the browser regains
 * connectivity. Idempotent: repeated calls only refresh the signer.
 */
export function startOnlineSync(signTx: SignTransaction): void {
  onlineSyncSigner = signTx;
  if (typeof window === 'undefined') return;
  if (!onlineSyncHandler) {
    onlineSyncHandler = handleOnlineEvent;
    window.addEventListener('online', onlineSyncHandler);
  }
}

/** Detach the `online` listener and forget the signer. */
export function stopOnlineSync(): void {
  onlineSyncSigner = null;
  if (typeof window !== 'undefined' && onlineSyncHandler) {
    window.removeEventListener('online', onlineSyncHandler);
  }
  onlineSyncHandler = null;
  onlineSyncInFlight = false;
}

/** Whether an `online` listener is currently bound (test/diagnostic helper). */
export function isOnlineSyncActive(): boolean {
  return onlineSyncHandler !== null;
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

