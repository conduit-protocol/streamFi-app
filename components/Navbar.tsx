'use client';

import Link                 from 'next/link';
import { usePathname }      from 'next/navigation';
import { ConnectButton }    from '@/components/ConnectButton';

const NAV = [
  { href: '/streams',      label: 'Streams'    },
  { href: '/transactions', label: 'History'    },
  { href: '/create',       label: 'Create'     },
  { href: '/dashboard',    label: 'Dashboard'  },
];

export function Navbar() {
  const path = usePathname();

  return (
    <header className="fixed top-0 inset-x-0 z-50 h-16 border-b border-gray-200 bg-white">
      <div className="max-w-5xl mx-auto px-4 h-full flex items-center gap-6">

        {/* Wordmark */}
        <Link href="/" className="font-black text-lg tracking-tight hover:opacity-70 transition-opacity">
          conduit
        </Link>

        {/* Nav links */}
        <nav className="hidden sm:flex items-center gap-1">
          {NAV.map(n => (
            <Link
              key={n.href}
              href={n.href}
              className={[
                'px-3 py-1.5 rounded text-sm font-medium transition-colors',
                path.startsWith(n.href)
                  ? 'bg-black text-white'
                  : 'text-gray-500 hover:text-black hover:bg-gray-100',
              ].join(' ')}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="ml-auto">
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
