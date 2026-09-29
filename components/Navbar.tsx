'use client';

import { useEffect, useRef, useState } from 'react';
import Link                 from 'next/link';
import { usePathname }      from 'next/navigation';
import { Menu, X }          from 'lucide-react';
import { ConnectButton }    from '@/components/ConnectButton';
import { ThemeToggle }      from '@/components/ThemeToggle';
import { ErrorBoundary }    from '@/components/ErrorBoundary';
import { NetworkBadge }     from '@/components/NetworkBadge';
import { useSelectedNetwork } from '@/hooks/useSelectedNetwork';

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
  const mobileMenuRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const network = useSelectedNetwork();

  // Close the mobile menu whenever the route changes (e.g. after a nav tap).
  useEffect(() => {
    setMenuOpen(false);
  }, [path]);

  // Move focus into the drawer, trap it there, and return it to the trigger
  // when closed. This makes the visual drawer usable without a mouse.
  useEffect(() => {
    if (!menuOpen) {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
      return;
    }

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusableSelector = 'a[href], button:not([disabled])';
    const focusable = () => Array.from(
      mobileMenuRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
    );
    requestAnimationFrame(() => focusable()[0]?.focus());

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const isActive = (href: string) => path.startsWith(href);

  const linkClass = (href: string) =>
    [
      'px-3 py-1.5 rounded text-sm font-medium transition-colors',
      isActive(href)
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

        {/* Active-network indicator — hidden on mainnet (#559) */}
        <NetworkBadge network={network} />

        {/* Desktop nav links */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV.map(n => (
            <Link key={n.href} href={n.href} className={linkClass(n.href)} aria-current={isActive(n.href) ? 'page' : undefined}>
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
            className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded text-gray-500 hover:text-black hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800 transition-colors"
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
            className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm cursor-default"
          />
          <nav
            id="mobile-nav"
            ref={mobileMenuRef}
            aria-label="Mobile navigation"
            aria-modal="true"
            role="dialog"
            className="md:hidden fixed inset-y-0 right-0 z-50 w-80 max-w-[85vw] border-l border-gray-200 bg-white pt-20 shadow-2xl transition-transform duration-300 ease-out dark:border-gray-800 dark:bg-gray-950"
          >
            <div className="px-4 py-2 flex flex-col gap-1">
              {NAV.map(n => (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => setMenuOpen(false)}
                  className={linkClass(n.href)}
                  aria-current={isActive(n.href) ? 'page' : undefined}
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
