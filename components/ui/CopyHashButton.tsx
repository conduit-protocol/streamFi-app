'use client';

import { useState, useRef, useEffect } from 'react';
import { Copy, Check } from 'lucide-react';
import { copyToClipboard } from '@/lib/clipboard';

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
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Clear timeout on unmount to prevent state update on unmounted component
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  async function handleCopy() {
    // copyToClipboard falls back to execCommand when navigator.clipboard is
    // unavailable (e.g. served over plain HTTP), so this works locally too.
    const ok = await copyToClipboard(hash);
    if (ok) {
      // Clear any existing timeout to prevent stacking
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      setCopied(true);
      timeoutRef.current = setTimeout(() => {
        if (mounted.current) {
          setCopied(false);
        }
        timeoutRef.current = null;
      }, 2000);
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
        'text-gray-400 hover:text-black hover:bg-gray-100 dark:hover:text-white dark:hover:bg-gray-800',
        'transition-colors duration-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white',
        className,
      ].join(' ')}
    >
      {copied
        ? <Check  className="w-3.5 h-3.5" aria-hidden="true" />
        : <Copy   className="w-3.5 h-3.5" aria-hidden="true" />}
    </button>
  );
}
