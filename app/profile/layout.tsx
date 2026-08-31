import type { Metadata } from 'next';

export const metadata: Metadata = {
  title:       'Profile — Conduit',
  description: 'Connected wallet address, network, and session details on Conduit.',
  openGraph: {
    title:       'Profile — Conduit',
    description: 'Connected wallet address, network, and session details on Conduit.',
    siteName:    'Conduit',
  },
};

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
