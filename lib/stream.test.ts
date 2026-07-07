import { describe, it, expect } from 'vitest';
import { computeWithdrawable, type StreamInfo } from './stream.js';

function baseInfo(overrides: Partial<StreamInfo> = {}): StreamInfo {
  return {
    sender:          'GSENDER',
    recipient:       'GRECIPIENT',
    token:           'CTOKEN',
    ratePerSecond:   10n,
    startTime:       1_000,
    endTime:         2_000,
    withdrawn:       0n,
    paused:          false,
    pausedAt:        0,
    clawbackEnabled: false,
    cancelled:       false,
    ...overrides,
  };
}

describe('computeWithdrawable', () => {
  it('returns 0 before the stream has started', () => {
    const info = baseInfo();
    expect(computeWithdrawable(info, 500)).toBe(0n);
  });

  it('accrues linearly based on elapsed time and rate', () => {
    const info = baseInfo();
    // 50 seconds elapsed * rate 10 = 500
    expect(computeWithdrawable(info, 1_050)).toBe(500n);
  });

  it('subtracts already withdrawn amount', () => {
    const info = baseInfo({ withdrawn: 200n });
    expect(computeWithdrawable(info, 1_050)).toBe(300n);
  });

  it('clamps accrual at endTime', () => {
    const info = baseInfo();
    // full duration is 1000 seconds * rate 10 = 10000
    expect(computeWithdrawable(info, 5_000)).toBe(10_000n);
  });

  it('stops accruing further once paused', () => {
    const info = baseInfo({ paused: true, pausedAt: 1_100 });
    // Even if "now" is much later, accrual is frozen at pausedAt
    expect(computeWithdrawable(info, 1_900)).toBe(1_000n);
  });

  it('returns 0 for a cancelled stream', () => {
    const info = baseInfo({ cancelled: true });
    expect(computeWithdrawable(info, 1_500)).toBe(0n);
  });

  it('never returns a negative amount', () => {
    const info = baseInfo({ withdrawn: 999_999n });
    expect(computeWithdrawable(info, 1_050)).toBe(0n);
  });
});
