import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { BulkWithdrawButton } from '../stream/BulkWithdrawButton';

vi.mock('@/contexts/WalletContext', () => ({
  useWallet: vi.fn(),
}));

vi.mock('@/lib/stream', () => ({
  withdraw: vi.fn(),
}));

import { useWallet } from '@/contexts/WalletContext';
import { withdraw } from '@/lib/stream';

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
    mockWithdraw.mockReset();
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

  it('reports correct per-stream results with mixed success and failure', async () => {
    const streams = [
      makeStream('1', 100n),
      makeStream('A', 200n),
      makeStream('B', 300n),
    ];

    mockWithdraw.mockResolvedValueOnce('hash_1');
    mockWithdraw.mockRejectedValueOnce(new Error('Network timeout for stream 2'));
    mockWithdraw.mockResolvedValueOnce('hash_3');

    const onComplete = vi.fn();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <BulkWithdrawButton
          activeStreams={streams}
          onComplete={onComplete}
          maxConcurrency={1}
        />,
      );
    });

    const button = container.querySelector('button')!;

    await act(async () => {
      button.click();
      await new Promise((r) => setTimeout(r, 500));
    });

    expect(mockWithdraw).toHaveBeenCalledTimes(3);
    expect(onComplete).toHaveBeenCalledTimes(1);

    const result = onComplete.mock.calls[0]![0]!;
    expect(result.successCount).toBe(2);
    expect(result.totalCount).toBe(3);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.streamId).toBe('A');
    expect(result.errors[0]!.error).toContain('Network timeout');

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('isolates failures so one stream failure does not affect others', async () => {
    mockWithdraw.mockImplementationOnce(async () => { await new Promise(r => setTimeout(r, 5)); return 'hash_1'; });
    mockWithdraw.mockImplementationOnce(async () => { await new Promise(r => setTimeout(r, 5)); throw new Error('Stream A failed'); });
    mockWithdraw.mockImplementationOnce(async () => { await new Promise(r => setTimeout(r, 5)); return 'hash_3'; });

    const onComplete = vi.fn();
    const streams = [
      makeStream('1', 100n),
      makeStream('A', 200n),
      makeStream('B', 300n),
    ];

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <BulkWithdrawButton
          activeStreams={streams}
          onComplete={onComplete}
          maxConcurrency={1}
        />,
      );
    });

    const button = container.querySelector('button')!;

    await act(async () => {
      button.click();
      await new Promise((r) => setTimeout(r, 500));
    });

    expect(onComplete).toHaveBeenCalledTimes(1);

    const result = onComplete.mock.calls[0]![0]!;
    expect(result.successCount).toBe(2);
    expect(result.totalCount).toBe(3);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.streamId).toBe('A');
    expect(result.errors[0]!.error).toContain('Stream A failed');

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('disables button when all streams have invalid addresses', async () => {
    const streams = [
      { id: 'bad_1', address: 'not-a-valid-address', info: { withdrawable: 100n } },
      { id: 'bad_2', address: 'also-invalid', info: { withdrawable: 200n } },
    ] as any;

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<BulkWithdrawButton activeStreams={streams} />);
    });

    const button = container.querySelector('button')!;
    expect(button.disabled).toBe(true);

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('shows exclusion warning when some streams are filtered out', async () => {
    const streams = [
      { id: undefined, address: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', info: { withdrawable: 100n } },
      makeStream('1', 200n),
    ] as any;

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<BulkWithdrawButton activeStreams={streams} />);
    });

    expect(container.textContent).toContain('excluded');

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('does not show exclusion warning when all streams are valid', async () => {
    const streams = [
      makeStream('1', 100n),
      makeStream('A', 200n),
    ];

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<BulkWithdrawButton activeStreams={streams} />);
    });

    expect(container.textContent).not.toContain('excluded');

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('button is enabled when at least one stream passes strict validation', async () => {
    const streams = [
      { id: undefined, address: 'bad-address', info: { withdrawable: 50n } },
      makeStream('1', 100n),
    ] as any;

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<BulkWithdrawButton activeStreams={streams} />);
    });

    const button = container.querySelector('button')!;
    expect(button.disabled).toBe(false);

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });
});
