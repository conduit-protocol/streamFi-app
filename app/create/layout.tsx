import type { Metadata } from 'next';

export const metadata: Metadata = {
  title:       'Create a Stream — Conduit',
  description: 'Create a new per-second token stream on Conduit — set token, recipient, rate, and duration.',
  openGraph: {
    title:       'Create a Stream — Conduit',
    description: 'Create a new per-second token stream on Conduit.',
    siteName:    'Conduit',
    images: [{ url: '/og-image.svg', width: 1200, height: 630, alt: 'Create a Stream — Conduit' }],
    type:        'website',
  },
  twitter: {
    card:        'summary_large_image',
    title:       'Create a Stream — Conduit',
    description: 'Create a new per-second token stream on Conduit.',
    images:      ['/og-image.svg'],
  },
};

export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
