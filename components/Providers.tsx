'use client';

import { ThemeProvider } from 'next-themes';
import { WalletProvider } from '@/contexts/WalletContext';
import { ReactQueryProvider } from '@/components/ReactQueryProvider';
import { Toaster } from 'react-hot-toast';
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';
import { OfflineIndicator } from '@/components/OfflineIndicator';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ReactQueryProvider>
        <WalletProvider>
          <ServiceWorkerRegistrar />
          {children}
          <Toaster position="bottom-right" />
          <OfflineIndicator />
        </WalletProvider>
      </ReactQueryProvider>
    </ThemeProvider>
  );
}
