const DB_NAME = 'conduit-offline';
const DB_VERSION = 1;
const SNAPSHOTS = 'snapshots';

interface SnapshotRecord<T> {
  key: string;
  savedAt: number;
  value: T;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(SNAPSHOTS, { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSnapshot<T>(key: string, value: T): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(SNAPSHOTS, 'readwrite').objectStore(SNAPSHOTS)
      .put({ key, savedAt: Date.now(), value } satisfies SnapshotRecord<T>);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  db.close();
}

export async function readSnapshot<T>(key: string): Promise<SnapshotRecord<T> | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await openDatabase();
  const result = await new Promise<SnapshotRecord<T> | undefined>((resolve, reject) => {
    const request = db.transaction(SNAPSHOTS, 'readonly').objectStore(SNAPSHOTS).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result ?? null;
}
