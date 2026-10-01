import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { StreamCard } from './StreamCard';

vi.mock('@/components/ui/Badge', () => ({
  Badge: () => <div data-testid="badge" />
}));

vi.mock('@/components/stream/StreamProgressBar', () => ({
  StreamProgressBar: () => <div data-testid="progress-bar" />
}));

vi.mock('@/components/ui/CopyAddress', () => ({
  CopyAddress: ({ address }: { address: string }) => <span data-testid="copy-address">{address}</span>
}));

vi.mock('@/lib/stream-notes-storage', () => ({
  getStreamNote: vi.fn((addr) => {
    if (addr === 'addr_with_note') return 'Test Note';
    return null;
  })
}));

describe('StreamCard', () => {
  const defaultProps = {
    id: 'stream-1',
    counterparty: 'G123',
    role: 'recipient' as const,
    token: 'USDC',
    ratePerSecond: 10000000n, // 1 USDC/s
    startTime: 1000,
    endTime: 2000,
    status: 'active' as const,
  };

  it('renders correctly with default props', () => {
    render(<StreamCard {...defaultProps} />);
    expect(screen.getByText('From')).toBeInTheDocument();
    expect(screen.getByText('1.00/s')).toBeInTheDocument();
    expect(screen.getByTestId('badge')).toBeInTheDocument();
    expect(screen.getByTestId('progress-bar')).toBeInTheDocument();
  });

  it('displays note if streamAddress has one', () => {
    render(<StreamCard {...defaultProps} streamAddress="addr_with_note" />);
    expect(screen.getByText('Test Note')).toBeInTheDocument();
  });

  it('handles paused state correctly', () => {
    render(<StreamCard {...defaultProps} status="paused" pausedAt={1500} />);
    expect(screen.getByTestId('badge')).toBeInTheDocument();
  });
});
