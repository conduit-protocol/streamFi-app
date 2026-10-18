import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getNetworkStatus,
  getNetworkEpisode,
  subscribeNetworkStatus,
  reportRpcFailure,
  reportRpcSuccess,
  resetNetworkStatus,
} from './network-status';

describe('network-status', () => {
  beforeEach(() => {
    resetNetworkStatus();
  });

  it('starts healthy', () => {
    expect(getNetworkStatus()).toBe('ok');
    expect(getNetworkEpisode()).toBe(0);
  });

  it('flips to trouble on an RPC failure and back on success', () => {
    reportRpcFailure();
    expect(getNetworkStatus()).toBe('trouble');

    reportRpcSuccess();
    expect(getNetworkStatus()).toBe('ok');
  });

  it('notifies subscribers only on an actual transition', () => {
    const listener = vi.fn();
    subscribeNetworkStatus(listener);

    reportRpcFailure();
    reportRpcFailure(); // already in trouble — no second notification
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith('trouble');

    reportRpcSuccess();
    reportRpcSuccess(); // already ok — no second notification
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith('ok');
  });

  it('bumps the episode id for each fresh outage but not within one', () => {
    reportRpcFailure();
    const first = getNetworkEpisode();
    reportRpcFailure();
    expect(getNetworkEpisode()).toBe(first);

    reportRpcSuccess();
    reportRpcFailure();
    expect(getNetworkEpisode()).toBe(first + 1);
  });

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeNetworkStatus(listener);
    unsubscribe();

    reportRpcFailure();
    expect(listener).not.toHaveBeenCalled();
  });
});
