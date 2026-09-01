import type { Metadata } from 'next';

export const metadata: Metadata = {
  title:       'Transactions — Conduit',
  description: 'Indexed on-chain transaction history for your connected wallet on Conduit.',
  openGraph: {
    title:       'Transactions — Conduit',
    description: 'Indexed on-chain transaction history for your connected wallet on Conduit.',
    siteName:    'Conduit',
  },
};

export default function TransactionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
