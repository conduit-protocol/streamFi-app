import type { Metadata } from 'next';

export const metadata: Metadata = {
  title:       'Create a Stream — Conduit',
  description: 'Create a new per-second token stream on Conduit — set token, recipient, rate, and duration.',
  openGraph: {
    title:       'Create a Stream — Conduit',
    description: 'Create a new per-second token stream on Conduit.',
    siteName:    'Conduit',
  },
};

export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
