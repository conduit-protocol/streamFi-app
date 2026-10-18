import { describe, expect, it } from 'vitest';
import { buildErrorReport, categorizeError, ERROR_SUGGESTIONS } from './error-report';

describe('categorizeError (#758)', () => {
  it.each([
    ['Failed to fetch', 'network'],
    ['RPC request timed out', 'network'],
    ['Freighter is not connected', 'wallet'],
    ['User declined access', 'wallet'],
    ['Contract simulation failed: HostError', 'contract'],
    ['Cannot read properties of undefined', 'unknown'],
  ])('%s → %s', (message, expected) => {
    expect(categorizeError(new Error(message))).toBe(expected);
  });

  it('has suggestions for every category', () => {
    for (const list of Object.values(ERROR_SUGGESTIONS)) expect(list.length).toBeGreaterThan(0);
  });
});

describe('buildErrorReport (#758)', () => {
  it('includes message, digest, context and stack trace', () => {
    const err = Object.assign(new Error('Failed to fetch'), { digest: 'abc123' });
    const report = buildErrorReport(err, {
      url: 'http://localhost/dashboard',
      userAgent: 'test-agent',
      timestamp: '2026-10-18T00:00:00.000Z',
    });
    expect(report).toContain('Message: Failed to fetch');
    expect(report).toContain('Category: network');
    expect(report).toContain('Digest: abc123');
    expect(report).toContain('URL: http://localhost/dashboard');
    expect(report).toContain('Time: 2026-10-18T00:00:00.000Z');
    expect(report).toContain('Stack trace:');
  });
});
