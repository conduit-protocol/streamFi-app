import type { Metadata } from 'next';

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const title = `Stream #${id} — Conduit`;
  const description = `View payment stream #${id} on Conduit — progress, rate, and status.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: 'Conduit',
    },
  };
}

export default function StreamIdLayout({ children }: { children: React.ReactNode }) {
  return children;
}
