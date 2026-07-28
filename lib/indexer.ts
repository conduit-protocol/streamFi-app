import { getStreamAddress, getStreamInfo } from './stream';
import { streamsBySender, streamsByRecipient } from './factory';

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
  { type: 'Stream Created', amount: '1,000.00', token: 'XLM',   status: 'Success',  date: BASE_NOW - 3600,   hash: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0' },
  { type: 'Withdrawn',      amount: '50.42',    token: 'XLM',   status: 'Success',  date: BASE_NOW - 7200,   hash: 'b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1' },
  { type: 'Withdrawn',      amount: '25.00',    token: 'XLM',   status: 'Success',  date: BASE_NOW - 14400,  hash: 'c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2' },
  { type: 'Stream Created', amount: '500.00',   token: 'USDC',  status: 'Pending',  date: BASE_NOW - 600,    hash: 'd4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3' },
  { type: 'Cancelled',      amount: '200.00',   token: 'XLM',   status: 'Failed',   date: BASE_NOW - 86400,  hash: 'e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4' },
  { type: 'Withdrawn',      amount: '10.00',    token: 'USDC',  status: 'Failed',   date: BASE_NOW - 1800,   hash: 'f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5' },
  { type: 'Stream Created', amount: '3,000.00', token: 'XLM',   status: 'Success',  date: BASE_NOW - 172800, hash: 'g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6' },
  { type: 'Withdrawn',      amount: '100.00',   token: 'XLM',   status: 'Success',  date: BASE_NOW - 36000,  hash: 'h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7' },
];

/** How long to wait for the subgraph before treating it as unavailable. */
const SUBGRAPH_TIMEOUT_MS = 10_000;

/**
 * Fetch transaction history from the subgraph/indexer.
 *
 * The `signal` allows callers to abort a hung request. If the signal fires
 * while a real network call is in-flight, the promise rejects with an
 * AbortError so the UI shows an error state instead of an infinite spinner.
 *
 * @param publicKey - The wallet's public key to fetch transactions for.
 *                    When provided, the returned data is scoped to this wallet.
 *                    When omitted, demo data is returned (placeholder mode).
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

    // Placeholder: return demo data. The page UI labels this as demo data.
    resolve(publicKey ? DEMO_TXS : []);
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

// Mock GraphQL / Indexer fetcher
export async function fetchStreamsFromIndexer(publicKey: string, role: 'sender' | 'recipient') {
  // In a real implementation, this would be a single fetch() call to a GraphQL endpoint
  // returning all streams instantly.
  // e.g., const response = await fetch('/api/graphql', { method: 'POST', body: ... })
  
  const ids = role === 'sender'
    ? await streamsBySender(publicKey, publicKey, 0, 100)
    : await streamsByRecipient(publicKey, publicKey, 0, 100);

  const rows = [];
  for (const id of ids) {
    try {
      const addr = await getStreamAddress(publicKey, id);
      if (!addr) continue;
      const info = await getStreamInfo(publicKey, addr);
      rows.push({ id: id.toString(), info });
    } catch { /* skip */ }
  }
  return rows;
}
