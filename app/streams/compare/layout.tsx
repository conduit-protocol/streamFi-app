import type { Metadata } from 'next';

export const metadata: Metadata = {
  title:       'Compare Streams — Conduit',
  description: 'Compare the rate, progress, and remaining time of multiple payment streams side-by-side.',
  openGraph: {
    title:       'Compare Streams — Conduit',
    description: 'Compare the rate, progress, and remaining time of multiple payment streams side-by-side.',
    siteName:    'Conduit',
  },
};

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
