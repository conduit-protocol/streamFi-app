'use client';
import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/queryClient';
import { useState, type ReactNode } from 'react';

export function ReactQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => getQueryClient());

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
