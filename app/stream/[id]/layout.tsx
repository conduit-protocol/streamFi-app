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
      images: [{ url: '/og-image.svg', width: 1200, height: 630, alt: title }],
      type:    'website',
    },
    twitter: {
      card:        'summary_large_image',
      title,
      description,
      images:      ['/og-image.svg'],
    },
  };
}

export default function StreamIdLayout({ children }: { children: React.ReactNode }) {
  return children;
}
