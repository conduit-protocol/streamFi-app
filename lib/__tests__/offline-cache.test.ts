import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSnapshot, saveSnapshot } from '../offline-cache';

/**
 * Minimal in-memory IndexedDB covering exactly the surface lib/offline-cache.ts
 * uses: open (with upgrade), createObjectStore, transaction().objectStore()
 * .put/.get, and close. Request callbacks fire asynchronously like the real API.
 */
interface FakeRequest<T> {
  result: T;
  error: DOMException | null;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onupgradeneeded?: (() => void) | null;
}

function createFakeIndexedDB(options: { failOpen?: boolean; failPut?: boolean; failGet?: boolean } = {}) {
  const databases = new Map<string, Map<string, Map<string, unknown>>>();
  const stats = { opens: 0, upgrades: 0, closes: 0 };

  function request<T>(run: (req: FakeRequest<T>) => void, fail: boolean): FakeRequest<T> {
    const req: FakeRequest<T> = { result: undefined as T, error: null, onsuccess: null, onerror: null };
    queueMicrotask(() => {
      if (fail) {
        req.error = new DOMException('Simulated failure', 'UnknownError');
        req.onerror?.();
        return;
      }
      run(req);
      req.onsuccess?.();
    });
    return req;
  }

  function makeDb(stores: Map<string, Map<string, unknown>>) {
    return {
      createObjectStore: (name: string, { keyPath }: { keyPath: string }) => {
        stores.set(name, new Map());
        return { keyPath };
      },
      transaction: (storeName: string) => ({
        objectStore: (name: string) => {
          const store = stores.get(name ?? storeName);
          if (!store) throw new DOMException(`No object store ${name}`, 'NotFoundError');
          return {
            put: (record: { key: string }) =>
              request((r) => {
                store.set(record.key, structuredClone(record));
                r.result = record.key as never;
              }, !!options.failPut),
            get: (key: string) =>
              request((r) => {
                const value = store.get(key);
                r.result = (value === undefined ? undefined : structuredClone(value)) as never;
              }, !!options.failGet),
          };
        },
      }),
      close: () => {
        stats.closes += 1;
      },
    };
  }

  const indexedDB = {
    open: (name: string) => {
      stats.opens += 1;
      const req = { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null } as
        FakeRequest<ReturnType<typeof makeDb>>;
      queueMicrotask(() => {
        if (options.failOpen) {
          req.error = new DOMException('Blocked', 'UnknownError');
          req.onerror?.();
          return;
        }
        const isNew = !databases.has(name);
        if (isNew) databases.set(name, new Map());
        req.result = makeDb(databases.get(name)!);
        if (isNew) {
          stats.upgrades += 1;
          req.onupgradeneeded?.();
        }
        req.onsuccess?.();
      });
      return req;
    },
  };

  return { indexedDB, stats };
}

describe('lib/offline-cache', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-26T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('saves a snapshot and reads it back with its save time', async () => {
    const { indexedDB, stats } = createFakeIndexedDB();
    vi.stubGlobal('indexedDB', indexedDB);
    const value = { streams: [{ id: 1, rate: '10' }], total: 1 };

    await saveSnapshot('streams:GABC', value);
    const record = await readSnapshot<typeof value>('streams:GABC');

    expect(record).toEqual({
      key: 'streams:GABC',
      savedAt: Date.parse('2026-09-26T12:00:00Z'),
      value,
    });
    // The object store is created once, on first open, and every connection is closed.
    expect(stats.upgrades).toBe(1);
    expect(stats.closes).toBe(stats.opens);
  });

  it('overwrites an existing snapshot for the same key', async () => {
    vi.stubGlobal('indexedDB', createFakeIndexedDB().indexedDB);

    await saveSnapshot('k', { v: 1 });
    vi.setSystemTime(new Date('2026-09-26T13:00:00Z'));
    await saveSnapshot('k', { v: 2 });

    const record = await readSnapshot<{ v: number }>('k');
    expect(record?.value).toEqual({ v: 2 });
    expect(record?.savedAt).toBe(Date.parse('2026-09-26T13:00:00Z'));
  });

  it('keeps snapshots for different keys separate', async () => {
    vi.stubGlobal('indexedDB', createFakeIndexedDB().indexedDB);

    await saveSnapshot('a', 'first');
    await saveSnapshot('b', 'second');

    expect((await readSnapshot<string>('a'))?.value).toBe('first');
    expect((await readSnapshot<string>('b'))?.value).toBe('second');
  });

  it('returns null for a key that was never saved', async () => {
    vi.stubGlobal('indexedDB', createFakeIndexedDB().indexedDB);
    await expect(readSnapshot('missing')).resolves.toBeNull();
  });

  it('is a no-op when IndexedDB is unavailable (SSR / private mode)', async () => {
    vi.stubGlobal('indexedDB', undefined);

    await expect(saveSnapshot('k', { v: 1 })).resolves.toBeUndefined();
    await expect(readSnapshot('k')).resolves.toBeNull();
  });

  it('rejects when the database cannot be opened', async () => {
    vi.stubGlobal('indexedDB', createFakeIndexedDB({ failOpen: true }).indexedDB);

    await expect(saveSnapshot('k', 1)).rejects.toMatchObject({ name: 'UnknownError' });
    await expect(readSnapshot('k')).rejects.toMatchObject({ name: 'UnknownError' });
  });

  it('rejects when the write fails', async () => {
    vi.stubGlobal('indexedDB', createFakeIndexedDB({ failPut: true }).indexedDB);
    await expect(saveSnapshot('k', 1)).rejects.toMatchObject({ message: 'Simulated failure' });
  });

  it('rejects when the read fails', async () => {
    vi.stubGlobal('indexedDB', createFakeIndexedDB({ failGet: true }).indexedDB);
    await expect(readSnapshot('k')).rejects.toMatchObject({ message: 'Simulated failure' });
  });
});
