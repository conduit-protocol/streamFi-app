import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSelectedNetwork } from './useSelectedNetwork';
import { saveSelectedNetwork } from '@/lib/network-storage';
import { NETWORK_STORAGE_KEY } from '@/lib/network-config';

describe('useSelectedNetwork', () => {
  beforeEach(() => {
    localStorage.removeItem(NETWORK_STORAGE_KEY);
  });

  it('reports the default (testnet) network when nothing is stored', () => {
    const { result } = renderHook(() => useSelectedNetwork());
    expect(result.current.name).toBe('testnet');
  });

  it('reports the persisted network on mount', () => {
    localStorage.setItem(NETWORK_STORAGE_KEY, 'mainnet');
    const { result } = renderHook(() => useSelectedNetwork());
    expect(result.current.name).toBe('mainnet');
  });

  it('re-renders when the selected network changes via saveSelectedNetwork', () => {
    const { result } = renderHook(() => useSelectedNetwork());
    expect(result.current.name).toBe('testnet');

    act(() => {
      saveSelectedNetwork('local');
    });

    expect(result.current.name).toBe('local');
  });
});
