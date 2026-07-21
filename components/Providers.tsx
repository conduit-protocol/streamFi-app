'use client';

import { WalletProvider } from '@/contexts/WalletContext';
import { ReactQueryProvider } from '@/components/ReactQueryProvider';
import { Toaster } from 'react-hot-toast';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ReactQueryProvider>
      <WalletProvider>
        {children}
        <Toaster position="bottom-right" />
      </WalletProvider>
    </ReactQueryProvider>
  );
}
