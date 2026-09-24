'use client';

import { useState, useRef, useEffect } from 'react';
import { Copy, Check } from 'lucide-react';
import { copyToClipboard } from '@/lib/clipboard';
import { truncateAddress } from '@/lib/format';

interface CopyableAddressProps {
  /** The full address to copy to clipboard */
  address: string;
  /** Number of characters to show on each side (default: 4) */
  chars?: number;
  /** Optional extra class names for the wrapper element */
  className?: string;
}

/**
 * Displays a truncated Stellar address that copies the full address to the
 * clipboard on click. Shows a check icon for 2 s after a successful copy,
 * then resets. Falls back gracefully when the Clipboard API is unavailable.
 */
export function CopyableAddress({ address, chars = 4, className = '' }: CopyableAddressProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  async function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const ok = await copyToClipboard(address);
    if (ok) {
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
      aria-label={copied ? 'Copied!' : `Copy address ${truncateAddress(address, chars)}`}
      title={copied ? 'Copied!' : 'Click to copy full address'}
      className={[
        'inline-flex items-center gap-1.5 font-mono text-xs',
        'text-black dark:text-white',
        'hover:bg-gray-100 dark:hover:bg-gray-800 rounded px-1 py-0.5',
        'transition-colors duration-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white',
        className,
      ].join(' ')}
    >
      <span className="truncate">{truncateAddress(address, chars)}</span>
      {copied ? (
        <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400 shrink-0" aria-hidden="true" />
      ) : (
        <Copy className="w-3.5 h-3.5 text-gray-400 shrink-0" aria-hidden="true" />
      )}
    </button>
  );
}
