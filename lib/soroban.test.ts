import { describe, it, expect } from 'vitest';
import { xdr } from '@stellar/stellar-sdk';
import { scValToI128, scValToU64 } from './soroban.js';

function i128(n: bigint): xdr.ScVal {
  const lo = n & 0xffffffffffffffffn;
  const hi = n >> 64n;
  return xdr.ScVal.scvI128(
    new xdr.Int128Parts({ hi: xdr.Int64.fromString(hi.toString()), lo: xdr.Uint64.fromString(lo.toString()) }),
  );
}

describe('scValToI128', () => {
  it('decodes a small positive value', () => {
    expect(scValToI128(i128(1_000n))).toBe(1_000n);
  });

  it('decodes zero', () => {
    expect(scValToI128(i128(0n))).toBe(0n);
  });

  it('decodes a value spanning the 64-bit boundary', () => {
    const big = (1n << 70n) + 12345n;
    expect(scValToI128(i128(big))).toBe(big);
  });

  it('decodes the max i128 value', () => {
    const max = (1n << 127n) - 1n;
    expect(scValToI128(i128(max))).toBe(max);
  });

  it('decodes a negative value', () => {
    expect(scValToI128(i128(-500n))).toBe(-500n);
  });
});

describe('scValToU64', () => {
  it('decodes zero', () => {
    expect(scValToU64(xdr.ScVal.scvU64(xdr.Uint64.fromString('0')))).toBe(0n);
  });

  it('decodes a typical timestamp value', () => {
    expect(scValToU64(xdr.ScVal.scvU64(xdr.Uint64.fromString('1700000000')))).toBe(1_700_000_000n);
  });

  it('decodes the max u64 value', () => {
    const max = (1n << 64n) - 1n;
    expect(scValToU64(xdr.ScVal.scvU64(xdr.Uint64.fromString(max.toString())))).toBe(max);
  });
});
