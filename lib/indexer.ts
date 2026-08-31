import { getStreamAddress, getStreamInfo, type StreamInfo } from './stream';
import { streamsBySender, streamsByRecipient, isMock } from './factory';

export interface TransactionRow {
  type:   string;
  amount: string;
  token:  string;
  status: 'Success' | 'Pending' | 'Failed';
  /** Unix seconds */
  date:   number;
  hash:   string;
}

const BASE_NOW = 1784630000; // Static timestamp to prevent SSR hydration mismatch

const DEMO_TXS: TransactionRow[] = [
  { type: 'Stream Created', amount: '1,000.00', token: 'XLM',   status: 'Success',  date: BASE_NOW - 3600,   hash: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2' },
  { type: 'Withdrawn',      amount: '50.42',    token: 'XLM',   status: 'Success',  date: BASE_NOW - 7200,   hash: 'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3' },
  { type: 'Withdrawn',      amount: '25.00',    token: 'XLM',   status: 'Success',  date: BASE_NOW - 14400,  hash: 'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4' },
  { type: 'Stream Created', amount: '500.00',   token: 'USDC',  status: 'Pending',  date: BASE_NOW - 600,    hash: 'd4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5' },
  { type: 'Cancelled',      amount: '200.00',   token: 'XLM',   status: 'Failed',   date: BASE_NOW - 86400,  hash: 'e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6' },
  { type: 'Withdrawn',      amount: '10.00',    token: 'USDC',  status: 'Failed',   date: BASE_NOW - 1800,   hash: 'f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7' },
  { type: 'Stream Created', amount: '3,000.00', token: 'XLM',   status: 'Success',  date: BASE_NOW - 172800, hash: 'a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8' },
  { type: 'Withdrawn',      amount: '100.00',   token: 'XLM',   status: 'Success',  date: BASE_NOW - 36000,  hash: 'b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9' },
];

/** How long to wait for the subgraph before treating it as unavailable. */
const SUBGRAPH_TIMEOUT_MS = 10_000;

export class IndexerNotConfiguredError extends Error {
  constructor() {
    super('Transaction history is unavailable — the subgraph/indexer is not configured yet.');
    this.name = 'IndexerNotConfiguredError';
  }
}

export function isIndexerNotConfiguredError(error: unknown): error is IndexerNotConfiguredError {
  return error instanceof IndexerNotConfiguredError;
}

/**
 * Fetch transaction history from the subgraph/indexer.
 *
 * The `signal` allows callers to abort a hung request. If the signal fires
 * while a real network call is in-flight, the promise rejects with an
 * AbortError so the UI shows an error state instead of an infinite spinner.
 *
 * Demo data is only ever returned in demo mode (`isMock()` — i.e.
 * `NEXT_PUBLIC_DEMO_MODE=true`). A fully-configured production deploy has no
 * real subgraph wired up yet, so it rejects rather than serving fabricated
 * transactions to real users (#341), matching `lib/factory.ts`'s `isMock()`
 * contract from #279.
 *
 * @param publicKey - The wallet's public key to fetch transactions for.
 * @param signal    - AbortSignal for cancellation
 */
export async function fetchTransactionHistory(
  publicKey?: string | null,
  signal?: AbortSignal,
): Promise<TransactionRow[]> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  return new Promise<TransactionRow[]>((resolve, reject) => {
    if (signal) {
      const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
      signal.addEventListener('abort', onAbort, { once: true });
    }

    // TODO: Replace with real GraphQL/indexer call once the subgraph is ready.
    // Example implementation:
    //   const res = await fetch('/api/graphql', {
    //     method: 'POST',
    //     signal,
    //     body: JSON.stringify({ query: TX_HISTORY_QUERY, variables: { address: publicKey } }),
    //   });
    //   if (!res.ok) throw new Error(`Subgraph returned ${res.status}`);
    //   return (await res.json()).data.transactions;

    // Demo mode only — never serve fabricated history to a configured deploy.
    let mock: boolean;
    try {
      mock = isMock();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    if (mock) {
      resolve(publicKey ? [] : DEMO_TXS);
    } else {
      reject(new IndexerNotConfiguredError());
    }
  });
}

/**
 * Run `fetchTransactionHistory` with a hard timeout so a hung/unresponsive
 * subgraph rejects instead of leaving the caller loading indefinitely.
 *
 * Rejects with a descriptive Error on timeout so the UI can display a
 * user-friendly message and React Query can transition out of 'pending'.
 *
 * @param publicKey - The wallet's public key to fetch transactions for
 * @param timeoutMs - Timeout in milliseconds (default: 10s)
 */
export async function fetchTransactionHistoryWithTimeout(
  publicKey?: string | null,
  timeoutMs: number = SUBGRAPH_TIMEOUT_MS,
): Promise<TransactionRow[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchTransactionHistory(publicKey, controller.signal);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Transaction history timed out after ${timeoutMs / 1000}s — the network may be slow or unavailable.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Page size for the factory's paginated stream-id lookups. */
const INDEXER_PAGE_SIZE = 100;
/** Hard cap so a misbehaving factory that never returns a short page can't
 *  spin this loop forever. */
const INDEXER_MAX_STREAMS = 5_000;

/** Walk every page of a `streams_by_*` lookup until a short (final) page. */
async function fetchAllStreamIds(
  fn: (source: string, addr: string, offset: number, limit: number, options?: { signal?: AbortSignal }) => Promise<bigint[]>,
  publicKey: string,
  options?: { signal?: AbortSignal },
): Promise<bigint[]> {
  const ids: bigint[] = [];
  for (let offset = 0; offset < INDEXER_MAX_STREAMS; offset += INDEXER_PAGE_SIZE) {
    if (options?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const page = await fn(publicKey, publicKey, offset, INDEXER_PAGE_SIZE, options);
    ids.push(...page);
    if (page.length < INDEXER_PAGE_SIZE) return ids;
  }
  console.warn(
    `fetchStreamsFromIndexer: stopped at ${INDEXER_MAX_STREAMS} streams — some may be missing`,
  );
  return ids;
}

export interface IndexedStreamRow {
  id: string;
  address?: string;
  info: StreamInfo;
}

export interface FetchStreamsResult {
  streams: IndexedStreamRow[];
  failedIds: string[];
  errors: Array<{ id: string; error: Error }>;
}

export interface FetchStreamsOptions {
  signal?: AbortSignal;
  maxConcurrency?: number;
  onPartialFailure?: (failedIds: string[], errors: Array<{ id: string; error: Error }>) => void;
}

/**
 * Fetch all streams for a given wallet address and role.
 *
 * Uses bounded concurrency instead of sequential N+1 roundtrips (#342) and
 * surfaces partial failure via structured result, callback, and console warning.
 */
export async function fetchStreamsFromIndexer(
  publicKey: string,
  role: 'sender' | 'recipient',
  options?: FetchStreamsOptions,
): Promise<IndexedStreamRow[] & FetchStreamsResult> {
  const signal = options?.signal;
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const ids = await fetchAllStreamIds(
    role === 'sender' ? streamsBySender : streamsByRecipient,
    publicKey,
    options,
  );

  const maxConcurrency = options?.maxConcurrency ?? 10;
  const streams: IndexedStreamRow[] = [];
  const failedIds: string[] = [];
  const errors: Array<{ id: string; error: Error }> = [];

  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < ids.length) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const idx = nextIndex++;
      const id = ids[idx];
      if (id === undefined) break;

      const strId = id.toString();
      try {
        const addr = await getStreamAddress(publicKey, id, { signal });
        if (!addr) {
          throw new Error(`Stream address not found for stream ${strId}`);
        }
        const info = await getStreamInfo(publicKey, addr, { signal });
        if (!info) {
          throw new Error(`Stream info not found for stream ${strId} at ${addr}`);
        }
        streams.push({ id: strId, address: addr, info });
      } catch (err: unknown) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        if (signal?.aborted || errorObj.name === 'AbortError') {
          throw errorObj;
        }
        failedIds.push(strId);
        errors.push({ id: strId, error: errorObj });
      }
    }
  };

  const poolSize = Math.min(ids.length, Math.max(1, maxConcurrency));
  const workers = Array.from({ length: poolSize }, () => worker());
  await Promise.all(workers);

  if (failedIds.length > 0) {
    console.warn(
      `fetchStreamsFromIndexer: ${failedIds.length} stream(s) failed to load: ${failedIds.join(', ')}`,
    );
    options?.onPartialFailure?.(failedIds, errors);
  }

  const result = Object.assign(streams, {
    streams,
    failedIds,
    errors,
  });

  return result as IndexedStreamRow[] & FetchStreamsResult;
}
