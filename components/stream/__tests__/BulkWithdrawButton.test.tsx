import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { BulkWithdrawButton } from '../BulkWithdrawButton';
import { useWallet } from '@/contexts/WalletContext';
import { withdraw } from '@/lib/stream';

vi.mock('@/contexts/WalletContext', () => ({
  useWallet: vi.fn(),
}));

vi.mock('@/lib/stream', () => ({
  withdraw: vi.fn(),
}));

const mockUseWallet = vi.mocked(useWallet);
const mockWithdraw = vi.mocked(withdraw);

function renderInto(el: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root };
}

describe('BulkWithdrawButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWallet.mockReturnValue({
      publicKey: 'GDJJ5BHD3UQCAZWKNLYRXKZWTDONPUOWQYXJCFDWQYZTQSW7ACSG6HM3',
      signTx: vi.fn().mockResolvedValue('signed_xdr'),
      connected: true,
    } as any);
  });

  it('renders disabled when there are no valid streams', () => {
    const { container, root } = renderInto(<></>);
    act(() => {
      root.render(<BulkWithdrawButton activeStreams={[]} />);
    });

    const button = container.querySelector('button');
    expect(button).toBeDefined();
    expect(button?.disabled).toBe(true);

    act(() => { root.unmount(); });
    document.body.removeChild(container);
  });

  it('renders excluded streams message for invalid streams', () => {
    const invalidStream = { address: 'INVALID', info: { withdrawable: 100n } }; // no id
    const { container, root } = renderInto(<></>);
    act(() => {
      root.render(<BulkWithdrawButton activeStreams={[invalidStream]} />);
    });

    expect(container.textContent).toContain('1 stream excluded due to invalid or missing data');

    act(() => { root.unmount(); });
    document.body.removeChild(container);
  });

  it('happy path: processes valid streams successfully and calls onComplete', async () => {
    const validStream1 = {
      id: 'stream1',
      address: 'GDJJ5BHD3UQCAZWKNLYRXKZWTDONPUOWQYXJCFDWQYZTQSW7ACSG6HM3',
      info: { withdrawable: 100n },
    };
    const validStream2 = {
      id: 'stream2',
      address: 'GDJJ5BHD3UQCAZWKNLYRXKZWTDONPUOWQYXJCFDWQYZTQSW7ACSG6HM3',
      info: { withdrawable: 200n },
    };

    mockWithdraw.mockResolvedValue(undefined as never);
    const onComplete = vi.fn();

    const { container, root } = renderInto(<></>);
    act(() => {
      root.render(
        <BulkWithdrawButton
          activeStreams={[validStream1, validStream2]}
          onComplete={onComplete}
        />,
      );
    });

    const button = container.querySelector('button');
    expect(button?.disabled).toBe(false);

    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 0)); // let async ops tick
    });

    expect(mockWithdraw).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenCalledWith({
      successCount: 2,
      totalCount: 2,
      errors: [],
    });

    act(() => { root.unmount(); });
    document.body.removeChild(container);
  });

  it('error case: captures errors when withdraw fails', async () => {
    const validStream1 = {
      id: 'stream1',
      address: 'GDJJ5BHD3UQCAZWKNLYRXKZWTDONPUOWQYXJCFDWQYZTQSW7ACSG6HM3',
      info: { withdrawable: 100n },
    };

    mockWithdraw.mockRejectedValue(new Error('Network error'));
    const onComplete = vi.fn();

    const { container, root } = renderInto(<></>);
    act(() => {
      root.render(
        <BulkWithdrawButton
          activeStreams={[validStream1]}
          onComplete={onComplete}
        />,
      );
    });

    const button = container.querySelector('button');

    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 0)); // let async ops tick
    });

    expect(onComplete).toHaveBeenCalledWith({
      successCount: 0,
      totalCount: 1,
      errors: [
        {
          streamId: 'stream1',
          error: 'Stream stream1: Network error',
        },
      ],
    });

    act(() => { root.unmount(); });
    document.body.removeChild(container);
  });

  it('interactive states: shows processing state while active', async () => {
    const validStream = {
      id: 'stream1',
      address: 'GDJJ5BHD3UQCAZWKNLYRXKZWTDONPUOWQYXJCFDWQYZTQSW7ACSG6HM3',
      info: { withdrawable: 100n },
    };

    let resolveWithdraw: () => void;
    mockWithdraw.mockReturnValue(new Promise(resolve => {
      resolveWithdraw = () => resolve(undefined as never);
    }));

    const { container, root } = renderInto(<></>);
    act(() => {
      root.render(
        <BulkWithdrawButton
          activeStreams={[validStream]}
        />,
      );
    });

    const button = container.querySelector('button');
    act(() => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Should be in processing state
    expect(button?.disabled).toBe(true);
    expect(container.textContent).toContain('Processing 0/1');

    await act(async () => {
      resolveWithdraw();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Back to ready state (but zero withdrawable streams usually disable the button if they were removed,
    // in this component we don't automatically remove them from the list, we just finish processing)
    expect(button?.textContent).toContain('Withdraw All Available');

    act(() => { root.unmount(); });
    document.body.removeChild(container);
  });
});
