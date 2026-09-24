import type { Metadata } from 'next';

export const metadata: Metadata = {
  title:       'Transactions — Conduit',
  description: 'Indexed on-chain transaction history for your connected wallet on Conduit.',
  openGraph: {
    title:       'Transactions — Conduit',
    description: 'Indexed on-chain transaction history for your connected wallet on Conduit.',
    siteName:    'Conduit',
    images: [{ url: '/og-image.svg', width: 1200, height: 630, alt: 'Transactions — Conduit' }],
    type:        'website',
  },
  twitter: {
    card:        'summary_large_image',
    title:       'Transactions — Conduit',
    description: 'Indexed on-chain transaction history for your connected wallet on Conduit.',
    images:      ['/og-image.svg'],
  },
};

export default function TransactionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
