'use client';

import { ThemeProvider } from 'next-themes';
import { WalletProvider } from '@/contexts/WalletContext';
import { ReactQueryProvider } from '@/components/ReactQueryProvider';
import { Toaster } from 'react-hot-toast';
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { NetworkTroubleBanner } from '@/components/NetworkTroubleBanner';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ReactQueryProvider>
        <WalletProvider>
          <ServiceWorkerRegistrar />
          <NetworkTroubleBanner />
          {children}
          <Toaster position="bottom-right" />
          <OfflineIndicator />
        </WalletProvider>
      </ReactQueryProvider>
    </ThemeProvider>
  );
}
