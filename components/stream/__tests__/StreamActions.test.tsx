import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { StreamActions } from '../StreamActions';

/**
 * Test coverage for StreamActions.tsx (issue #325).
 *
 * Tests:
 * - Role-gated button rendering (sender vs recipient actions)
 * - The run() helper's pending/error handling
 * - Top-up modal amount validation including MAX_I128 bound check
 */

// Mock wallet context
const mockWalletContext = {
  publicKey: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOP',
  signTx: vi.fn(),
};

vi.mock('@/contexts/WalletContext', () => ({
  useWallet: () => mockWalletContext,
}));

// Mock stream library functions
const mockStreamLib = {
  pause: vi.fn(),
  resume: vi.fn(),
  cancel: vi.fn(),
  topUp: vi.fn(),
  clawback: vi.fn(),
};

vi.mock('@/lib/stream', () => mockStreamLib);

// Mock safe operations
vi.mock('@/lib/safe-operations', () => ({
  safeToStroops: (val: string) => {
    const num = parseFloat(val);
    if (isNaN(num) || num <= 0) return null;
    return BigInt(Math.floor(num * 1e7));
  },
}));

// Mock query client
const mockInvalidateQueries = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  queryClient: {
    invalidateQueries: () => mockInvalidateQueries(),
  },
}));

// Mock WithdrawButton
vi.mock('../WithdrawButton', () => ({
  WithdrawButton: ({ streamAddress, withdrawable, token }: any) =>
    React.createElement(
      'div',
      { 'data-testid': 'withdraw-button' },
      `Withdraw ${withdrawable} ${token} from ${streamAddress}`
    ),
}));

// Mock Modal
vi.mock('@/components/ui/Modal', () => ({
  Modal: ({ title, onClose, children }: any) =>
    React.createElement(
      'div',
      { 'data-testid': 'modal', 'data-title': title },
      React.createElement('button', { onClick: onClose, 'data-testid': 'modal-close' }, 'Close'),
      children
    ),
}));

// Mock Input
vi.mock('@/components/ui/Input', () => ({
  Input: (props: any) => React.createElement('input', { ...props, 'data-testid': 'input' }),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Play: ({ className }: any) => React.createElement('span', { className, 'data-testid': 'play-icon' }),
  Pause: ({ className }: any) => React.createElement('span', { className, 'data-testid': 'pause-icon' }),
  X: ({ className }: any) => React.createElement('span', { className, 'data-testid': 'x-icon' }),
  Plus: ({ className }: any) => React.createElement('span', { className, 'data-testid': 'plus-icon' }),
  RotateCcw: ({ className }: any) => React.createElement('span', { className, 'data-testid': 'rotate-icon' }),
}));

describe('StreamActions', () => {
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

  it('renders nothing when wallet is not connected', () => {
    mockWalletContext.publicKey = null;

    act(() => {
      root.render(
        React.createElement(StreamActions, {
          streamAddress: 'CSTREAM123',
          status: 'active',
          clawbackEnabled: false,
          isSender: true,
          isRecipient: false,
          withdrawable: 1000000n,
          token: 'XLM',
        })
      );
    });

    expect(container.textContent).toBe('');

    // Reset for other tests
    mockWalletContext.publicKey = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOP';
  });

  it('shows WithdrawButton for recipient when stream is active', () => {
    act(() => {
      root.render(
        React.createElement(StreamActions, {
          streamAddress: 'CSTREAM123',
          status: 'active',
          clawbackEnabled: false,
          isSender: false,
          isRecipient: true,
          withdrawable: 5000000n,
          token: 'XLM',
        })
      );
    });

    expect(container.querySelector('[data-testid="withdraw-button"]')).toBeTruthy();
    expect(container.textContent).toContain('Withdraw 5000000 XLM');
  });

  it('shows Pause and Cancel buttons for sender when stream is active', () => {
    act(() => {
      root.render(
        React.createElement(StreamActions, {
          streamAddress: 'CSTREAM123',
          status: 'active',
          clawbackEnabled: false,
          isSender: true,
          isRecipient: false,
          withdrawable: 0n,
          token: 'XLM',
        })
      );
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const pauseBtn = buttons.find(btn => btn.textContent?.includes('Pause'));
    const cancelBtn = buttons.find(btn => btn.textContent?.includes('Cancel'));

    expect(pauseBtn).toBeTruthy();
    expect(cancelBtn).toBeTruthy();
  });

  it('shows Resume and Cancel buttons for sender when stream is paused', () => {
    act(() => {
      root.render(
        React.createElement(StreamActions, {
          streamAddress: 'CSTREAM123',
          status: 'paused',
          clawbackEnabled: false,
          isSender: true,
          isRecipient: false,
          withdrawable: 0n,
          token: 'XLM',
        })
      );
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const resumeBtn = buttons.find(btn => btn.textContent?.includes('Resume'));
    const cancelBtn = buttons.find(btn => btn.textContent?.includes('Cancel'));

    expect(resumeBtn).toBeTruthy();
    expect(cancelBtn).toBeTruthy();
  });

  it('shows Top up button for sender when stream is active', () => {
    act(() => {
      root.render(
        React.createElement(StreamActions, {
          streamAddress: 'CSTREAM123',
          status: 'active',
          clawbackEnabled: false,
          isSender: true,
          isRecipient: false,
          withdrawable: 0n,
          token: 'XLM',
        })
      );
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const topUpBtn = buttons.find(btn => btn.textContent?.includes('Top up'));

    expect(topUpBtn).toBeTruthy();
  });

  it('shows Clawback button for sender when clawback is enabled and stream is active', () => {
    act(() => {
      root.render(
        React.createElement(StreamActions, {
          streamAddress: 'CSTREAM123',
          status: 'active',
          clawbackEnabled: true,
          isSender: true,
          isRecipient: false,
          withdrawable: 0n,
          token: 'XLM',
        })
      );
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const clawbackBtn = buttons.find(btn => btn.textContent?.includes('Clawback'));

    expect(clawbackBtn).toBeTruthy();
  });

  it('does not show Clawback button when clawback is disabled', () => {
    act(() => {
      root.render(
        React.createElement(StreamActions, {
          streamAddress: 'CSTREAM123',
          status: 'active',
          clawbackEnabled: false,
          isSender: true,
          isRecipient: false,
          withdrawable: 0n,
          token: 'XLM',
        })
      );
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const clawbackBtn = buttons.find(btn => btn.textContent?.includes('Clawback'));

    expect(clawbackBtn).toBeUndefined();
  });

  it('does not show any action buttons when stream has ended', () => {
    act(() => {
      root.render(
        React.createElement(StreamActions, {
          streamAddress: 'CSTREAM123',
          status: 'ended',
          clawbackEnabled: false,
          isSender: true,
          isRecipient: true,
          withdrawable: 0n,
          token: 'XLM',
        })
      );
    });

    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(0);
  });

  it('calls pause function and invalidates queries on successful pause', async () => {
    mockStreamLib.pause.mockResolvedValue(undefined);

    act(() => {
      root.render(
        React.createElement(StreamActions, {
          streamAddress: 'CSTREAM123',
          status: 'active',
          clawbackEnabled: false,
          isSender: true,
          isRecipient: false,
          withdrawable: 0n,
          token: 'XLM',
        })
      );
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const pauseBtn = buttons.find(btn => btn.textContent?.includes('Pause'));

    await act(async () => {
      pauseBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(mockStreamLib.pause).toHaveBeenCalledWith(
      mockWalletContext.publicKey,
      'CSTREAM123',
      mockWalletContext.signTx
    );
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);
  });

  it('shows error message when action fails', async () => {
    mockStreamLib.cancel.mockRejectedValue(new Error('Network timeout'));

    act(() => {
      root.render(
        React.createElement(StreamActions, {
          streamAddress: 'CSTREAM123',
          status: 'active',
          clawbackEnabled: false,
          isSender: true,
          isRecipient: false,
          withdrawable: 0n,
          token: 'XLM',
        })
      );
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const cancelBtn = buttons.find(btn => btn.textContent?.includes('Cancel'));

    await act(async () => {
      cancelBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(container.textContent).toContain('Network timeout');
  });

  it('disables all buttons while an action is pending', async () => {
    mockStreamLib.pause.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    act(() => {
      root.render(
        React.createElement(StreamActions, {
          streamAddress: 'CSTREAM123',
          status: 'active',
          clawbackEnabled: true,
          isSender: true,
          isRecipient: false,
          withdrawable: 0n,
          token: 'XLM',
        })
      );
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const pauseBtn = buttons.find(btn => btn.textContent?.includes('Pause'));

    act(() => {
      pauseBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // All buttons should be disabled
    const allButtons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
    allButtons.forEach(btn => {
      expect(btn.disabled).toBe(true);
    });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 150));
    });
  });

  it('opens top-up modal when Top up button is clicked', () => {
    act(() => {
      root.render(
        React.createElement(StreamActions, {
          streamAddress: 'CSTREAM123',
          status: 'active',
          clawbackEnabled: false,
          isSender: true,
          isRecipient: false,
          withdrawable: 0n,
          token: 'XLM',
        })
      );
    });

    expect(container.querySelector('[data-testid="modal"]')).toBeNull();

    const buttons = Array.from(container.querySelectorAll('button'));
    const topUpBtn = buttons.find(btn => btn.textContent?.includes('Top up'));

    act(() => {
      topUpBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const modal = container.querySelector('[data-testid="modal"]');
    expect(modal).toBeTruthy();
    expect(modal?.getAttribute('data-title')).toBe('Top up stream');
  });

  it('validates top-up amount is greater than 0', async () => {
    act(() => {
      root.render(
        React.createElement(StreamActions, {
          streamAddress: 'CSTREAM123',
          status: 'active',
          clawbackEnabled: false,
          isSender: true,
          isRecipient: false,
          withdrawable: 0n,
          token: 'XLM',
        })
      );
    });

    // Open modal
    const buttons = Array.from(container.querySelectorAll('button'));
    const topUpBtn = buttons.find(btn => btn.textContent?.includes('Top up'));
    act(() => {
      topUpBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Try to submit with empty amount
    const confirmBtn = Array.from(container.querySelectorAll('button')).find(
      btn => btn.textContent?.includes('Confirm top-up')
    );

    await act(async () => {
      confirmBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Enter a valid amount greater than 0');
    expect(mockStreamLib.topUp).not.toHaveBeenCalled();
  });

  it('validates top-up amount does not exceed MAX_I128', async () => {
    act(() => {
      root.render(
        React.createElement(StreamActions, {
          streamAddress: 'CSTREAM123',
          status: 'active',
          clawbackEnabled: false,
          isSender: true,
          isRecipient: false,
          withdrawable: 0n,
          token: 'XLM',
        })
      );
    });

    // Open modal
    const buttons = Array.from(container.querySelectorAll('button'));
    const topUpBtn = buttons.find(btn => btn.textContent?.includes('Top up'));
    act(() => {
      topUpBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Enter amount that exceeds MAX_I128
    const input = container.querySelector('[data-testid="input"]') as HTMLInputElement;
    act(() => {
      input.value = '170141183460469231731687303715884105728'; // MAX_I128 + 1
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const confirmBtn = Array.from(container.querySelectorAll('button')).find(
      btn => btn.textContent?.includes('Confirm top-up')
    );

    await act(async () => {
      confirmBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Amount exceeds maximum allowed');
    expect(mockStreamLib.topUp).not.toHaveBeenCalled();
  });

  it('submits top-up with valid amount', async () => {
    mockStreamLib.topUp.mockResolvedValue(undefined);

    act(() => {
      root.render(
        React.createElement(StreamActions, {
          streamAddress: 'CSTREAM123',
          status: 'active',
          clawbackEnabled: false,
          isSender: true,
          isRecipient: false,
          withdrawable: 0n,
          token: 'XLM',
        })
      );
    });

    // Open modal
    const buttons = Array.from(container.querySelectorAll('button'));
    const topUpBtn = buttons.find(btn => btn.textContent?.includes('Top up'));
    act(() => {
      topUpBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Enter valid amount
    const input = container.querySelector('[data-testid="input"]') as HTMLInputElement;
    act(() => {
      input.value = '100';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const confirmBtn = Array.from(container.querySelectorAll('button')).find(
      btn => btn.textContent?.includes('Confirm top-up')
    );

    await act(async () => {
      confirmBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(mockStreamLib.topUp).toHaveBeenCalledWith(
      mockWalletContext.publicKey,
      'CSTREAM123',
      1000000000n, // 100 * 1e7
      mockWalletContext.signTx
    );
  });

  it('closes modal after successful top-up', async () => {
    mockStreamLib.topUp.mockResolvedValue(undefined);

    act(() => {
      root.render(
        React.createElement(StreamActions, {
          streamAddress: 'CSTREAM123',
          status: 'active',
          clawbackEnabled: false,
          isSender: true,
          isRecipient: false,
          withdrawable: 0n,
          token: 'XLM',
        })
      );
    });

    // Open modal
    const buttons = Array.from(container.querySelectorAll('button'));
    const topUpBtn = buttons.find(btn => btn.textContent?.includes('Top up'));
    act(() => {
      topUpBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[data-testid="modal"]')).toBeTruthy();

    // Enter valid amount and submit
    const input = container.querySelector('[data-testid="input"]') as HTMLInputElement;
    act(() => {
      input.value = '100';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const confirmBtn = Array.from(container.querySelectorAll('button')).find(
      btn => btn.textContent?.includes('Confirm top-up')
    );

    await act(async () => {
      confirmBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    // Modal should be closed
    expect(container.querySelector('[data-testid="modal"]')).toBeNull();
  });

  it('calls onSuccess callback after successful action', async () => {
    const onSuccess = vi.fn();
    mockStreamLib.resume.mockResolvedValue(undefined);

    act(() => {
      root.render(
        React.createElement(StreamActions, {
          streamAddress: 'CSTREAM123',
          status: 'paused',
          clawbackEnabled: false,
          isSender: true,
          isRecipient: false,
          withdrawable: 0n,
          token: 'XLM',
          onSuccess,
        })
      );
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const resumeBtn = buttons.find(btn => btn.textContent?.includes('Resume'));

    await act(async () => {
      resumeBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('does not update state after unmount (mount guard)', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    let resolveClawback: () => void;
    const clawbackPromise = new Promise<void>(resolve => {
      resolveClawback = resolve;
    });
    mockStreamLib.clawback.mockReturnValue(clawbackPromise);

    act(() => {
      root.render(
        React.createElement(StreamActions, {
          streamAddress: 'CSTREAM123',
          status: 'active',
          clawbackEnabled: true,
          isSender: true,
          isRecipient: false,
          withdrawable: 0n,
          token: 'XLM',
        })
      );
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const clawbackBtn = buttons.find(btn => btn.textContent?.includes('Clawback'));

    act(() => {
      clawbackBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Unmount before action completes
    act(() => {
      root.unmount();
    });

    // Complete the action after unmount
    await act(async () => {
      resolveClawback!();
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    // Should not have thrown errors about setState on unmounted component
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(expect.stringContaining('unmounted'));

    consoleErrorSpy.mockRestore();
  });
});
