import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useNetworkStatus } from './useNetworkStatus';
import { reportRpcFailure, reportRpcSuccess, resetNetworkStatus } from '@/lib/network-status';

describe('useNetworkStatus', () => {
  beforeEach(() => {
    resetNetworkStatus();
  });

  afterEach(() => {
    resetNetworkStatus();
  });

  it('reports ok status with episode 0 before any RPC signal', () => {
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.status).toBe('ok');
    expect(result.current.episode).toBe(0);
  });

  it('transitions to trouble and bumps the episode when an RPC failure is reported', () => {
    const { result } = renderHook(() => useNetworkStatus());

    act(() => {
      reportRpcFailure();
    });

    expect(result.current.status).toBe('trouble');
    expect(result.current.episode).toBe(1);
  });

  it('does not bump the episode again while already in trouble', () => {
    const { result } = renderHook(() => useNetworkStatus());

    act(() => {
      reportRpcFailure();
      reportRpcFailure();
    });

    expect(result.current.status).toBe('trouble');
    expect(result.current.episode).toBe(1);
  });

  it('returns to ok status when a success is reported, keeping the episode number', () => {
    const { result } = renderHook(() => useNetworkStatus());

    act(() => {
      reportRpcFailure();
    });
    act(() => {
      reportRpcSuccess();
    });

    expect(result.current.status).toBe('ok');
    expect(result.current.episode).toBe(1);
  });

  it('bumps the episode again on a fresh trouble episode after recovery', () => {
    const { result } = renderHook(() => useNetworkStatus());

    act(() => {
      reportRpcFailure();
    });
    act(() => {
      reportRpcSuccess();
    });
    act(() => {
      reportRpcFailure();
    });

    expect(result.current.status).toBe('trouble');
    expect(result.current.episode).toBe(2);
  });

  it('unsubscribes on unmount so later signals do not throw or update stale state', () => {
    const { result, unmount } = renderHook(() => useNetworkStatus());
    unmount();

    expect(() => {
      act(() => {
        reportRpcFailure();
      });
    }).not.toThrow();

    expect(result.current.status).toBe('ok');
  });
});
