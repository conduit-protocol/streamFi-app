import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./stream', () => ({
  getStreamAddress: vi.fn(),
  getStreamInfo: vi.fn(),
}));

const { mockIsMock } = vi.hoisted(() => ({
  mockIsMock: vi.fn(),
}));

vi.mock('./factory', () => ({
  streamsBySender: vi.fn(),
  streamsByRecipient: vi.fn(),
  isMock: mockIsMock,
}));

describe('fetchTransactionHistory indexer availability', () => {
  beforeEach(() => {
    mockIsMock.mockReset();
    vi.stubEnv('NEXT_PUBLIC_SUBGRAPH_URL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses a typed error when transaction history is not configured', async () => {
    expect.assertions(2);
    mockIsMock.mockReturnValue(false);
    const {
      fetchTransactionHistory,
      IndexerNotConfiguredError,
      isIndexerNotConfiguredError,
    } = await import('./indexer.js');

    await expect(fetchTransactionHistory('GTEST')).rejects.toBeInstanceOf(
      IndexerNotConfiguredError,
    );

    try {
      await fetchTransactionHistory('GTEST');
    } catch (error) {
      expect(isIndexerNotConfiguredError(error)).toBe(true);
    }
  });

  it('preserves the typed not-configured error through the timeout wrapper', async () => {
    expect.assertions(1);
    mockIsMock.mockReturnValue(false);
    const { fetchTransactionHistoryWithTimeout, isIndexerNotConfiguredError } =
      await import('./indexer.js');

    try {
      await fetchTransactionHistoryWithTimeout('GTEST');
    } catch (error) {
      expect(isIndexerNotConfiguredError(error)).toBe(true);
    }
  });
});

describe('fetchTransactionHistory subgraph query (#592)', () => {
  const SUBGRAPH = 'https://subgraph.example/graphql';
  const fetchMock = vi.fn();

  beforeEach(() => {
    mockIsMock.mockReset();
    mockIsMock.mockReturnValue(false);
    fetchMock.mockReset();
    vi.stubEnv('NEXT_PUBLIC_SUBGRAPH_URL', SUBGRAPH);
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function jsonResponse(body: unknown, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  }

  it('performs a real network call and maps the subgraph rows', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: {
          transactions: [
            { type: 'Withdrawn', amount: '12.5', token: 'XLM', status: 'success', timestamp: '1784630000', hash: 'h1' },
            { type: 'Stream Created', amount: '100', token: 'USDC', status: 'Failed', timestamp: 1784620000, hash: 'h2' },
          ],
        },
      }),
    );
    const { fetchTransactionHistory, TX_HISTORY_QUERY } = await import('./indexer.js');
    const controller = new AbortController();

    const rows = await fetchTransactionHistory('GTEST', controller.signal);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(SUBGRAPH);
    expect(init.method).toBe('POST');
    expect(init.signal).toBe(controller.signal);
    expect(JSON.parse(init.body)).toEqual({ query: TX_HISTORY_QUERY, variables: { address: 'GTEST' } });
    expect(rows).toEqual([
      { type: 'Withdrawn', amount: '12.5', token: 'XLM', status: 'Success', date: 1784630000, hash: 'h1' },
      { type: 'Stream Created', amount: '100', token: 'USDC', status: 'Failed', date: 1784620000, hash: 'h2' },
    ]);
  });

  it('rejects on a non-2xx response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 502));
    const { fetchTransactionHistory } = await import('./indexer.js');
    await expect(fetchTransactionHistory('GTEST')).rejects.toThrow('Subgraph returned 502');
  });

  it('rejects when the subgraph reports GraphQL errors', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ errors: [{ message: 'bad field' }] }));
    const { fetchTransactionHistory } = await import('./indexer.js');
    await expect(fetchTransactionHistory('GTEST')).rejects.toThrow('bad field');
  });

  it('surfaces an abort from the caller as an AbortError', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );
    const { fetchTransactionHistory } = await import('./indexer.js');
    const controller = new AbortController();
    const pending = fetchTransactionHistory('GTEST', controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('does not call the network without a connected account', async () => {
    const { fetchTransactionHistory } = await import('./indexer.js');
    await expect(fetchTransactionHistory(null)).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never calls the network in demo mode', async () => {
    mockIsMock.mockReturnValue(true);
    const { fetchTransactionHistory } = await import('./indexer.js');
    const rows = await fetchTransactionHistory(null);
    expect(rows.length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
