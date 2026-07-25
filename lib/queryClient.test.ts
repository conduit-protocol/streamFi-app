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

import { queryClient, refreshStreamData } from './queryClient';

describe('refreshStreamData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvalidateQueries.mockResolvedValue(undefined);
    mockRefetchQueries.mockResolvedValue(undefined);
  });

  it('invalidates and refetches active queries after a stream mutation succeeds', async () => {
    await refreshStreamData();

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ refetchType: 'active' });
    expect(queryClient.refetchQueries).toHaveBeenCalledWith({ type: 'active' });
  });
});
