import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

// ── Mocks ────────────────────────────────────────────────────────────────────

const TEST_RECIPIENT = 'GABBG5LDGECWWCJN7NGP6JIVY6M2PDMZXHFIWDBMR5WKZFGF5NPOILDL';

vi.mock('@/contexts/WalletContext', () => ({
  useWallet: () => ({
    publicKey: 'GSENDER1234567890ABCDEF',
    connected: true,
    signTx: vi.fn(),
  }),
}));

// CreatePage calls useRouter() (redirects to /streams on success) — outside
// of a real Next.js app router tree that throws "invariant expected app
// router to be mounted", so it needs mocking here too (see
// contexts/WalletContext.test.tsx for the same pattern).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const mockCreateStream = vi.fn();
// Defaults to demo/mock mode so the pre-existing zero-rate-guard tests below
// (which predate the #218 allowance step) don't need to know about it.
const mockIsMock = vi.fn(() => true);
vi.mock('@/lib/factory', () => ({
  createStream: (...args: unknown[]) => mockCreateStream(...args),
  isMock: () => mockIsMock(),
}));

const mockRefreshStreamData = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  refreshStreamData: (...args: unknown[]) => mockRefreshStreamData(...args),
}));

const FACTORY_ID = 'CFACTORYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
vi.mock('@/lib/env', () => ({
  getFactoryContractId: () => FACTORY_ID,
}));

const mockCheckAllowance = vi.fn();
const mockApprove = vi.fn();
vi.mock('@/lib/token-allowance-gateway', () => ({
  getTokenAllowanceGateway: () => ({
    checkAllowance: (...args: unknown[]) => mockCheckAllowance(...args),
    approve: (...args: unknown[]) => mockApprove(...args),
  }),
}));

const mockCheckRecipientExists = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/soroban', async () => {
  const actual = await vi.importActual<typeof import('@/lib/soroban')>('@/lib/soroban');
  return {
    ...actual,
    checkRecipientExists: (...args: unknown[]) => mockCheckRecipientExists(...args),
  };
});

vi.mock('lucide-react', () => ({
  ArrowRight: () => React.createElement('span', null, '→'),
  Info: () => React.createElement('span', null, 'i'),
  Copy: () => React.createElement('span', null, 'copy'),
  Check: () => React.createElement('span', null, 'check'),
}));

// ── Import after mocks ───────────────────────────────────────────────────────

import CreatePage from '../page';

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderCreatePage() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(CreatePage));
  });
  return { container, root };
}

function cleanup(root: ReturnType<typeof createRoot>, container: HTMLElement) {
  act(() => {
    root.unmount();
  });
  document.body.removeChild(container);
}

/** Set a native input/select value and fire the event react-hook-form listens for. */
function setFieldValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement
    ? window.HTMLInputElement.prototype
    : window.HTMLSelectElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  nativeSetter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function fillRecipient(container: HTMLElement) {
  const recipientInput = container.querySelector('input[placeholder="G…"]') as HTMLInputElement;
  await act(async () => {
    setFieldValue(recipientInput, TEST_RECIPIENT);
  });
  // Recipient existence check is debounced 600ms + RPC; wait for it to settle
  // so the form isn't blocked by `recipientStatus === 'checking'`.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 700));
  });
}

async function fillDeposit(container: HTMLElement, amount: string) {
  const depositInput = container.querySelector('input[placeholder="1000"]') as HTMLInputElement;
  await act(async () => {
    setFieldValue(depositInput, amount);
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CreatePage — zero-rate guard (issue #243)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRecipientExists.mockResolvedValue(true);
    mockCreateStream.mockResolvedValue({ hash: 'tx_hash_abc', streamId: 7n });
    mockRefreshStreamData.mockResolvedValue(undefined);
  });

  it('shows a clear warning and disables submit when the rate would truncate to zero', async () => {
    const { container, root } = renderCreatePage();

    await fillRecipient(container);
    // 0.001 XLM over the default 30-day (2_592_000s) duration -> rate truncates to 0n.
    await fillDeposit(container, '0.001');

    expect(container.textContent).toContain(
      'Deposit too small for this duration — increase the amount or shorten the duration.',
    );

    const submitButton = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);

    cleanup(root, container);
  });

  it('does not submit a zero-rate stream even if submission is forced', async () => {
    const { container, root } = renderCreatePage();

    await fillRecipient(container);
    await fillDeposit(container, '0.001');

    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
      // Let the async zod resolver + onSubmit settle.
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(mockCreateStream).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Deposit too small for this duration');

    cleanup(root, container);
  });

  it('allows submission and shows no warning for a deposit/duration that yields a non-zero rate', async () => {
    const { container, root } = renderCreatePage();

    await fillRecipient(container);
    // 1000 XLM over the default 30-day duration -> ~3858 stroops/s, well above zero.
    await fillDeposit(container, '1000');

    expect(container.textContent).not.toContain('Deposit too small for this duration');

    const submitButton = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitButton.disabled).toBe(false);

    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(mockCreateStream).toHaveBeenCalledTimes(1);

    cleanup(root, container);
  });
});

describe('CreatePage — SEP-41 allowance check before deposit (issue #218)', () => {
  const XLM_ADDRESS = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRecipientExists.mockResolvedValue(true);
    mockIsMock.mockReturnValue(false);
    mockCreateStream.mockResolvedValue({ hash: 'tx_hash_abc', streamId: 7n });
    mockRefreshStreamData.mockResolvedValue(undefined);
  });

  async function submitDeposit(container: HTMLElement) {
    await fillRecipient(container);
    // 1000 XLM over the default 30-day duration -> well above the zero-rate floor.
    await fillDeposit(container, '1000');
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
      await new Promise((r) => setTimeout(r, 50));
    });
  }

  it('requests approval when the existing allowance is insufficient, then proceeds to create the stream', async () => {
    mockCheckAllowance.mockResolvedValue({ success: true, data: 0n });
    mockApprove.mockResolvedValue({ success: true, data: 'approve_tx_hash' });

    const { container, root } = renderCreatePage();
    await submitDeposit(container);

    expect(mockCheckAllowance).toHaveBeenCalledWith(
      expect.objectContaining({
        token:  XLM_ADDRESS,
        owner:  'GSENDER1234567890ABCDEF',
        spender: FACTORY_ID,
      }),
    );
    expect(mockApprove).toHaveBeenCalledTimes(1);
    // approve() must resolve before create_stream is submitted.
    expect(mockCreateStream).toHaveBeenCalledTimes(1);

    cleanup(root, container);
  });

  it('skips approve() when the existing allowance already covers the deposit', async () => {
    mockCheckAllowance.mockResolvedValue({ success: true, data: 10_000_000_000_000n });

    const { container, root } = renderCreatePage();
    await submitDeposit(container);

    expect(mockCheckAllowance).toHaveBeenCalledTimes(1);
    expect(mockApprove).not.toHaveBeenCalled();
    expect(mockCreateStream).toHaveBeenCalledTimes(1);

    cleanup(root, container);
  });

  it('surfaces an actionable error and never submits the deposit when approval fails', async () => {
    mockCheckAllowance.mockResolvedValue({ success: true, data: 0n });
    mockApprove.mockResolvedValue({
      success: false,
      error: {
        message: 'Wallet rejected the approval request',
        code: 'WALLET_REJECTED',
        source: 'wallet',
        retryable: false,
      },
    });

    const { container, root } = renderCreatePage();
    await submitDeposit(container);

    expect(mockApprove).toHaveBeenCalledTimes(1);
    expect(mockCreateStream).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Wallet rejected the approval request');

    cleanup(root, container);
  });

  it('surfaces an actionable error and never approves/deposits when the allowance check itself fails', async () => {
    // Mirrors #291 — a transient RPC/network failure must not be treated as
    // a genuine zero allowance and silently trigger an approve() call.
    mockCheckAllowance.mockResolvedValue({
      success: false,
      error: {
        message: 'Network request timed out',
        code: 'NETWORK_TIMEOUT',
        source: 'network',
        retryable: true,
      },
    });

    const { container, root } = renderCreatePage();
    await submitDeposit(container);

    expect(mockApprove).not.toHaveBeenCalled();
    expect(mockCreateStream).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Network request timed out');

    cleanup(root, container);
  });
});
