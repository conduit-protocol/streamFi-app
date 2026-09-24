import type { Metadata } from 'next';

// `app/streams/page.tsx` is a client component ('use client'), and Next.js
// only allows a `metadata` export from a Server Component — hence this
// sibling layout.tsx rather than adding it to page.tsx directly. Same
// pattern needed for /create, /dashboard, /transactions, /profile (each
// wants its own layout.tsx); /stream/[id] is dynamic and needs
// `generateMetadata` instead of a static `metadata` object. See #477.
export const metadata: Metadata = {
  title:       'Your Streams — Conduit',
  description: 'View and manage your active, ended, and created payment streams on Conduit.',
  openGraph: {
    title:       'Your Streams — Conduit',
    description: 'View and manage your active, ended, and created payment streams on Conduit.',
    siteName:    'Conduit',
    images: [{ url: '/og-image.svg', width: 1200, height: 630, alt: 'Your Streams — Conduit' }],
    type:        'website',
  },
  twitter: {
    card:        'summary_large_image',
    title:       'Your Streams — Conduit',
    description: 'View and manage your active, ended, and created payment streams on Conduit.',
    images:      ['/og-image.svg'],
  },
};

export default function StreamsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
