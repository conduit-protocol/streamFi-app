/**
 * WithdrawButton — large-withdrawal confirmation (#560)
 *
 * Coverage:
 *   - Below-threshold amounts withdraw immediately, no confirmation modal.
 *   - At/above-threshold amounts open a confirmation modal that blocks
 *     `withdraw()` until the user retypes the exact amount.
 */

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
  Tooltip: ({ children }: any) => <div data-testid="tooltip">{children}</div>,
}));

import { useWallet } from '@/contexts/WalletContext';
import { withdraw } from '@/lib/stream';

const mockUseWallet = vi.mocked(useWallet);
const mockWithdraw = vi.mocked(withdraw);

const STREAM_ADDRESS = 'CABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGCK3';
const TOKEN = 'USDC';

// Default threshold is 1000 (display units). 7 decimals for stroops.
const SMALL_AMOUNT_STROOPS = 500_0000000n; // 500 * 10^7 -> below 1000 threshold
const LARGE_AMOUNT_STROOPS = 1500_0000000n; // 1500 * 10^7 -> above 1000 threshold

function renderInto(el: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(el);
  });
  return { container, root };
}

function cleanup(container: HTMLDivElement, root: ReturnType<typeof createRoot>) {
  act(() => root.unmount());
  document.body.removeChild(container);
}

/** jsdom doesn't fire React's synthetic onChange for direct `.value`
 *  assignment — use the native property setter + an input event. */
function fireChange(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function findWithdrawButton(container: HTMLDivElement) {
  return Array.from(container.querySelectorAll('button.btn-primary')).find(b =>
    b.textContent?.includes('Withdraw'),
  ) as HTMLButtonElement;
}

describe('WithdrawButton — large-withdrawal confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_LARGE_WITHDRAWAL_THRESHOLD;
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

  it('withdraws immediately for an amount below the threshold — no modal', async () => {
    const { container, root } = renderInto(
      <WithdrawButton streamAddress={STREAM_ADDRESS} withdrawable={SMALL_AMOUNT_STROOPS} token={TOKEN} />,
    );

    const button = findWithdrawButton(container);
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(mockWithdraw).toHaveBeenCalledWith(
      expect.any(String),
      STREAM_ADDRESS,
      SMALL_AMOUNT_STROOPS,
      expect.any(Function),
    );

    cleanup(container, root);
  });

  it('opens a confirmation modal for an amount at/above the threshold, without withdrawing yet', async () => {
    const { container, root } = renderInto(
      <WithdrawButton streamAddress={STREAM_ADDRESS} withdrawable={LARGE_AMOUNT_STROOPS} token={TOKEN} />,
    );

    const button = findWithdrawButton(container);
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
    expect(container.textContent).toContain('Confirm large withdrawal');
    expect(mockWithdraw).not.toHaveBeenCalled();

    cleanup(container, root);
  });

  it('blocks confirmation until the retyped amount matches exactly', async () => {
    const { container, root } = renderInto(
      <WithdrawButton streamAddress={STREAM_ADDRESS} withdrawable={LARGE_AMOUNT_STROOPS} token={TOKEN} />,
    );

    const button = findWithdrawButton(container);
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    const confirmButton = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent === 'Confirm withdrawal',
    ) as HTMLButtonElement;

    act(() => {
      fireChange(input, 'not the right amount');
    });
    act(() => {
      confirmButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockWithdraw).not.toHaveBeenCalled();
    expect(container.textContent).toContain("doesn't match");

    cleanup(container, root);
  });

  it('proceeds with withdrawal once the exact amount is retyped', async () => {
    const { container, root } = renderInto(
      <WithdrawButton streamAddress={STREAM_ADDRESS} withdrawable={LARGE_AMOUNT_STROOPS} token={TOKEN} />,
    );

    const button = findWithdrawButton(container);
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    const confirmButton = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent === 'Confirm withdrawal',
    ) as HTMLButtonElement;

    act(() => {
      fireChange(input, '1500.00');
    });

    await act(async () => {
      confirmButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(mockWithdraw).toHaveBeenCalledWith(
      expect.any(String),
      STREAM_ADDRESS,
      LARGE_AMOUNT_STROOPS,
      expect.any(Function),
    );

    cleanup(container, root);
  });

  it('cancel closes the modal without withdrawing', () => {
    const { container, root } = renderInto(
      <WithdrawButton streamAddress={STREAM_ADDRESS} withdrawable={LARGE_AMOUNT_STROOPS} token={TOKEN} />,
    );

    const button = findWithdrawButton(container);
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const cancelButton = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent === 'Cancel',
    ) as HTMLButtonElement;
    act(() => {
      cancelButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(mockWithdraw).not.toHaveBeenCalled();

    cleanup(container, root);
  });

  it('respects a custom NEXT_PUBLIC_LARGE_WITHDRAWAL_THRESHOLD', async () => {
    process.env.NEXT_PUBLIC_LARGE_WITHDRAWAL_THRESHOLD = '100';

    const { container, root } = renderInto(
      // 500 display units is now above the 100 threshold.
      <WithdrawButton streamAddress={STREAM_ADDRESS} withdrawable={SMALL_AMOUNT_STROOPS} token={TOKEN} />,
    );

    const button = findWithdrawButton(container);
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
    expect(mockWithdraw).not.toHaveBeenCalled();

    cleanup(container, root);
  });
});
