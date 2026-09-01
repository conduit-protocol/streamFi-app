import { beforeEach, describe, expect, it, vi } from 'vitest';

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
