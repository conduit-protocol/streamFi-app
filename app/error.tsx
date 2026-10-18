'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { buildErrorReport, categorizeError, ERROR_SUGGESTIONS } from '@/lib/error-report';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorPageProps) {
  const [copied, setCopied] = useState(false);
  const suggestions = ERROR_SUGGESTIONS[categorizeError(error)];

  useEffect(() => {
    // Surface to whatever error-tracking is wired up (no-op if not configured).
    console.error(error);
  }, [error]);

  async function copyReport() {
    const report = buildErrorReport(error, {
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    });
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-24 flex flex-col items-center text-center gap-6">
      <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">
        Error
      </p>
      <h1 className="text-4xl font-black tracking-tight text-black dark:text-white">
        Something went wrong
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
        An unexpected error occurred while rendering this page. You can try
        again, or head back to the dashboard.
      </p>
      <ul className="text-sm text-left text-gray-600 dark:text-gray-300 max-w-sm list-disc pl-5 space-y-1">
        {suggestions.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      {error.digest && (
        <p className="font-mono text-xs text-gray-400 dark:text-gray-600">
          ref: {error.digest}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button onClick={reset} className="btn-secondary text-sm">
          Try again
        </button>
        <button onClick={copyReport} className="btn-secondary text-sm">
          {copied ? 'Copied!' : 'Copy Error Report'}
        </button>
        <Link href="/dashboard" className="btn-primary text-sm">
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
