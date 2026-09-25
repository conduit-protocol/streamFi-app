import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_LARGE_WITHDRAWAL_THRESHOLD,
  getLargeWithdrawalThreshold,
  isLargeWithdrawal,
} from './withdraw-config';

describe('getLargeWithdrawalThreshold', () => {
  const original = process.env.NEXT_PUBLIC_LARGE_WITHDRAWAL_THRESHOLD;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_LARGE_WITHDRAWAL_THRESHOLD;
    } else {
      process.env.NEXT_PUBLIC_LARGE_WITHDRAWAL_THRESHOLD = original;
    }
  });

  it('returns the default when unset', () => {
    delete process.env.NEXT_PUBLIC_LARGE_WITHDRAWAL_THRESHOLD;
    expect(getLargeWithdrawalThreshold()).toBe(DEFAULT_LARGE_WITHDRAWAL_THRESHOLD);
  });

  it('returns the configured value when set to a valid positive number', () => {
    process.env.NEXT_PUBLIC_LARGE_WITHDRAWAL_THRESHOLD = '250';
    expect(getLargeWithdrawalThreshold()).toBe(250);
  });

  it('falls back to the default when set to a non-numeric value', () => {
    process.env.NEXT_PUBLIC_LARGE_WITHDRAWAL_THRESHOLD = 'not-a-number';
    expect(getLargeWithdrawalThreshold()).toBe(DEFAULT_LARGE_WITHDRAWAL_THRESHOLD);
  });

  it('falls back to the default when set to zero or negative', () => {
    process.env.NEXT_PUBLIC_LARGE_WITHDRAWAL_THRESHOLD = '0';
    expect(getLargeWithdrawalThreshold()).toBe(DEFAULT_LARGE_WITHDRAWAL_THRESHOLD);
    process.env.NEXT_PUBLIC_LARGE_WITHDRAWAL_THRESHOLD = '-50';
    expect(getLargeWithdrawalThreshold()).toBe(DEFAULT_LARGE_WITHDRAWAL_THRESHOLD);
  });
});

describe('isLargeWithdrawal', () => {
  it('is false below the threshold', () => {
    expect(isLargeWithdrawal('999.99', 1000)).toBe(false);
  });

  it('is true at the threshold', () => {
    expect(isLargeWithdrawal('1000', 1000)).toBe(true);
  });

  it('is true above the threshold', () => {
    expect(isLargeWithdrawal('1500.25', 1000)).toBe(true);
  });

  it('is false for a non-numeric amount', () => {
    expect(isLargeWithdrawal('not-a-number', 1000)).toBe(false);
  });
});
