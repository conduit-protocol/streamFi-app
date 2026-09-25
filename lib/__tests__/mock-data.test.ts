/**
 * Tests for lib/mock-data.ts (#610).
 *
 * Verifies that mock data constants are well-formed: valid Stellar
 * addresses, consistent stream IDs, and structural integrity.
 */

import { describe, it, expect } from 'vitest';
import { StrKey } from '@stellar/stellar-sdk';
import {
  MOCK_STREAMS,
  MOCK_STREAM_IDS,
  MOCK_ADDRESSES,
  SENDER_STREAM_IDS,
  RECIPIENT_STREAM_IDS,
} from '../mock-data';

describe('MOCK_STREAM_IDS', () => {
  it('contains 5 stream IDs', () => {
    expect(MOCK_STREAM_IDS).toHaveLength(5);
  });

  it('contains only BigInt values', () => {
    for (const id of MOCK_STREAM_IDS) {
      expect(typeof id).toBe('bigint');
    }
  });

  it('IDs are sequential starting from 1', () => {
    expect(MOCK_STREAM_IDS).toEqual([1n, 2n, 3n, 4n, 5n]);
  });
});

describe('MOCK_STREAMS', () => {
  it('has an entry for each MOCK_STREAM_ID', () => {
    for (const id of MOCK_STREAM_IDS) {
      expect(MOCK_STREAMS[String(id)]).toBeDefined();
    }
  });

  it('each stream has valid sender and recipient addresses', () => {
    for (const stream of Object.values(MOCK_STREAMS)) {
      expect(() => StrKey.decodeAddress(stream.sender)).not.toThrow();
      expect(() => StrKey.decodeAddress(stream.recipient)).not.toThrow();
    }
  });

  it('each stream has a valid token contract address', () => {
    for (const stream of Object.values(MOCK_STREAMS)) {
      expect(() => StrKey.decodeContract(stream.token)).not.toThrow();
    }
  });

  it('each stream has ratePerSecond > 0', () => {
    for (const stream of Object.values(MOCK_STREAMS)) {
      expect(stream.ratePerSecond).toBeGreaterThan(0n);
    }
  });

  it('each stream has startTime before endTime (for non-cancelled)', () => {
    for (const stream of Object.values(MOCK_STREAMS)) {
      if (!stream.cancelled) {
        expect(stream.startTime).toBeLessThan(stream.endTime);
      }
    }
  });

  it('stream 1 is active (not paused, not cancelled)', () => {
    const s1 = MOCK_STREAMS['1']!;
    expect(s1.paused).toBe(false);
    expect(s1.cancelled).toBe(false);
  });

  it('stream 2 is paused', () => {
    const s2 = MOCK_STREAMS['2']!;
    expect(s2.paused).toBe(true);
    expect(s2.pausedAt).toBeGreaterThan(0);
  });

  it('stream 4 is cancelled', () => {
    const s4 = MOCK_STREAMS['4']!;
    expect(s4.cancelled).toBe(true);
  });

  it('stream 3 has ended (endTime in the past)', () => {
    const s3 = MOCK_STREAMS['3']!;
    const now = Math.floor(Date.now() / 1000);
    expect(s3.endTime).toBeLessThan(now);
  });
});

describe('MOCK_ADDRESSES', () => {
  it('has 5 entries', () => {
    expect(Object.keys(MOCK_ADDRESSES)).toHaveLength(5);
  });

  it('each value is a valid Stellar contract address', () => {
    for (const addr of Object.values(MOCK_ADDRESSES)) {
      expect(addr).toMatch(/^C[A-Z0-9]{55}$/);
      expect(() => StrKey.decodeContract(addr)).not.toThrow();
    }
  });
});

describe('SENDER_STREAM_IDS and RECIPIENT_STREAM_IDS', () => {
  it('sender streams are a subset of all stream IDs', () => {
    for (const id of SENDER_STREAM_IDS) {
      expect(MOCK_STREAM_IDS).toContain(id);
    }
  });

  it('recipient streams are a subset of all stream IDs', () => {
    for (const id of RECIPIENT_STREAM_IDS) {
      expect(MOCK_STREAM_IDS).toContain(id);
    }
  });

  it('sender and recipient stream IDs do not overlap', () => {
    const overlap = SENDER_STREAM_IDS.filter((id) =>
      RECIPIENT_STREAM_IDS.includes(id),
    );
    expect(overlap).toHaveLength(0);
  });

  it('together they cover all stream IDs', () => {
    const all = [...SENDER_STREAM_IDS, ...RECIPIENT_STREAM_IDS].sort();
    const expected = [...MOCK_STREAM_IDS].sort();
    expect(all).toEqual(expected);
  });
});
