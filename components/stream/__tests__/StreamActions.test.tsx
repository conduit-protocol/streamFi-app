import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StreamActions } from '../StreamActions';

vi.mock('@/contexts/WalletContext', () => ({
  useWallet: vi.fn(),
}));

vi.mock('@/lib/stream', () => ({
  pause:    vi.fn(),
  resume:   vi.fn(),
  cancel:   vi.fn(),
  topUp:    vi.fn(),
  clawback: vi.fn(),
}));

vi.mock('@/lib/queryClient', () => ({
  queryClient: {},
}));

vi.mock('@/lib/query-keys', () => ({
  invalidateStreamMutation:      vi.fn().mockResolvedValue(undefined),
  invalidateProfileAndAllowance: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/offline-transactions', () => ({
  queueTransaction: vi.fn(),
}));

vi.mock('@/lib/optimistic-updates', () => ({
  optimisticStreamStatusUpdate: vi.fn(),
  rollbackStreamStatus:         vi.fn(),
}));

vi.mock('@/components/stream/WithdrawButton', () => ({
  WithdrawButton: (props: any) => (
    <div data-testid="withdraw-button" data-withdrawable={props.withdrawable?.toString()} />
  ),
}));

import { useWallet } from '@/contexts/WalletContext';
import * as streamLib from '@/lib/stream';
import { queueTransaction } from '@/lib/offline-transactions';

const mockUseWallet = vi.mocked(useWallet);
const mockPause = vi.mocked(streamLib.pause);
const mockResume = vi.mocked(streamLib.resume);
const mockCancel = vi.mocked(streamLib.cancel);
const mockTopUp = vi.mocked(streamLib.topUp);
const mockClawback = vi.mocked(streamLib.clawback);
const mockQueueTransaction = vi.mocked(queueTransaction);

const STREAM_ADDRESS = 'CABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGCK3';
const PUBLIC_KEY = 'GDJJ5BHD3UQCAZWKNLYRXKZWTDONPUOWQYXJCFDWQYZTQSW7ACSG6HM3';
const TOKEN = 'USDC';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function render(ui: React.ReactElement) {
  act(() => { root.render(ui); });
}

function button(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button'))
    .find(b => b.textContent?.includes(text)) as HTMLButtonElement | undefined;
}

async function click(el: HTMLButtonElement) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

const baseProps = {
  streamAddress:   STREAM_ADDRESS,
  status:          'active' as const,
  clawbackEnabled: false,
  isSender:        false,
  isRecipient:     false,
  withdrawable:    1000000n,
  token:           TOKEN,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseWallet.mockReturnValue({
    publicKey: PUBLIC_KEY,
    signTx:    vi.fn().mockResolvedValue('signed_xdr'),
    connected: true,
    connecting: false,
    walletName: 'Freighter',
    connect:    vi.fn(),
    disconnect: vi.fn(),
    pendingOperationCount:    0,
    maxConcurrentOperations:  5,
  } as any);
  mockPause.mockResolvedValue('tx_pause');
  mockResume.mockResolvedValue('tx_resume');
  mockCancel.mockResolvedValue('tx_cancel');
  mockTopUp.mockResolvedValue('tx_topup');
  mockClawback.mockResolvedValue('tx_clawback');

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

describe('StreamActions — wallet gating', () => {
  it('renders nothing when no wallet is connected', () => {
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

    render(<StreamActions {...baseProps} isSender isRecipient />);
    expect(container.innerHTML).toBe('');
  });
});

describe('StreamActions — role visibility: recipient', () => {
  it('shows the withdraw button for the recipient when the stream can act', () => {
    render(<StreamActions {...baseProps} isRecipient status="active" />);
    expect(container.querySelector('[data-testid="withdraw-button"]')).not.toBeNull();
  });

  it('hides the withdraw button for the recipient when the stream has ended', () => {
    render(<StreamActions {...baseProps} isRecipient status="ended" />);
    expect(container.querySelector('[data-testid="withdraw-button"]')).toBeNull();
  });

  it('hides the withdraw button for a non-recipient', () => {
    render(<StreamActions {...baseProps} isSender status="active" />);
    expect(container.querySelector('[data-testid="withdraw-button"]')).toBeNull();
  });
});

describe('StreamActions — role visibility: sender, active stream', () => {
  it('shows Pause and Cancel, but not Resume', () => {
    render(<StreamActions {...baseProps} isSender status="active" />);
    expect(button('Pause')).not.toBeUndefined();
    expect(button('Cancel')).not.toBeUndefined();
    expect(button('Resume')).toBeUndefined();
  });

  it('shows the Top up button', () => {
    render(<StreamActions {...baseProps} isSender status="active" />);
    expect(button('Top up')).not.toBeUndefined();
  });
});

describe('StreamActions — role visibility: sender, paused stream', () => {
  it('shows Resume and Cancel, but not Pause', () => {
    render(<StreamActions {...baseProps} isSender status="paused" />);
    expect(button('Resume')).not.toBeUndefined();
    expect(button('Cancel')).not.toBeUndefined();
    expect(button('Pause')).toBeUndefined();
  });

  it('still shows the Top up button while paused', () => {
    render(<StreamActions {...baseProps} isSender status="paused" />);
    expect(button('Top up')).not.toBeUndefined();
  });
});

describe('StreamActions — role visibility: sender, terminal states', () => {
  it('hides Pause/Resume/Cancel/Top up for an ended stream', () => {
    render(<StreamActions {...baseProps} isSender status="ended" />);
    expect(button('Pause')).toBeUndefined();
    expect(button('Resume')).toBeUndefined();
    expect(button('Cancel')).toBeUndefined();
    expect(button('Top up')).toBeUndefined();
  });

  it('hides Pause/Resume/Cancel/Top up for a cancelled stream', () => {
    render(<StreamActions {...baseProps} isSender status="cancelled" />);
    expect(button('Pause')).toBeUndefined();
    expect(button('Resume')).toBeUndefined();
    expect(button('Cancel')).toBeUndefined();
    expect(button('Top up')).toBeUndefined();
  });
});

describe('StreamActions — role visibility: neither sender nor recipient', () => {
  it('renders no action buttons at all', () => {
    render(<StreamActions {...baseProps} status="active" />);
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(container.querySelector('[data-testid="withdraw-button"]')).toBeNull();
  });
});

describe('StreamActions — clawback visibility', () => {
  it('shows the clawback action for an active stream when enabled', () => {
    render(<StreamActions {...baseProps} isSender status="active" clawbackEnabled />);
    expect(button('Clawback unstreamed tokens')).not.toBeUndefined();
  });

  it('hides the clawback action when clawbackEnabled is false', () => {
    render(<StreamActions {...baseProps} isSender status="active" clawbackEnabled={false} />);
    expect(button('Clawback unstreamed tokens')).toBeUndefined();
  });

  it('hides the clawback action for a paused stream even when enabled', () => {
    render(<StreamActions {...baseProps} isSender status="paused" clawbackEnabled />);
    expect(button('Clawback unstreamed tokens')).toBeUndefined();
  });

  it('hides the clawback action for a non-sender even when enabled', () => {
    render(<StreamActions {...baseProps} isRecipient status="active" clawbackEnabled />);
    expect(button('Clawback unstreamed tokens')).toBeUndefined();
  });
});

describe('StreamActions — pending / in-flight state', () => {
  it('disables all action buttons and shows a pending label while an action is in flight', async () => {
    mockPause.mockReturnValue(new Promise(() => {})); // never resolves
    render(<StreamActions {...baseProps} isSender status="active" />);

    const pauseBtn = button('Pause')!;
    await click(pauseBtn);

    expect(pauseBtn.textContent).toContain('Pausing…');
    expect(pauseBtn.disabled).toBe(true);
    expect(button('Cancel')!.disabled).toBe(true);
  });

  it('re-enables buttons and shows an error message when the action fails', async () => {
    mockCancel.mockRejectedValue(new Error('Simulation failed'));
    render(<StreamActions {...baseProps} isSender status="active" />);

    const cancelBtn = button('Cancel')!;
    await click(cancelBtn);

    expect(container.textContent).toContain('Simulation failed');
    expect(cancelBtn.disabled).toBe(false);
  });

  it('calls the wallet-signed mutation and clears pending state on success', async () => {
    const onSuccess = vi.fn();
    render(<StreamActions {...baseProps} isSender status="active" onSuccess={onSuccess} />);

    await click(button('Pause')!);

    expect(mockPause).toHaveBeenCalledWith(PUBLIC_KEY, STREAM_ADDRESS, expect.any(Function));
    expect(onSuccess).toHaveBeenCalled();
    expect(button('Pause')!.disabled).toBe(false);
  });
});

describe('StreamActions — offline queueing', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it('queues a cancel action instead of submitting it while offline', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });

    render(<StreamActions {...baseProps} isSender status="active" />);
    await click(button('Cancel')!);

    expect(mockQueueTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'cancel', publicKey: PUBLIC_KEY, streamAddress: STREAM_ADDRESS }),
    );
    expect(mockCancel).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Queued while offline');
  });
});

describe('StreamActions — top-up flow', () => {
  function setInputValue(input: HTMLInputElement, value: string) {
    act(() => {
      fireEvent.change(input, { target: { value } });
    });
  }

  it('opens the top-up modal when Top up is clicked', async () => {
    render(<StreamActions {...baseProps} isSender status="active" />);
    await click(button('Top up')!);
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.textContent).toContain('Top up stream');
  });

  it('shows a validation error and does not submit when the amount is empty', async () => {
    render(<StreamActions {...baseProps} isSender status="active" />);
    await click(button('Top up')!);
    await click(button('Confirm top-up')!);

    expect(container.textContent).toContain('Enter a valid amount greater than 0');
    expect(mockTopUp).not.toHaveBeenCalled();
  });

  it('submits the top-up with the amount converted to stroops and closes the modal on success', async () => {
    render(<StreamActions {...baseProps} isSender status="active" />);
    await click(button('Top up')!);

    const input = container.querySelector('input[type="number"]') as HTMLInputElement;
    setInputValue(input, '100');

    await click(button('Confirm top-up')!);

    expect(mockTopUp).toHaveBeenCalledWith(PUBLIC_KEY, STREAM_ADDRESS, 1000000000n, expect.any(Function));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('closes the modal without submitting when Cancel is clicked', async () => {
    render(<StreamActions {...baseProps} isSender status="active" />);
    await click(button('Top up')!);
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    const cancelButtons = Array.from(container.querySelectorAll('button'))
      .filter(b => b.textContent?.trim() === 'Cancel');
    await click(cancelButtons[cancelButtons.length - 1] as HTMLButtonElement);

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(mockTopUp).not.toHaveBeenCalled();
  });
});
