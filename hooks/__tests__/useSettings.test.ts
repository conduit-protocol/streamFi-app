/**
 * Tests for hooks/useSettings.ts (#612).
 *
 * Covers the useSettings hook: reading from localStorage, defaults,
 * storage event cross-tab sync, and edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSettings, MIN_REFRESH_INTERVAL_S, REFRESH_INTERVAL_OPTIONS } from '../useSettings';

const STORAGE_KEY = 'conduit:settings';

describe('useSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('returns defaults when localStorage is empty', () => {
    const { result } = renderHook(() => useSettings());

    expect(result.current.timeFormat).toBe('absolute');
    expect(result.current.autoRefreshInterval).toBe(0);
  });

  it('reads timeFormat from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ timeFormat: 'relative' }));

    const { result } = renderHook(() => useSettings());

    expect(result.current.timeFormat).toBe('relative');
  });

  it('reads autoRefreshInterval from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ autoRefreshInterval: 30 }));

    const { result } = renderHook(() => useSettings());

    expect(result.current.autoRefreshInterval).toBe(30);
  });

  it('falls back to defaults for invalid timeFormat', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ timeFormat: 'invalid' }));

    const { result } = renderHook(() => useSettings());

    expect(result.current.timeFormat).toBe('absolute');
  });

  it('falls back to 0 for invalid autoRefreshInterval', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ autoRefreshInterval: 999 }));

    const { result } = renderHook(() => useSettings());

    expect(result.current.autoRefreshInterval).toBe(0);
  });

  it('falls back to defaults for malformed JSON', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json');

    const { result } = renderHook(() => useSettings());

    expect(result.current.timeFormat).toBe('absolute');
    expect(result.current.autoRefreshInterval).toBe(0);
  });

  it('updates when localStorage changes via storage event', () => {
    const { result } = renderHook(() => useSettings());

    expect(result.current.timeFormat).toBe('absolute');

    act(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ timeFormat: 'relative' }));
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: STORAGE_KEY,
          newValue: JSON.stringify({ timeFormat: 'relative' }),
        }),
      );
    });

    expect(result.current.timeFormat).toBe('relative');
  });

  it('ignores storage events for other keys', () => {
    const { result } = renderHook(() => useSettings());

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'other-key',
          newValue: JSON.stringify({ timeFormat: 'relative' }),
        }),
      );
    });

    expect(result.current.timeFormat).toBe('absolute');
  });

  it('MIN_REFRESH_INTERVAL_S is 10', () => {
    expect(MIN_REFRESH_INTERVAL_S).toBe(10);
  });

  it('REFRESH_INTERVAL_OPTIONS contains expected values', () => {
    expect(REFRESH_INTERVAL_OPTIONS).toEqual([
      { label: 'Off', value: 0 },
      { label: '10 s', value: 10 },
      { label: '30 s', value: 30 },
      { label: '1 min', value: 60 },
      { label: '5 min', value: 300 },
    ]);
  });

  it('validates autoRefreshInterval against allowed options', () => {
    // Only values in REFRESH_INTERVAL_OPTIONS should be accepted
    const validValues = REFRESH_INTERVAL_OPTIONS.map((o) => o.value);

    for (const value of validValues) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ autoRefreshInterval: value }));
      const { result } = renderHook(() => useSettings());
      expect(result.current.autoRefreshInterval).toBe(value);
    }
  });
});
