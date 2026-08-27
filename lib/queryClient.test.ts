import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockInvalidateQueries, mockRefetchQueries } = vi.hoisted(() => ({
  mockInvalidateQueries: vi.fn(),
  mockRefetchQueries: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  QueryClient: class {
    invalidateQueries = mockInvalidateQueries;
    refetchQueries = mockRefetchQueries;
  },
}));

import {
  queryClient,
  refreshStreamData,
  makeQueryClient,
  getQueryClient,
} from './queryClient';

describe('QueryClient isolation and helpers (#345)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvalidateQueries.mockResolvedValue(undefined);
    mockRefetchQueries.mockResolvedValue(undefined);
  });

  it('makeQueryClient creates a new QueryClient instance', () => {
    const client1 = makeQueryClient();
    const client2 = makeQueryClient();
    expect(client1).toBeDefined();
    expect(client2).toBeDefined();
    expect(client1).not.toBe(client2);
  });

  it('getQueryClient reuses the browser singleton when window is defined', () => {
    const client1 = getQueryClient();
    const client2 = getQueryClient();
    expect(client1).toBe(client2);
  });

  it('refetches active queries only once after a stream mutation succeeds', async () => {
    await refreshStreamData();

    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      refetchType: 'active',
    });
    expect(mockRefetchQueries).not.toHaveBeenCalled();
  });
});
