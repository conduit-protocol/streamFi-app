'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';

interface StreamQuickSearchProps {
  className?: string;
  onNavigate?: () => void;
  placeholder?: string;
  compact?: boolean;
}

/**
 * StreamQuickSearch Component (Issue #790).
 *
 * Provides a global search input in the top navigation bar to quickly lookup
 * and navigate directly to any stream by its ID or contract address.
 *
 * Features:
 * - Direct redirection to `/stream/[id]` upon submission.
 * - Global shortcut key (`/`) to quickly focus the search bar from anywhere.
 * - Clear button (`X`) when query is present.
 * - Full keyboard accessibility (Escape to clear & blur, Enter to submit).
 * - Safe input trimming and URL encoding to avoid injection or malformed routes.
 */
export function StreamQuickSearch({
  className = '',
  onNavigate,
  placeholder = 'Search stream ID or address...',
  compact = true,
}: StreamQuickSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Global '/' keyboard shortcut to focus search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement !== inputRef.current &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes((document.activeElement as HTMLElement)?.tagName) &&
        !(document.activeElement as HTMLElement)?.isContentEditable
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        setQuery('');
        inputRef.current?.blur();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const clean = query.trim();
    if (!clean) return;

    // Navigate to the target stream detail view
    router.push(`/stream/${encodeURIComponent(clean)}`);
    setQuery('');
    inputRef.current?.blur();
    onNavigate?.();
  };

  const handleClear = () => {
    setQuery('');
    inputRef.current?.focus();
  };

  return (
    <form
      role="search"
      data-testid="stream-quick-search-form"
      onSubmit={handleSubmit}
      className={`relative flex items-center ${className}`}
    >
      <label htmlFor="navbar-stream-search" className="sr-only">
        Search streams
      </label>
      <div className="relative w-full flex items-center">
        <Search
          className="absolute left-2.5 w-3.5 h-3.5 text-gray-400 dark:text-gray-500 pointer-events-none"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          id="navbar-stream-search"
          data-testid="stream-quick-search-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className={`w-full pl-8 pr-8 py-1 text-xs rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white transition-all ${
            compact ? 'max-w-[180px] lg:max-w-[220px]' : 'w-full'
          }`}
          autoComplete="off"
          spellCheck="false"
        />
        {query ? (
          <button
            type="button"
            data-testid="stream-quick-search-clear"
            onClick={handleClear}
            aria-label="Clear search"
            className="absolute right-2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded"
          >
            <X className="w-3 h-3" aria-hidden="true" />
          </button>
        ) : (
          <kbd
            aria-hidden="true"
            className="absolute right-2 hidden lg:inline-block px-1.5 py-0.5 text-[9px] font-mono text-gray-400 dark:text-gray-500 bg-gray-200 dark:bg-gray-800 rounded pointer-events-none"
          >
            /
          </kbd>
        )}
      </div>
    </form>
  );
}
