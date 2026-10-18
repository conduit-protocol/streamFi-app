import { describe, it, expect, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { queryKeys, invalidateStreamMutation } from './query-keys';

describe('queryKeys (#431)', () => {
  it('produces stable structured stream keys', () => {
    expect(queryKeys.streams.detail('CABC')).toEqual(['stream', 'CABC']);
    expect(queryKeys.streams.info('CABC')).toEqual(['stream', 'CABC', 'info']);
    expect(queryKeys.streams.withdrawable('CABC')).toEqual(['stream', 'CABC', 'withdrawable']);
    expect(queryKeys.streams.lists()).toEqual(['stream', 'list']);
  });

  it('detail() is a prefix of info()/withdrawable() so one invalidate covers both', () => {
    const detail = queryKeys.streams.detail('CABC');
    expect(queryKeys.streams.info('CABC').slice(0, detail.length)).toEqual([...detail]);
    expect(queryKeys.streams.withdrawable('CABC').slice(0, detail.length)).toEqual([...detail]);
  });
});

describe('invalidateStreamMutation (#431)', () => {
  it('invalidates only the touched trees, never the whole cache', async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue(undefined);

    await invalidateStreamMutation(qc, 'CABC');

    const keys = spy.mock.calls.map(c => c[0]?.queryKey);
    expect(keys).toContainEqual(['stream', 'CABC']);
    expect(keys).toContainEqual(['stream', 'list']);
    expect(keys).toContainEqual(['dashboard']);
    expect(keys).toContainEqual(['transactions']);
    expect(keys).toContainEqual(['wallet']);
    // The regression: a no-filter invalidateQueries() call.
    for (const call of spy.mock.calls) {
      expect(call[0]?.queryKey).toBeDefined();
    }
  });
});
