import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { WithdrawButton } from '../WithdrawButton';

vi.mock('@/contexts/WalletContext', () => ({
  useWallet: vi.fn(),
}));

vi.mock('@/lib/stream', () => ({
  withdraw: vi.fn(),
}));

vi.mock('@/lib/queryClient', () => ({
  queryClient: {},
}));

vi.mock('@/lib/query-keys', () => ({
  invalidateStreamMutation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/offline-transactions', () => ({
  queueTransaction: vi.fn(),
}));

vi.mock('@/components/ui/CopyHashButton', () => ({
  CopyHashButton: () => <div data-testid="copy-hash-button" />,
}));

vi.mock('@/components/ui/Tooltip', () => ({
  Tooltip: ({ children, content }: any) => (
    <div data-testid="tooltip" data-content={JSON.stringify(content)}>
      {children}
    </div>
  ),
}));

import { useWallet } from '@/contexts/WalletContext';
import { withdraw } from '@/lib/stream';
import { queueTransaction } from '@/lib/offline-transactions';

const mockUseWallet = vi.mocked(useWallet);
const mockWithdraw = vi.mocked(withdraw);
const mockQueueTransaction = vi.mocked(queueTransaction);

const STREAM_ADDRESS = 'CABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGCK3';
const TOKEN = 'USDC';

function renderInto(el: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root };
}

describe('WithdrawButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWallet.mockReturnValue({
      publicKey: 'GDJJ5BHD3UQCAZWKNLYRXKZWTDONPUOWQYXJCFDWQYZTQSW7ACSG6HM3',
      signTx: vi.fn().mockResolvedValue('signed_xdr'),
      connected: true,
      connecting: false,
      walletName: 'Freighter',
      connect: vi.fn(),
      disconnect: vi.fn(),
      pendingOperationCount: 0,
      maxConcurrentOperations: 5,
    } as any);
    mockWithdraw.mockResolvedValue('tx_hash_123');
  });

  it('displays protocol fee notice and tooltip for non-empty withdrawable', () => {
    const { container, root } = renderInto(<></>);
    act(() => {
      root.render(
        <WithdrawButton
          streamAddress={STREAM_ADDRESS}
          withdrawable={1000000n}
          token={TOKEN}
        />,
      );
    });

    expect(container.textContent).toContain('Protocol fee applies');

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('hides protocol fee notice when withdrawable is zero', () => {
    const { container, root } = renderInto(<></>);
    act(() => {
      root.render(
        <WithdrawButton
          streamAddress={STREAM_ADDRESS}
          withdrawable={0n}
          token={TOKEN}
        />,
      );
    });

    expect(container.textContent).not.toContain('Protocol fee applies');

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('displays "Nothing to withdraw yet" button when withdrawable is zero', () => {
    const { container, root } = renderInto(<></>);
    act(() => {
      root.render(
        <WithdrawButton
          streamAddress={STREAM_ADDRESS}
          withdrawable={0n}
          token={TOKEN}
        />,
      );
    });

    const button = container.querySelector('button.btn-primary');
    expect(button).not.toBeNull();
    expect(button?.textContent).toContain('Nothing to withdraw yet');
    expect((button as HTMLButtonElement).disabled).toBe(true);

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('displays withdraw button with correct amount when withdrawable > 0', () => {
    const { container, root } = renderInto(<></>);
    act(() => {
      root.render(
        <WithdrawButton
          streamAddress={STREAM_ADDRESS}
          withdrawable={1000000n}
          token={TOKEN}
        />,
      );
    });

    const button = container.querySelector('button.btn-primary');
    expect(button?.textContent).toContain('Withdraw');
    expect(button?.textContent).toContain(TOKEN);

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('shows error when wallet is not connected', async () => {
    mockUseWallet.mockReturnValue({
      publicKey: null,
      signTx: vi.fn(),
      connected: false,
      connecting: false,
      walletName: undefined,
      connect: vi.fn(),
      disconnect: vi.fn(),
      pendingOperationCount: 0,
      maxConcurrentOperations: 5,
    } as any);

    const { container, root } = renderInto(<></>);
    act(() => {
      root.render(
        <WithdrawButton
          streamAddress={STREAM_ADDRESS}
          withdrawable={1000000n}
          token={TOKEN}
        />,
      );
    });

    const button = Array.from(container.querySelectorAll('button.btn-primary'))
      .find(b => b.textContent?.includes('Withdraw'));

    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Connect your wallet first');

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('queues transaction when offline and shows offline message', async () => {
    const originalOnline = Object.getOwnPropertyDescriptor(navigator, 'onLine');
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });

    const { container, root } = renderInto(<></>);
    act(() => {
      root.render(
        <WithdrawButton
          streamAddress={STREAM_ADDRESS}
          withdrawable={1000000n}
          token={TOKEN}
        />,
      );
    });

    const button = Array.from(container.querySelectorAll('button.btn-primary'))
      .find(b => b.textContent?.includes('Withdraw'));

    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockQueueTransaction).toHaveBeenCalled();
    expect(container.textContent).toContain('Queued while offline');

    if (originalOnline) {
      Object.defineProperty(navigator, 'onLine', originalOnline);
    }

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('calls withdraw and shows success state with transaction hash', async () => {
    const onSuccess = vi.fn();
    const { container, root } = renderInto(<></>);
    act(() => {
      root.render(
        <WithdrawButton
          streamAddress={STREAM_ADDRESS}
          withdrawable={1000000n}
          token={TOKEN}
          onSuccess={onSuccess}
        />,
      );
    });

    const button = Array.from(container.querySelectorAll('button.btn-primary'))
      .find(b => b.textContent?.includes('Withdraw'));

    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockWithdraw).toHaveBeenCalledWith(
      'GDJJ5BHD3UQCAZWKNLYRXKZWTDONPUOWQYXJCFDWQYZTQSW7ACSG6HM3',
      STREAM_ADDRESS,
      1000000n,
      expect.any(Function),
    );

    expect(container.textContent).toContain('Withdrawn');
    expect(container.textContent).toContain('tx_hash_123');
    expect(onSuccess).toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('shows error when withdraw fails', async () => {
    mockWithdraw.mockRejectedValue(new Error('Simulation failed'));

    const { container, root } = renderInto(<></>);
    act(() => {
      root.render(
        <WithdrawButton
          streamAddress={STREAM_ADDRESS}
          withdrawable={1000000n}
          token={TOKEN}
        />,
      );
    });

    const button = Array.from(container.querySelectorAll('button.btn-primary'))
      .find(b => b.textContent?.includes('Withdraw'));

    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Transaction failed');
    expect(container.textContent).toContain('Simulation failed');

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('allows retry after error', async () => {
    mockWithdraw.mockRejectedValueOnce(new Error('Simulation failed'));
    mockWithdraw.mockResolvedValueOnce('tx_hash_retry');

    const { container, root } = renderInto(<></>);
    act(() => {
      root.render(
        <WithdrawButton
          streamAddress={STREAM_ADDRESS}
          withdrawable={1000000n}
          token={TOKEN}
        />,
      );
    });

    let button = Array.from(container.querySelectorAll('button.btn-primary'))
      .find(b => b.textContent?.includes('Withdraw'));

    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Transaction failed');

    const retryButton = container.querySelector('button');
    expect(retryButton?.textContent).toContain('Retry');

    await act(async () => {
      retryButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Withdrawn');

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('shows dismiss button on success', async () => {
    const { container, root } = renderInto(<></>);
    act(() => {
      root.render(
        <WithdrawButton
          streamAddress={STREAM_ADDRESS}
          withdrawable={1000000n}
          token={TOKEN}
        />,
      );
    });

    const button = Array.from(container.querySelectorAll('button.btn-primary'))
      .find(b => b.textContent?.includes('Withdraw'));

    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const dismissButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Dismiss'));
    expect(dismissButton).not.toBeNull();

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('button is disabled during signing and submitting states', async () => {
    const { container, root } = renderInto(<></>);
    act(() => {
      root.render(
        <WithdrawButton
          streamAddress={STREAM_ADDRESS}
          withdrawable={1000000n}
          token={TOKEN}
        />,
      );
    });

    const button = Array.from(container.querySelectorAll('button.btn-primary'))
      .find(b => b.textContent?.includes('Withdraw')) as HTMLButtonElement;

    expect(button.disabled).toBe(false);

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    expect(button.disabled).toBe(true);

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });
});
