'use client';

import { useState, useRef, useEffect } from 'react';
import { Copy, Check } from 'lucide-react';
import { copyToClipboard } from '@/lib/clipboard';
import { truncateAddress } from '@/lib/format';

interface CopyAddressProps {
  /** The full address to copy */
  address: string;
  /** Optional extra class names */
  className?: string;
  /** Max width for the truncated display */
  maxWidth?: string;
}

/**
 * Displays a truncated address that copies the full value to clipboard
 * when clicked. Shows a transient check icon for 2 s after copying.
 *
 * Clicking the address stops event propagation so it can be used inside
 * clickable cards (e.g. StreamCard) without triggering navigation.
 */
export function CopyAddress({
  address,
  className = '',
  maxWidth = 'max-w-[110px] sm:max-w-[180px]',
}: CopyAddressProps) {
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

  async function handleClick(e: React.MouseEvent) {
    // Prevent navigating when inside a Link/card
    e.preventDefault();
    e.stopPropagation();

    const ok = await copyToClipboard(address);
    if (ok) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setCopied(true);
      timeoutRef.current = setTimeout(() => {
        if (mounted.current) setCopied(false);
        timeoutRef.current = null;
      }, 2000);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={copied ? 'Copied address' : 'Copy address'}
      title={copied ? 'Copied!' : address}
      className={[
        'inline-flex items-center gap-1',
        'font-mono text-xs',
        'text-black dark:text-white',
        'hover:text-green-600 dark:hover:text-green-400',
        'transition-colors duration-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white rounded',
        'cursor-pointer',
        maxWidth,
        className,
      ].join(' ')}
    >
      <span className="truncate">{truncateAddress(address)}</span>
      {copied
        ? <Check className="w-3 h-3 shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
        : <Copy  className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />}
    </button>
  );
}
