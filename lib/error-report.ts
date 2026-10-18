/**
 * Error categorisation and copyable error reports for the root error
 * boundary (#758).
 */

export type ErrorCategory = 'network' | 'wallet' | 'contract' | 'unknown';

const PATTERNS: Array<[ErrorCategory, RegExp]> = [
  ['wallet', /wallet|freighter|sign(ing|ature)?|user (declined|rejected)|not connected/i],
  ['network', /network|fetch|timeout|timed out|rpc|econn|offline|503|502|504/i],
  ['contract', /contract|simulat|revert|host ?error|invoke|insufficient|trustline/i],
];

export const ERROR_SUGGESTIONS: Record<ErrorCategory, string[]> = {
  network: [
    'Check your internet connection.',
    'The Soroban RPC may be unavailable — try again in a minute or switch network in Settings.',
  ],
  wallet: [
    'Make sure your wallet extension is unlocked and connected.',
    'Confirm the wallet is on the same network as the app, or reconnect a different wallet.',
  ],
  contract: [
    'Make sure you have enough XLM for fees and the required token balance.',
    'Check that the recipient account and token trustline exist.',
  ],
  unknown: [
    'Try again, or reload the page.',
    'If the problem persists, copy the error report and share it with support.',
  ],
};

export function categorizeError(error: Pick<Error, 'message' | 'name'>): ErrorCategory {
  const text = `${error.name ?? ''} ${error.message ?? ''}`;
  for (const [category, pattern] of PATTERNS) {
    if (pattern.test(text)) return category;
  }
  return 'unknown';
}

export function buildErrorReport(
  error: Error & { digest?: string },
  context: { url?: string; userAgent?: string; timestamp?: string } = {},
): string {
  const lines = [
    'StreamFi error report',
    `Time: ${context.timestamp ?? new Date().toISOString()}`,
    `Category: ${categorizeError(error)}`,
    `Name: ${error.name}`,
    `Message: ${error.message}`,
  ];
  if (error.digest) lines.push(`Digest: ${error.digest}`);
  if (context.url) lines.push(`URL: ${context.url}`);
  if (context.userAgent) lines.push(`User agent: ${context.userAgent}`);
  if (error.stack) lines.push('', 'Stack trace:', error.stack);
  return lines.join('\n');
}
