import { describe, expect, it } from 'vitest';
import {
  buildErrorReport,
  buildGitHubIssueBody,
  buildGitHubIssueUrl,
  categorizeError,
  ERROR_SUGGESTIONS,
  GITHUB_REPO_ISSUES_URL,
} from './error-report';

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

describe('buildGitHubIssueUrl (#814)', () => {
  it('pre-fills issue template with browser version, error message, and stack trace', () => {
    const err = new Error('Simulation failed on contract');
    err.stack = 'Error: Simulation failed on contract\n    at SorobanRpc.sendTransaction (soroban.ts:42:10)';

    const urlString = buildGitHubIssueUrl(err, {
      url: 'http://localhost/create',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    });

    expect(urlString.startsWith(GITHUB_REPO_ISSUES_URL)).toBe(true);
    const url = new URL(urlString);
    expect(url.searchParams.get('title')).toBe('[Bug]: Simulation failed on contract');

    const body = url.searchParams.get('body')!;
    expect(body).toContain('## Page / Component');
    expect(body).toContain('http://localhost/create');
    expect(body).toContain('## Description');
    expect(body).toContain('Simulation failed on contract');
    expect(body).toContain('## Environment');
    expect(body).toContain('- Browser + version: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    expect(body).toContain('## Console errors');
    expect(body).toContain('at SorobanRpc.sendTransaction (soroban.ts:42:10)');
  });

  it('handles errors without stack traces gracefully', () => {
    const err = new Error('Plain error without stack');
    delete err.stack;

    const body = buildGitHubIssueBody(err);
    expect(body).toContain('Plain error without stack');
    expect(body).toContain('## Console errors');
  });
});
