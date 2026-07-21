'use client';

import { WalletProvider } from '@/contexts/WalletContext';
import { ReactQueryProvider } from '@/components/ReactQueryProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ReactQueryProvider>
      <WalletProvider>
        {children}
      </WalletProvider>
    </ReactQueryProvider>
  );
}
