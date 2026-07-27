import { describe, it, expect } from 'vitest';
import { safeToStroops } from './safe-operations.js';

describe('safeToStroops', () => {
  it('parses a standard whole number', () => {
    expect(safeToStroops('5', 7)).toBe(50_000_000n);
  });

  it('parses a standard fractional number', () => {
    expect(safeToStroops('5.123', 7)).toBe(51_230_000n);
  });

  it('parses scientific notation with positive effective decimals', () => {
    // decimals(7) - exp(2) = 5
    expect(safeToStroops('5e2', 7)).toBe(500_000n);
    expect(safeToStroops('5.123e2', 7)).toBe(512_300n);
  });

  it('parses scientific notation with negative effective decimals correctly (large exponents)', () => {
    // decimals(7) - exp(10) = -3
    expect(safeToStroops('5e10', 7)).toBe(50_000_000_000n);
    
    // decimals(7) - exp(8) = -1 (small negative effective decimals edge case)
    expect(safeToStroops('5e8', 7)).toBe(500_000_000n);
    
    // fractional base
    expect(safeToStroops('5.123e10', 7)).toBe(51_230_000_000n);
  });

  it('safely handles an absurdly large exponent without crashing, returning null', () => {
    // exp(150) -> effective decimals -143 (power = 143 > 100)
    expect(safeToStroops('5e150', 7)).toBeNull();
  });

  it('returns null for invalid inputs', () => {
    expect(safeToStroops('abc', 7)).toBeNull();
    expect(safeToStroops('', 7)).toBeNull();
  });
});
