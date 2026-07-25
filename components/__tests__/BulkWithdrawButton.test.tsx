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
  const address = id === '1' ? 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' 
                : id === 'A' ? 'CBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
                : 'CCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  return { id, address, info: { withdrawable } };
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
      pendingOperationCount: 0,
      maxConcurrentOperations: 5,
    });
    mockWithdraw.mockResolvedValue('tx_hash');
  });

  it('skips streams with missing info without throwing', async () => {
    const streams = [
      { id: undefined, address: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', info: undefined },
      makeStream('1', 100n),
      { id: 'C_STREAM_2', address: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', info: undefined },
    ] as any;

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
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      100n,
      expect.any(Function),
      expect.anything(),
    );

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('skips streams with missing id without throwing', async () => {
    const streams = [
      { id: undefined, address: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', info: { withdrawable: 50n } },
      makeStream('A', 200n),
    ] as any;

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
      'CBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      200n,
      expect.any(Function),
      expect.anything(),
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
      .mockImplementationOnce(() => new Promise(() => {}));

    const onComplete = vi.fn();
    const streams = [
      makeStream('1', 100n),
      makeStream('A', 200n),
    ] as any;

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <BulkWithdrawButton activeStreams={streams} onComplete={onComplete} maxConcurrency={1} />,
      );
    });

    const button = container.querySelector('button')!;
    let clickPromise: Promise<void>;
    act(() => {
      clickPromise = (async () => { button.click(); })();
    });

    act(() => {
      root.unmount();
    });

    await act(async () => {
      resolveFirstWithdraw();
      await firstWithdrawPromise;
      await clickPromise!;
    });

    expect(mockWithdraw).toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();

    document.body.removeChild(container);
  });

  it('renders disabled button when no streams have withdrawable balance', () => {
    const streams = [
      { id: 'C_A', address: 'GABC123ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVW', info: { withdrawable: 0n } },
      { id: 'C_B', address: 'GABC123ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVW', info: { withdrawable: 0n } },
    ] as any;

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
