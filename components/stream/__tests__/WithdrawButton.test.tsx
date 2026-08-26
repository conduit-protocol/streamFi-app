import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { WithdrawButton } from '../WithdrawButton';

/**
 * Test coverage for WithdrawButton.tsx (issue #325).
 *
 * Tests the state machine: idle → signing → submitting → done/error
 * and mount-guarded state updates to prevent memory leaks.
 */

// Mock wallet context
const mockWalletContext = {
  publicKey: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOP',
  signTx: vi.fn(),
};

vi.mock('@/contexts/WalletContext', () => ({
  useWallet: () => mockWalletContext,
}));

// Mock withdraw function
const mockWithdraw = vi.fn();
vi.mock('@/lib/stream', () => ({
  withdraw: (...args: any[]) => mockWithdraw(...args),
}));

// Mock format utilities
vi.mock('@/lib/format', () => ({
  fromStroops: (val: bigint) => (Number(val) / 1e7).toFixed(7),
}));

// Mock query client
const mockInvalidateQueries = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  queryClient: {
    invalidateQueries: () => mockInvalidateQueries(),
  },
}));

// Mock UI components
vi.mock('@/components/ui/Tooltip', () => ({
  Tooltip: ({ children }: any) => children,
}));

vi.mock('@/components/ui/CopyHashButton', () => ({
  CopyHashButton: ({ hash }: any) => 
    React.createElement('button', { 'data-testid': 'copy-hash' }, `Copy ${hash}`),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ArrowDownToLine: ({ className }: any) => 
    React.createElement('span', { className, 'data-testid': 'arrow-icon' }),
  CheckCircle: ({ className }: any) => 
    React.createElement('span', { className, 'data-testid': 'check-icon' }),
  AlertCircle: ({ className }: any) => 
    React.createElement('span', { className, 'data-testid': 'alert-icon' }),
  Info: ({ className }: any) => 
    React.createElement('span', { className, 'data-testid': 'info-icon' }),
}));

describe('WithdrawButton', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders withdraw button in idle state with amount', () => {
    act(() => {
      root.render(
        React.createElement(WithdrawButton, {
          streamAddress: 'CSTREAM123',
          withdrawable: 5000000n,
          token: 'XLM',
        })
      );
    });

    const button = container.querySelector('button.btn-primary');
    expect(button?.textContent).toContain('Withdraw 0.5000000 XLM');
    expect(button?.disabled).toBe(false);
  });

  it('shows "Nothing to withdraw yet" when withdrawable is 0', () => {
    act(() => {
      root.render(
        React.createElement(WithdrawButton, {
          streamAddress: 'CSTREAM123',
          withdrawable: 0n,
          token: 'XLM',
        })
      );
    });

    const button = container.querySelector('button.btn-primary');
    expect(button?.textContent).toContain('Nothing to withdraw yet');
    expect(button?.disabled).toBe(true);
  });

  it('transitions through state machine: idle → signing → submitting → done', async () => {
    const mockTxHash = 'abc123txhash';
    mockWithdraw.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return mockTxHash;
    });

    act(() => {
      root.render(
        React.createElement(WithdrawButton, {
          streamAddress: 'CSTREAM123',
          withdrawable: 5000000n,
          token: 'XLM',
        })
      );
    });

    const button = container.querySelector('button.btn-primary');

    // Initial state: idle
    expect(button?.textContent).toContain('Withdraw');

    // Click to start withdrawal
    act(() => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Should immediately show signing
    expect(button?.textContent).toContain('Waiting for signature…');

    // Wait for async operation
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    // Should show done state
    expect(container.textContent).toContain('Withdrawn 0.5000000 XLM');
    expect(container.textContent).toContain(mockTxHash);
  });

  it('transitions to error state when withdraw fails', async () => {
    mockWithdraw.mockRejectedValue(new Error('Network timeout'));

    act(() => {
      root.render(
        React.createElement(WithdrawButton, {
          streamAddress: 'CSTREAM123',
          withdrawable: 5000000n,
          token: 'XLM',
        })
      );
    });

    const button = container.querySelector('button.btn-primary');

    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    // Should show error state
    expect(container.textContent).toContain('Transaction failed');
    expect(container.textContent).toContain('Network timeout');
  });

  it('shows generic error message for non-Error rejections', async () => {
    mockWithdraw.mockRejectedValue('some string error');

    act(() => {
      root.render(
        React.createElement(WithdrawButton, {
          streamAddress: 'CSTREAM123',
          withdrawable: 5000000n,
          token: 'XLM',
        })
      );
    });

    const button = container.querySelector('button.btn-primary');

    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(container.textContent).toContain('Transaction failed');
  });

  it('shows error when wallet is not connected', async () => {
    mockWalletContext.publicKey = null;

    act(() => {
      root.render(
        React.createElement(WithdrawButton, {
          streamAddress: 'CSTREAM123',
          withdrawable: 5000000n,
          token: 'XLM',
        })
      );
    });

    const button = container.querySelector('button.btn-primary');

    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Connect your wallet first');

    // Reset for other tests
    mockWalletContext.publicKey = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOP';
  });

  it('calls onSuccess callback after successful withdrawal', async () => {
    const onSuccess = vi.fn();
    mockWithdraw.mockResolvedValue('txhash123');

    act(() => {
      root.render(
        React.createElement(WithdrawButton, {
          streamAddress: 'CSTREAM123',
          withdrawable: 5000000n,
          token: 'XLM',
          onSuccess,
        })
      );
    });

    const button = container.querySelector('button.btn-primary');

    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('invalidates queries after successful withdrawal', async () => {
    mockWithdraw.mockResolvedValue('txhash123');

    act(() => {
      root.render(
        React.createElement(WithdrawButton, {
          streamAddress: 'CSTREAM123',
          withdrawable: 5000000n,
          token: 'XLM',
        })
      );
    });

    const button = container.querySelector('button.btn-primary');

    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);
  });

  it('allows dismissing success state', async () => {
    mockWithdraw.mockResolvedValue('txhash123');

    act(() => {
      root.render(
        React.createElement(WithdrawButton, {
          streamAddress: 'CSTREAM123',
          withdrawable: 5000000n,
          token: 'XLM',
        })
      );
    });

    let button = container.querySelector('button.btn-primary');

    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    // Should be in done state
    expect(container.textContent).toContain('Withdrawn');

    // Click dismiss
    const dismissButton = Array.from(container.querySelectorAll('button')).find(
      btn => btn.textContent === 'Dismiss'
    );
    expect(dismissButton).toBeTruthy();

    act(() => {
      dismissButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Should return to idle state
    button = container.querySelector('button.btn-primary');
    expect(button?.textContent).toContain('Withdraw');
  });

  it('allows retrying from error state', async () => {
    mockWithdraw
      .mockRejectedValueOnce(new Error('First error'))
      .mockResolvedValueOnce('txhash123');

    act(() => {
      root.render(
        React.createElement(WithdrawButton, {
          streamAddress: 'CSTREAM123',
          withdrawable: 5000000n,
          token: 'XLM',
        })
      );
    });

    let button = container.querySelector('button.btn-primary');

    // First attempt fails
    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(container.textContent).toContain('Transaction failed');
    expect(container.textContent).toContain('First error');

    // Click retry
    const retryButton = Array.from(container.querySelectorAll('button')).find(
      btn => btn.textContent === 'Retry'
    );
    expect(retryButton).toBeTruthy();

    act(() => {
      retryButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Should return to idle
    button = container.querySelector('button.btn-primary');
    expect(button?.textContent).toContain('Withdraw');

    // Second attempt succeeds
    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(container.textContent).toContain('Withdrawn');
  });

  it('does not update state after unmount (mount guard)', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Create a promise that resolves after unmount
    let resolveWithdraw: (value: string) => void;
    const withdrawPromise = new Promise<string>(resolve => {
      resolveWithdraw = resolve;
    });
    mockWithdraw.mockReturnValue(withdrawPromise);

    act(() => {
      root.render(
        React.createElement(WithdrawButton, {
          streamAddress: 'CSTREAM123',
          withdrawable: 5000000n,
          token: 'XLM',
        })
      );
    });

    const button = container.querySelector('button.btn-primary');

    // Start withdrawal
    act(() => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Unmount before withdrawal completes
    act(() => {
      root.unmount();
    });

    // Complete the withdrawal after unmount
    await act(async () => {
      resolveWithdraw!('txhash123');
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    // Should not have thrown any errors about setState on unmounted component
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('disables button during signing and submitting states', async () => {
    mockWithdraw.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      return 'txhash';
    });

    act(() => {
      root.render(
        React.createElement(WithdrawButton, {
          streamAddress: 'CSTREAM123',
          withdrawable: 5000000n,
          token: 'XLM',
        })
      );
    });

    const button = container.querySelector('button.btn-primary');

    act(() => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Button should be disabled during process
    expect(button?.disabled).toBe(true);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 150));
    });

    // After completion, goes to done state (no button anymore)
    expect(container.querySelector('button.btn-primary')).toBeNull();
  });

  it('shows protocol fee info when withdrawable > 0', () => {
    act(() => {
      root.render(
        React.createElement(WithdrawButton, {
          streamAddress: 'CSTREAM123',
          withdrawable: 5000000n,
          token: 'XLM',
        })
      );
    });

    expect(container.textContent).toContain('Protocol fee applies');
    expect(container.querySelector('[data-testid="info-icon"]')).toBeTruthy();
  });

  it('does not show protocol fee info when withdrawable is 0', () => {
    act(() => {
      root.render(
        React.createElement(WithdrawButton, {
          streamAddress: 'CSTREAM123',
          withdrawable: 0n,
          token: 'XLM',
        })
      );
    });

    expect(container.textContent).not.toContain('Protocol fee applies');
  });
});
