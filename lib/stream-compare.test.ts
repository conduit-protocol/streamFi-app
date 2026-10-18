import { describe, it, expect } from 'vitest';
import type { StreamInfo } from '@/lib/stream';
import { compareMetrics, countCompareIds, parseCompareIds, MAX_COMPARE } from './stream-compare';

const NOW = 1_000_000;

function info(overrides: Partial<StreamInfo> = {}): StreamInfo {
  return {
    sender: 'GSENDER',
    recipient: 'GRECIPIENT',
    token: 'CTOKEN',
    ratePerSecond: 10n,
    startTime: NOW - 100,
    endTime: NOW + 300,
    withdrawn: 0n,
    paused: false,
    pausedAt: 0,
    clawbackEnabled: false,
    cancelled: false,
    operator: null,
    ...overrides,
  };
}

describe('compareMetrics', () => {
  it('computes progress, remaining time and amount for an active stream', () => {
    const m = compareMetrics(info(), NOW);
    expect(m.status).toBe('active');
    expect(m.progressPct).toBe(25);
    expect(m.remainingSec).toBe(300);
    expect(m.remainingAmount).toBe(3000n);
    expect(m.ratePerDay).toBe(864_000n);
  });

  it('freezes a paused stream at pausedAt', () => {
    const m = compareMetrics(info({ paused: true, pausedAt: NOW - 50 }), NOW);
    expect(m.status).toBe('paused');
    expect(m.progressPct).toBeCloseTo(12.5);
    expect(m.remainingSec).toBe(350);
  });

  it('reports ended streams as 100% with nothing remaining', () => {
    const m = compareMetrics(info({ endTime: NOW - 1 }), NOW);
    expect(m.status).toBe('ended');
    expect(m.progressPct).toBe(100);
    expect(m.remainingSec).toBe(0);
    expect(m.remainingAmount).toBe(0n);
  });

  it('reports cancelled streams with zero remaining time', () => {
    const m = compareMetrics(info({ cancelled: true }), NOW);
    expect(m.status).toBe('cancelled');
    expect(m.progressPct).toBe(25);
    expect(m.remainingSec).toBe(0);
  });

  it('returns nulls for open-ended streams', () => {
    const m = compareMetrics(info({ endTime: 0 }), NOW);
    expect(m.progressPct).toBeNull();
    expect(m.remainingSec).toBeNull();
    expect(m.remainingAmount).toBeNull();
  });
});

describe('parseCompareIds', () => {
  it('returns [] for a missing param', () => {
    expect(parseCompareIds(null)).toEqual([]);
  });

  it('drops invalid and duplicate ids', () => {
    expect(parseCompareIds('1, 2,abc,2,-3,,4')).toEqual(['1', '2', '4']);
  });

  it(`caps the list at ${MAX_COMPARE}`, () => {
    expect(parseCompareIds('1,2,3,4,5,6')).toHaveLength(MAX_COMPARE);
  });
});

describe('countCompareIds', () => {
  it('counts distinct valid ids without applying the cap', () => {
    expect(countCompareIds(null)).toBe(0);
    expect(countCompareIds('1,2,2,abc,3')).toBe(3);
    expect(countCompareIds('1,2,3,4,5,6')).toBe(6);
    expect(countCompareIds('1,2,3,4,5,6')).toBeGreaterThan(MAX_COMPARE);
  });
});
