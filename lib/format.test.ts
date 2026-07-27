import { describe, it, expect } from 'vitest';
import {
  fromStroops,
  toStroops,
  formatDuration,
  truncateAddress,
  wouldRateTruncateToZero,
} from './format.js';

describe('wouldRateTruncateToZero', () => {
  it('is true for a small deposit over the default 30-day duration (issue #243)', () => {
    expect(wouldRateTruncateToZero('0.001', 7, 2_592_000)).toBe(true);
  });

  it('is false when the rate computes to a non-zero value', () => {
    expect(wouldRateTruncateToZero('1000', 7, 2_592_000)).toBe(false);
  });

  it('is false right at the boundary where the rate is exactly 1', () => {
    expect(wouldRateTruncateToZero('0.2592', 7, 2_592_000)).toBe(false);
  });

  it('is true one stroop below that boundary', () => {
    expect(wouldRateTruncateToZero('0.2591999', 7, 2_592_000)).toBe(true);
  });

  it('is false for an empty deposit amount', () => {
    expect(wouldRateTruncateToZero('', 7, 2_592_000)).toBe(false);
  });

  it('is false for a zero deposit amount', () => {
    expect(wouldRateTruncateToZero('0', 7, 2_592_000)).toBe(false);
  });

  it('is false for a non-finite or non-positive duration (still being typed)', () => {
    expect(wouldRateTruncateToZero('0.001', 7, Number.NaN)).toBe(false);
    expect(wouldRateTruncateToZero('0.001', 7, 0)).toBe(false);
    expect(wouldRateTruncateToZero('0.001', 7, -1)).toBe(false);
  });

  it('respects a token with fewer decimals', () => {
    expect(wouldRateTruncateToZero('1', 2, 2_592_000)).toBe(true);
  });
});

describe('fromStroops', () => {
  it('formats a whole-number amount', () => {
    expect(fromStroops(100_000_000n)).toBe('10.00');
  });

  it('trims trailing zeros but keeps at least 2 decimals', () => {
    expect(fromStroops(15_000_000n)).toBe('1.50');
  });

  it('keeps significant fractional digits', () => {
    expect(fromStroops(1_234_567n)).toBe('0.1234567');
  });

  it('respects a custom decimals value', () => {
    expect(fromStroops(1_050n, 2)).toBe('10.50');
  });

  it('renders negative stroops correctly (issue #205)', () => {
    expect(fromStroops(-1_234_567n)).toBe('-0.1234567');
  });

  it('renders negative whole amounts correctly', () => {
    expect(fromStroops(-100_000_000n)).toBe('-10.00');
  });
});

describe('toStroops', () => {
  it('round-trips with fromStroops for whole amounts', () => {
    expect(toStroops('10.00')).toBe(100_000_000n);
  });

  it('parses an amount with no fractional part', () => {
    expect(toStroops('42')).toBe(420_000_000n);
  });

  it('pads a short fractional part', () => {
    expect(toStroops('1.5')).toBe(15_000_000n);
  });

  it('handles leading-dot input (issue #206)', () => {
    expect(toStroops('.5')).toBe(5_000_000n);
  });

  it('handles negative whole+fraction correctly (issue #207)', () => {
    expect(toStroops('-5.25')).toBe(-52_500_000n);
  });

  it('handles negative whole-only correctly', () => {
    expect(toStroops('-3')).toBe(-30_000_000n);
  });
});

describe('formatDuration', () => {
  it('formats seconds', () => {
    expect(formatDuration(45)).toBe('45s');
  });

  it('formats minutes', () => {
    expect(formatDuration(120)).toBe('2m');
  });

  it('formats hours', () => {
    expect(formatDuration(7200)).toBe('2h');
  });

  it('formats days', () => {
    expect(formatDuration(86400 * 2)).toBe('2d');
  });

  it('formats weeks', () => {
    expect(formatDuration(86400 * 14)).toBe('2w');
  });
});

describe('truncateAddress', () => {
  it('leaves short addresses untouched', () => {
    expect(truncateAddress('GABC123')).toBe('GABC123');
  });

  it('truncates a full Stellar address', () => {
    expect(truncateAddress('GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN')).toBe(
      'GAAZ…CCWN',
    );
  });

  it('respects a custom character count', () => {
    expect(
      truncateAddress('GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN', 6),
    ).toBe('GAAZI4…KOCCWN');
  });
});
