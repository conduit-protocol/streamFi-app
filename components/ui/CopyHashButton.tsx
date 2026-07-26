'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyHashButtonProps {
  /** The text value to copy to the clipboard */
  value: string;
  /** Optional accessible label (defaults to "Copy to clipboard") */
  label?: string;
  /** Optional extra className applied to the button */
  className?: string;
}

/**
 * A small icon button that copies `value` to the clipboard and briefly
 * shows a check-mark confirmation. All copy state is managed internally —
 * callers do not need to track copied/setCopied themselves.
 */
export function CopyHashButton({ value, label = 'Copy to clipboard', className = '' }: CopyHashButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard access denied — fail silently */
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Copied!' : label}
      title={copied ? 'Copied!' : label}
      className={`inline-flex items-center justify-center rounded p-1 text-gray-400 hover:text-black hover:bg-gray-100 transition-colors ${className}`}
    >
      {copied ? (
        <Check className="w-3.5 h-3.5" aria-hidden="true" />
      ) : (
        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
      )}
    </button>
  );
}
