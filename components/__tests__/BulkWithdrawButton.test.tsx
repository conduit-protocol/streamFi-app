import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { BulkWithdrawButton } from '../stream/BulkWithdrawButton';
import { withdraw } from '@/lib/stream';

vi.mock('@/contexts/WalletContext', () => ({
  useWallet: vi.fn(),
}));

vi.mock('@/lib/stream', () => ({
  withdraw: vi.fn(),
}));

import { useWallet } from '@/contexts/WalletContext';

const mockUseWallet = vi.mocked(useWallet);
const mockWithdraw = vi.mocked(withdraw);

function makeStream(id: string, withdrawable: bigint) {
  return { id, info: { withdrawable } };
}

describe('BulkWithdrawButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWallet.mockReturnValue({
      publicKey: 'GABC123',
      signTx: vi.fn().mockResolvedValue('signed_xdr'),
      connected: true,
      connecting: false,
      walletName: 'Freighter',
      connect: vi.fn(),
      disconnect: vi.fn(),
    });
    mockWithdraw.mockResolvedValue('tx_hash');
  });

  it('skips streams with missing info without throwing', async () => {
    const streams = [
      { id: undefined, info: undefined },
      makeStream('C_STREAM_1', 100n),
      { id: 'C_STREAM_2', info: undefined },
    ];

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <BulkWithdrawButton
          activeStreams={streams}
          onComplete={vi.fn()}
        />,
      );
    });

    const button = container.querySelector('button')!;
    await act(async () => {
      button.click();
    });

    expect(mockWithdraw).toHaveBeenCalledTimes(1);
    expect(mockWithdraw).toHaveBeenCalledWith(
      'GABC123',
      'C_STREAM_1',
      100n,
      expect.any(Function),
    );

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('skips streams with missing id without throwing', async () => {
    const streams = [
      { id: undefined, info: { withdrawable: 50n } },
      makeStream('C_STREAM_A', 200n),
    ];

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <BulkWithdrawButton activeStreams={streams} />,
      );
    });

    const button = container.querySelector('button')!;
    await act(async () => {
      button.click();
    });

    expect(mockWithdraw).toHaveBeenCalledTimes(1);
    expect(mockWithdraw).toHaveBeenCalledWith(
      'GABC123',
      'C_STREAM_A',
      200n,
      expect.any(Function),
    );

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('processes zero withdrawable streams without calling withdraw', async () => {
    const streams = [makeStream('C_STREAM_ZERO', 0n)];

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <BulkWithdrawButton activeStreams={streams} />,
      );
    });

    const button = container.querySelector('button')!;
    await act(async () => {
      button.click();
    });

    expect(mockWithdraw).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('stops processing after unmount (no wasted calls)', async () => {
    let resolveFirstWithdraw!: () => void;
    const firstWithdrawPromise = new Promise<void>((r) => {
      resolveFirstWithdraw = r;
    });

    mockWithdraw
      .mockImplementationOnce(() => firstWithdrawPromise.then(() => 'hash1'))
      .mockResolvedValue('hash2');

    const onComplete = vi.fn();
    const streams = [
      makeStream('C_STREAM_1', 100n),
      makeStream('C_STREAM_2', 200n),
    ];

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <BulkWithdrawButton activeStreams={streams} onComplete={onComplete} />,
      );
    });

    const button = container.querySelector('button')!;
    let clickPromise: Promise<void>;
    act(() => {
      clickPromise = (async () => { button.click(); })();
    });

    await act(async () => {
      resolveFirstWithdraw();
      await firstWithdrawPromise;
    });

    act(() => {
      root.unmount();
    });

    await act(async () => {
      await clickPromise!;
    });

    expect(mockWithdraw).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();

    document.body.removeChild(container);
  });

  it('renders disabled button when no streams have withdrawable balance', () => {
    const streams = [
      { id: 'C_A', info: { withdrawable: 0n } },
      { id: 'C_B', info: { withdrawable: 0n } },
    ];

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<BulkWithdrawButton activeStreams={streams} />);
    });

    const button = container.querySelector('button')!;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('Withdraw All Available');

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });
});
