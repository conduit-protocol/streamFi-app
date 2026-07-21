'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyHashButtonProps {
  /** The full transaction hash to copy to clipboard */
  hash: string;
  /** Optional extra class names for the wrapper element */
  className?: string;
}

/**
 * A small icon button that copies a transaction hash to the clipboard.
 * Shows a check icon for 2 s after a successful copy, then resets.
 * Falls back gracefully when the Clipboard API is unavailable.
 */
export function CopyHashButton({ hash, className = '' }: CopyHashButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — silently no-op.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Copied!' : 'Copy transaction hash'}
      title={copied ? 'Copied!' : 'Copy transaction hash'}
      className={[
        'inline-flex items-center justify-center',
        'w-6 h-6 rounded',
        'text-gray-400 hover:text-black hover:bg-gray-100',
        'transition-colors duration-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black',
        className,
      ].join(' ')}
    >
      {copied
        ? <Check  className="w-3.5 h-3.5" aria-hidden="true" />
        : <Copy   className="w-3.5 h-3.5" aria-hidden="true" />}
    </button>
  );
}
