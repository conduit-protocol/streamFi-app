import type { Metadata } from 'next';

export const metadata: Metadata = {
  title:       'Profile — Conduit',
  description: 'Connected wallet address, network, and session details on Conduit.',
  openGraph: {
    title:       'Profile — Conduit',
    description: 'Connected wallet address, network, and session details on Conduit.',
    siteName:    'Conduit',
    images: [{ url: '/og-image.svg', width: 1200, height: 630, alt: 'Profile — Conduit' }],
    type:        'website',
  },
  twitter: {
    card:        'summary_large_image',
    title:       'Profile — Conduit',
    description: 'Connected wallet address, network, and session details on Conduit.',
    images:      ['/og-image.svg'],
  },
};

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
