import { describe, it, expect } from 'vitest';
import {
  fromStroops,
  toStroops,
  formatDuration,
  truncateAddress,
} from './format.js';

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
