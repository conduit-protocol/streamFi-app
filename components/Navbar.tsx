'use client';

import { useEffect, useState } from 'react';
import Link                 from 'next/link';
import { usePathname }      from 'next/navigation';
import { Menu, X }          from 'lucide-react';
import { ConnectButton }    from '@/components/ConnectButton';
import { ThemeToggle }      from '@/components/ThemeToggle';
import { ErrorBoundary }    from '@/components/ErrorBoundary';

const NAV = [
  { href: '/streams',      label: 'Streams'    },
  { href: '/transactions', label: 'History'    },
  { href: '/create',       label: 'Create'     },
  { href: '/dashboard',    label: 'Dashboard'  },
  { href: '/profile',      label: 'Profile'    },
];

export function Navbar() {
  const path = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu whenever the route changes (e.g. after a nav tap).
  useEffect(() => {
    setMenuOpen(false);
  }, [path]);

  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const linkClass = (href: string) =>
    [
      'px-3 py-1.5 rounded text-sm font-medium transition-colors',
      path.startsWith(href)
        ? 'bg-black text-white dark:bg-white dark:text-black'
        : 'text-gray-500 hover:text-black hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800',
    ].join(' ');

  return (
    <header className="fixed top-0 inset-x-0 z-50 h-16 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
      <div className="max-w-5xl mx-auto px-4 h-full flex items-center gap-6">

        {/* Wordmark */}
        <Link href="/" className="font-black text-lg tracking-tight hover:opacity-70 transition-opacity">
          conduit
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden sm:flex items-center gap-1">
          {NAV.map(n => (
            <Link key={n.href} href={n.href} className={linkClass(n.href)}>
              {n.label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2">
          {/* Isolate wallet/network-adjacent widgets: a crash here (e.g. an
              undefined value in a widget's state hook) shouldn't blank the
              whole header, just fall back to a compact retry (fixes #191). */}
          <ErrorBoundary
            fallback={(_error, retry) => (
              <button
                type="button"
                onClick={retry}
                className="text-xs text-gray-400 hover:text-black dark:hover:text-white underline"
              >
                Reload wallet controls
              </button>
            )}
          >
            <ThemeToggle />
            <ConnectButton />
          </ErrorBoundary>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            className="sm:hidden inline-flex items-center justify-center w-9 h-9 rounded text-gray-500 hover:text-black hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800 transition-colors"
          >
            {menuOpen
              ? <X    className="w-5 h-5" aria-hidden="true" />
              : <Menu className="w-5 h-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* Mobile menu + backdrop.
          The backdrop is a real, full-screen element rather than a
          document-level click listener: iOS Safari does not fire `click` on
          `document` for taps on non-interactive areas, so a listener-based
          outside-click would never close the menu there (issue #143). Tapping
          this element reliably closes the dropdown on every browser. */}
      {menuOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={() => setMenuOpen(false)}
            className="sm:hidden fixed inset-0 top-16 z-40 bg-black/20 cursor-default"
          />
          <nav
            id="mobile-nav"
            className="sm:hidden absolute top-16 inset-x-0 z-50 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-lg"
          >
            <div className="max-w-5xl mx-auto px-4 py-2 flex flex-col gap-1">
              {NAV.map(n => (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => setMenuOpen(false)}
                  className={linkClass(n.href)}
                >
                  {n.label}
                </Link>
              ))}
            </div>
          </nav>
        </>
      )}
    </header>
  );
}
