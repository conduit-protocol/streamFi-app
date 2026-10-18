import { describe, it, expect } from 'vitest';
import {
  fromStroops,
  toStroops,
  formatDuration,
  formatTimestamp,
  formatTimestampRelative,
  truncateAddress,
  wouldRateTruncateToZero,
  formatAmount,
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

  it('handles tokens with >15 decimals without precision loss (issue #337)', () => {
    expect(fromStroops(10_000_000_000_000_000_000n, 18)).toBe('10.00');
    expect(fromStroops(1_234_567_890_123_456_789n, 18)).toBe('1.234567890123456789');
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

  it('handles tokens with >15 decimals without precision loss (issue #337)', () => {
    expect(toStroops('10.00', 18)).toBe(10_000_000_000_000_000_000n);
    expect(toStroops('1.234567890123456789', 18)).toBe(1_234_567_890_123_456_789n);
  });

  describe('input validation and scientific notation (issue #338)', () => {
    it('parses scientific notation', () => {
      expect(toStroops('1e5')).toBe(1_000_000_000_000n);
      expect(toStroops('1.5e2')).toBe(1_500_000_000n);
      expect(toStroops('-1.5e2')).toBe(-1_500_000_000n);
      expect(toStroops('1e7')).toBe(100_000_000_000_000n);
    });

    it('throws descriptive error on non-numeric input', () => {
      expect(() => toStroops('abc')).toThrow('Invalid amount');
      expect(() => toStroops('5-2')).toThrow('Invalid amount');
      expect(() => toStroops('')).toThrow('Invalid amount');
      expect(() => toStroops('   ')).toThrow('Invalid amount');
    });

    it('throws error when fractional part exceeds token decimals (issue #320)', () => {
      expect(() => toStroops('1.12345678', 7)).toThrow(
        'Amount has 8 decimal places but token only supports 7',
      );
    });
  });
});

describe('formatTimestamp', () => {
  it('formats unix timestamp with UTC timezone to prevent hydration mismatches (issue #339)', () => {
    // 1700000000 = Tuesday, November 14, 2023 10:13:20 PM UTC
    const formatted = formatTimestamp(1700000000);
    expect(formatted).toBe('Nov 14, 2023, 10:13 PM');
  });
});

describe('formatTimestampRelative', () => {
  it('returns "just now" for timestamps within the last 45 seconds (#556)', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(formatTimestampRelative(now - 10)).toBe('just now');
    expect(formatTimestampRelative(now)).toBe('just now');
  });

  it('returns minutes ago for timestamps 1–59 minutes old (#556)', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(formatTimestampRelative(now - 60)).toBe('1m ago');
    expect(formatTimestampRelative(now - 3540)).toBe('59m ago');
  });

  it('returns hours ago for timestamps 1–23 hours old (#556)', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(formatTimestampRelative(now - 3600)).toBe('1h ago');
    expect(formatTimestampRelative(now - 82800)).toBe('23h ago');
  });

  it('returns days ago for timestamps 1–6 days old (#556)', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(formatTimestampRelative(now - 86400)).toBe('1d ago');
    expect(formatTimestampRelative(now - 518400)).toBe('6d ago');
  });

  it('falls back to absolute date for timestamps ≥ 7 days old (#556)', () => {
    // 1700000000 is more than 7 days ago from any plausible test run date
    const result = formatTimestampRelative(1700000000);
    expect(result).toBe('Nov 14, 2023, 10:13 PM');
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

  it('clamps negatives to 0 (issue #340)', () => {
    expect(formatDuration(-5)).toBe('0s');
    expect(formatDuration(-3600)).toBe('0s');
    expect(formatDuration(0)).toBe('0s');
  });

  it('returns a placeholder for non-finite input (issue #340)', () => {
    expect(formatDuration(Number.NaN)).toBe('—');
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatDuration(Number.NEGATIVE_INFINITY)).toBe('—');
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

describe('formatAmount (issue #557 — locale-aware formatting)', () => {
  it('formats using en-US style by default when locale is explicitly set', () => {
    // 10_000_000_000n / 1e7 = 1000.00
    expect(formatAmount(10_000_000_000n, { locale: 'en-US' })).toBe('1,000.00');
  });

  it('uses period as decimal separator and comma as grouping in en-US', () => {
    // 1_234_500_000n / 1e7 = 123.45
    expect(formatAmount(1_234_500_000n, { locale: 'en-US' })).toBe('123.45');
  });

  it('uses comma as decimal separator and period as grouping in de-DE', () => {
    // 10_000_000_000n / 1e7 = 1000.00 → "1.000,00" in de-DE
    expect(formatAmount(10_000_000_000n, { locale: 'de-DE' })).toBe('1.000,00');
  });

  it('formats decimal correctly in de-DE', () => {
    // 1_234_500_000n / 1e7 = 123.45 → "123,45" in de-DE
    expect(formatAmount(1_234_500_000n, { locale: 'de-DE' })).toBe('123,45');
  });

  it('formats with currency symbol for en-US USD', () => {
    const result = formatAmount(10_000_000_000n, { locale: 'en-US', currency: 'USD' });
    expect(result).toBe('$1,000.00');
  });

  it('formats with currency symbol for de-DE EUR', () => {
    const result = formatAmount(10_000_000_000n, { locale: 'de-DE', currency: 'EUR' });
    // de-DE renders "1.000,00 €" (non-breaking space before symbol)
    expect(result).toMatch(/1\.000,00/);
    expect(result).toMatch(/€/);
  });

  it('respects minimumFractionDigits and maximumFractionDigits overrides', () => {
    expect(
      formatAmount(10_000_000n, { locale: 'en-US', minimumFractionDigits: 0, maximumFractionDigits: 0 }),
    ).toBe('1');
  });

  it('handles zero stroops', () => {
    expect(formatAmount(0n, { locale: 'en-US' })).toBe('0.00');
  });

  it('handles negative stroops', () => {
    expect(formatAmount(-1_234_500_000n, { locale: 'en-US' })).toBe('-123.45');
  });

  it('respects a custom decimals value (e.g. 2-decimal token)', () => {
    // 1050n / 1e2 = 10.50
    expect(formatAmount(1050n, { locale: 'en-US', decimals: 2 })).toBe('10.50');
  });
});
