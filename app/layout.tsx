import type { Metadata } from 'next';
import { Providers } from '@/components/Providers';
import { Navbar }    from '@/components/Navbar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { CircuitBreakerOverlay } from '@/components/CircuitBreakerOverlay';
import './globals.css';

export const metadata: Metadata = {
  title:       'Conduit — Streaming Payments on Stellar',
  description: 'Create and manage per-second token streams on the Stellar network.',
  openGraph: {
    title:       'Conduit',
    description: 'Streaming payments on Stellar.',
    siteName:    'Conduit',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-white dark:bg-gray-950 text-black dark:text-white antialiased">
        <Providers>
          <Navbar />
          <main className="pt-16 min-h-screen">
            {/* A render crash in one route (e.g. a component reading an
                undefined value in a state hook) should not take down the
                entire app shell — contain it and offer a retry instead. */}
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </main>
          {process.env.NODE_ENV === 'development' && <CircuitBreakerOverlay />}
          <footer className="border-t border-gray-200 dark:border-gray-800 py-8 mt-16">
            <div className="max-w-5xl mx-auto px-4 flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
              <span>Conduit Protocol — MIT License</span>
              <span>Not audited. Testnet only.</span>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
