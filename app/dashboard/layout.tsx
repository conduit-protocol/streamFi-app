import type { Metadata } from 'next';

export const metadata: Metadata = {
  title:       'Dashboard — Conduit',
  description: 'Aggregate flow rate and total disbursed across all your Conduit streams.',
  openGraph: {
    title:       'Dashboard — Conduit',
    description: 'Aggregate flow rate and total disbursed across all your Conduit streams.',
    siteName:    'Conduit',
    images: [{ url: '/og-image.svg', width: 1200, height: 630, alt: 'Dashboard — Conduit' }],
    type:        'website',
  },
  twitter: {
    card:        'summary_large_image',
    title:       'Dashboard — Conduit',
    description: 'Aggregate flow rate and total disbursed across all your Conduit streams.',
    images:      ['/og-image.svg'],
  },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
