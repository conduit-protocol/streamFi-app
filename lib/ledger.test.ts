import { describe, it, expect } from 'vitest';
import { estimateLedgerSequence } from './ledger';

const anchor = { sequence: 1_000_000, timestamp: 1_700_000_000 };

describe('estimateLedgerSequence', () => {
  it('returns the anchor sequence at the anchor time', () => {
    expect(estimateLedgerSequence(anchor.timestamp, anchor)).toBe(1_000_000);
  });

  it('extrapolates forward at one ledger per 5 seconds', () => {
    expect(estimateLedgerSequence(anchor.timestamp + 500, anchor)).toBe(1_000_100);
  });

  it('extrapolates backward for past timestamps', () => {
    expect(estimateLedgerSequence(anchor.timestamp - 500, anchor)).toBe(999_900);
  });

  it('returns null without an anchor or for invalid timestamps', () => {
    expect(estimateLedgerSequence(anchor.timestamp, null)).toBeNull();
    expect(estimateLedgerSequence(0, anchor)).toBeNull();
    expect(estimateLedgerSequence(NaN, anchor)).toBeNull();
  });

  it('returns null when the estimate is not a positive ledger', () => {
    expect(estimateLedgerSequence(1, { sequence: 10, timestamp: 1_000 })).toBeNull();
  });
});
