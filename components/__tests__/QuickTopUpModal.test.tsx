import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/stream', () => ({ topUp: vi.fn() }));
vi.mock('@/lib/factory', () => ({ isMock: () => true, createStream: vi.fn() }));
vi.mock('@/lib/soroban', () => ({ getTokenBalance: vi.fn() }));
vi.mock('@/contexts/WalletContext', () => ({
  useWallet: () => ({
    publicKey: 'GSENDER',
    connected: true,
    signTx: vi.fn(),
  }),
}));

import { QuickTopUpModal } from '../stream/QuickTopUpModal';
import { topUp } from '@/lib/stream';

const mockedTopUp = vi.mocked(topUp);

describe('QuickTopUpModal (#779) — one-click top-up with balance auto-fill', () => {
  const onClose = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockedTopUp.mockResolvedValue('mock_tx_hash');
  });

  afterEach(() => {
    cleanup();
  });

  function renderModal(overrides: Record<string, unknown> = {}) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const props = {
      streamAddress: 'CSTREAM',
      sender: 'GSENDER',
      tokenAddress: 'CTOKEN',
      tokenSymbol: 'XLM',
      decimals: 7,
      ratePerSecond: 1_000_000n, // 0.1 XLM/s → 6048.00 XLM over 7 days
      endTime: Math.floor(Date.now() / 1000) + 86_400,
      onClose,
      onSuccess,
      ...overrides,
    };
    render(
      <QueryClientProvider client={client}>
        <QuickTopUpModal {...(props as never)} />
      </QueryClientProvider>,
    );
    return props;
  }

  it('auto-fills the amount with the sender wallet balance', async () => {
    renderModal();

    // Mock mode resolves 100.00 XLM (MOCK_BALANCE) — wait for the fill.
    const input = (await screen.findByLabelText('Amount (XLM)')) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe('100.00'));
    expect(
      screen.getByText(/Auto-filled with your full XLM balance/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Top up 100.00 XLM' }),
    ).toBeInTheDocument();
  });

  it('submits the auto-filled amount and closes the modal on success', async () => {
    renderModal();

    const confirm = await screen.findByRole('button', {
      name: 'Top up 100.00 XLM',
    });
    await act(async () => {
      confirm.click();
    });

    await waitFor(() => expect(mockedTopUp).toHaveBeenCalledTimes(1));
    expect(mockedTopUp).toHaveBeenCalledWith(
      'GSENDER',
      'CSTREAM',
      100_0000000n,
      expect.any(Function),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('applies a runway preset instead of the full balance', async () => {
    renderModal();

    const preset = await screen.findByRole('button', { name: '+7 days' });
    await act(async () => {
      preset.click();
    });

    const input = screen.getByLabelText('Amount (XLM)') as HTMLInputElement;
    // 0.1 XLM/s × 604 800 s = 60 480 XLM
    expect(input.value).toBe('60480.00');
    expect(
      screen.getByRole('button', { name: 'Top up 60480.00 XLM' }),
    ).toBeInTheDocument();
  });

  it('blocks submission when the amount exceeds the wallet balance', async () => {
    renderModal();

    const input = (await screen.findByLabelText('Amount (XLM)')) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe('100.00'));

    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!;
    await act(async () => {
      setter.call(input, '999');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await waitFor(() =>
      expect(
        screen.getByText(/Amount exceeds your wallet balance/),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('button', { name: 'Top up 999.00 XLM' }),
    ).toBeDisabled();
  });
});