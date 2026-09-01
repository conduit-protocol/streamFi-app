import type { Metadata } from 'next';

export const metadata: Metadata = {
  title:       'Dashboard — Conduit',
  description: 'Aggregate flow rate and total disbursed across all your Conduit streams.',
  openGraph: {
    title:       'Dashboard — Conduit',
    description: 'Aggregate flow rate and total disbursed across all your Conduit streams.',
    siteName:    'Conduit',
  },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
