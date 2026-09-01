import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { OperatorInfo } from '../OperatorInfo';

vi.mock('@/contexts/WalletContext', () => ({
  useWallet: vi.fn(),
}));

vi.mock('@/lib/stream', () => ({
  revokeOperator: vi.fn(),
}));

vi.mock('@/lib/query-keys', () => ({
  invalidateStreamMutation: vi.fn().mockResolvedValue(undefined),
}));

import { useWallet } from '@/contexts/WalletContext';
import { revokeOperator } from '@/lib/stream';

const mockUseWallet = vi.mocked(useWallet);
const mockRevokeOperator = vi.mocked(revokeOperator);

const STREAM_ADDRESS = 'CABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGCK3';
const OPERATOR = 'GDB22ABFYG6BKLMKUTYC32CQ2CTMAQ3GTP2SEVIEWN53LIFO7OVUBL4J';

function renderInto(el: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root };
}

describe('OperatorInfo', () => {
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
    mockRevokeOperator.mockResolvedValue('tx_hash');
  });

  it('displays the operator address', () => {
    const { container, root } = renderInto(<></>);
    act(() => {
      root.render(
        <OperatorInfo streamAddress={STREAM_ADDRESS} operator={OPERATOR} isSender={false} />,
      );
    });

    expect(container.textContent).toContain('Delegated operator');
    // truncateAddress shortens it, so check for the recognizable prefix.
    expect(container.textContent).toContain(OPERATOR.slice(0, 4));

    act(() => { root.unmount(); });
    document.body.removeChild(container);
  });

  it('does not show a Revoke button when the viewer is not the sender', () => {
    const { container, root } = renderInto(<></>);
    act(() => {
      root.render(
        <OperatorInfo streamAddress={STREAM_ADDRESS} operator={OPERATOR} isSender={false} />,
      );
    });

    expect(container.textContent).not.toContain('Revoke');

    act(() => { root.unmount(); });
    document.body.removeChild(container);
  });

  it('shows a Revoke button for the sender and calls revokeOperator on click', async () => {
    const onSuccess = vi.fn();
    const { container, root } = renderInto(<></>);
    act(() => {
      root.render(
        <OperatorInfo
          streamAddress={STREAM_ADDRESS}
          operator={OPERATOR}
          isSender={true}
          onSuccess={onSuccess}
        />,
      );
    });

    const button = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Revoke'));
    expect(button).toBeDefined();

    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockRevokeOperator).toHaveBeenCalledWith(
      'GDJJ5BHD3UQCAZWKNLYRXKZWTDONPUOWQYXJCFDWQYZTQSW7ACSG6HM3',
      STREAM_ADDRESS,
      expect.any(Function),
    );
    expect(onSuccess).toHaveBeenCalled();

    act(() => { root.unmount(); });
    document.body.removeChild(container);
  });

  it('surfaces an error message when revokeOperator fails, without leaving the button stuck pending', async () => {
    mockRevokeOperator.mockRejectedValue(new Error('Simulation failed'));
    const { container, root } = renderInto(<></>);
    act(() => {
      root.render(
        <OperatorInfo streamAddress={STREAM_ADDRESS} operator={OPERATOR} isSender={true} />,
      );
    });

    const button = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Revoke'));

    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Simulation failed');
    expect((button as HTMLButtonElement).disabled).toBe(false);

    act(() => { root.unmount(); });
    document.body.removeChild(container);
  });
});
