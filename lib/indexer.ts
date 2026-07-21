import { getStreamAddress, getStreamInfo } from './stream';
import { streamsBySender, streamsByRecipient } from './factory';

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
