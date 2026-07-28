import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@/lib/soroban', () => ({
  simulateReadOnly: vi.fn(),
}));

import { simulateReadOnly } from '@/lib/soroban';
import { OperationAbortedError } from '@/lib/safe-operations';
import { TokenSelector } from '../TokenSelector';

// ── Test fixtures ────────────────────────────────────────────────────────────

/**
 * A valid Soroban contract address (C-prefix, 56 chars, base32 A-Z2-7 alphabet).
 * Verified against StrKey.isValidContract.
 */
const VALID_CONTRACT = 'CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526';

/**
 * A valid Stellar Ed25519 public key (G-prefix) to use as the optional
 * validation-source account (contract IDs cannot be transaction sources).
 */
const VALID_SOURCE = 'GABAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEJXA';

const mockSimulateReadOnly = vi.mocked(simulateReadOnly);

// ── Suite setup ──────────────────────────────────────────────────────────────

describe('TokenSelector', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockSimulateReadOnly.mockResolvedValue({} as Awaited<ReturnType<typeof simulateReadOnly>>);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  function input(): HTMLInputElement {
    const node = container.querySelector('input');
    if (!(node instanceof HTMLInputElement)) throw new Error('input not found');
    return node;
  }

  function button(): HTMLButtonElement {
    const node = container.querySelector('button');
    if (!(node instanceof HTMLButtonElement)) throw new Error('button not found');
    return node;
  }

  function errorSpan(): HTMLElement | null {
    return container.querySelector('[role="alert"]');
  }

  async function clickSelect() {
    await act(async () => {
      button().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  async function typeAddress(value: string) {
    await act(async () => {
      const el = input();
      Object.defineProperty(el, 'value', { writable: true, value });
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  // ── Existing baseline tests (preserved) ───────────────────────────────────

  it('renders with defined default state even when optional props are omitted', () => {
    expect(() => {
      act(() => {
        root.render(React.createElement(TokenSelector));
      });
    }).not.toThrow();

    expect(input().value).toBe('');
    expect(container.textContent).toContain('Select Token');
  });

  it('shows a validation message instead of crashing for an invalid token address', async () => {
    act(() => {
      root.render(React.createElement(TokenSelector, { onTokenSelected: vi.fn(), initialToken: 'not-a-contract' }));
    });

    await clickSelect();

    expect(container.textContent).toContain('Invalid token contract address');
    expect(mockSimulateReadOnly).not.toHaveBeenCalled();
  });

  it('selects a valid contract without attempting RPC validation when no source account is supplied', async () => {
    const onTokenSelected = vi.fn();
    const onRefreshNeeded = vi.fn();

    act(() => {
      root.render(
        React.createElement(TokenSelector, {
          onTokenSelected,
          onRefreshNeeded,
          initialToken: `  ${VALID_CONTRACT.toLowerCase()}  `,
        }),
      );
    });

    await clickSelect();

    expect(onTokenSelected).toHaveBeenCalledWith(VALID_CONTRACT);
    expect(onRefreshNeeded).toHaveBeenCalledOnce();
    expect(mockSimulateReadOnly).not.toHaveBeenCalled();
  });

  it('uses a valid source account for optional on-chain decimals validation', async () => {
    const onTokenSelected = vi.fn();

    act(() => {
      root.render(
        React.createElement(TokenSelector, {
          onTokenSelected,
          validationSource: VALID_SOURCE,
          initialToken: VALID_CONTRACT,
        }),
      );
    });

    await clickSelect();

    expect(mockSimulateReadOnly).toHaveBeenCalledWith(
      VALID_SOURCE,
      VALID_CONTRACT,
      'decimals',
      [],
      expect.objectContaining({ timeoutMs: 15_000 }),
    );
    expect(onTokenSelected).toHaveBeenCalledWith(VALID_CONTRACT);
  });

  // ── Regression: base32 alphabet enforcement ────────────────────────────────
  //
  // Before this fix the component used the regex /^[GC][A-Z0-9]{55}$/ which
  // accepted characters (0, 1, 8, 9) that are not part of the Stellar StrKey
  // base32 alphabet (A-Z2-7). This caused a confusing late-stage RPC error
  // rather than an immediate client-side validation failure.
  //
  // The fix replaces the hand-rolled regex with StrKey.isValidContract from
  // the Stellar SDK, which correctly enforces the RFC 4648 base32 alphabet.
  // The tests below are explicit regression guards: they must continue to pass.

  describe('REGRESSION: base32 alphabet — chars 0, 1, 8, 9 must be rejected (were accepted by old /^[GC][A-Z0-9]{55}$/ regex)', () => {
    /**
     * Build a 56-char C-prefix address where one character at position 1 is
     * replaced by the forbidden digit.  The remaining body is valid A-Z2-7.
     */
    function contractWithChar(ch: string): string {
      // VALID_CONTRACT body is all-caps A-Z2-7; swap index 1 for the bad char
      return VALID_CONTRACT[0] + ch + VALID_CONTRACT.slice(2);
    }

    it.each(['0', '1', '8', '9'])(
      'rejects an address containing the invalid base32 character "%s"',
      async (badChar) => {
        const badAddress = contractWithChar(badChar);

        act(() => {
          root.render(React.createElement(TokenSelector, { initialToken: badAddress }));
        });

        await clickSelect();

        expect(container.textContent).toContain('Invalid token contract address');
        expect(mockSimulateReadOnly).not.toHaveBeenCalled();
      },
    );
  });

  // ── Regression: G-prefix (account) address must be rejected ───────────────
  //
  // The old regex /^[GC][A-Z0-9]{55}$/ also accepted G-prefix addresses,
  // silently forwarding an Ed25519 public key to a field that expects a
  // Soroban contract ID.  StrKey.isValidContract correctly rejects these.

  it('REGRESSION: rejects a G-prefix (Ed25519 account) address — only C-prefix contracts are valid', async () => {
    act(() => {
      root.render(React.createElement(TokenSelector, { initialToken: VALID_SOURCE }));
    });

    await clickSelect();

    expect(container.textContent).toContain('Invalid token contract address');
    expect(mockSimulateReadOnly).not.toHaveBeenCalled();
  });

  // ── Empty input ────────────────────────────────────────────────────────────

  it('shows an empty-address error when the input is blank and no initialToken is set', async () => {
    act(() => {
      root.render(React.createElement(TokenSelector));
    });

    await clickSelect();

    expect(container.textContent).toContain('Token address cannot be empty');
    expect(mockSimulateReadOnly).not.toHaveBeenCalled();
  });

  it('shows an empty-address error when the input is whitespace only', async () => {
    act(() => {
      root.render(React.createElement(TokenSelector, { initialToken: '   ' }));
    });

    await clickSelect();

    expect(container.textContent).toContain('Token address cannot be empty');
    expect(mockSimulateReadOnly).not.toHaveBeenCalled();
  });

  // ── Abort / cancellation on rapid re-selection ────────────────────────────
  //
  // When the user submits a second address before the first RPC call resolves,
  // the component aborts the in-flight request (OperationAbortedError) and must
  // not invoke onTokenSelected for the cancelled attempt.  Only the second
  // (winning) call's result should propagate.

  it('aborts the in-flight RPC call when the user re-selects before it resolves', async () => {
    const onTokenSelected = vi.fn();
    let resolveFirst!: () => void;

    // First call stalls until we manually resolve it
    mockSimulateReadOnly
      .mockImplementationOnce(
        () =>
          new Promise<never>((_, reject) => {
            resolveFirst = () => reject(new OperationAbortedError());
          }),
      )
      // Second call resolves immediately
      .mockResolvedValueOnce({} as Awaited<ReturnType<typeof simulateReadOnly>>);

    act(() => {
      root.render(
        React.createElement(TokenSelector, {
          onTokenSelected,
          validationSource: VALID_SOURCE,
          initialToken: VALID_CONTRACT,
        }),
      );
    });

    // Kick off the first call
    await act(async () => {
      button().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Immediately click again (rapid re-selection) — aborts the first call
    await act(async () => {
      button().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Resolve (abort) the first call
    await act(async () => {
      resolveFirst();
    });

    // Allow microtasks to flush
    await act(async () => {
      await Promise.resolve();
    });

    // The aborted call must never fire onTokenSelected; the second call did
    expect(onTokenSelected).toHaveBeenCalledTimes(1);
    expect(onTokenSelected).toHaveBeenCalledWith(VALID_CONTRACT);
    // No error shown for an aborted call
    expect(errorSpan()).toBeNull();
  });

  // ── RPC timeout error display ─────────────────────────────────────────────
  //
  // When the RPC call times out (normalizeError returns source === 'rpc'),
  // the component should surface a user-friendly timeout message rather than
  // the raw network error.

  it('displays a timeout error message when the RPC call times out', async () => {
    mockSimulateReadOnly.mockRejectedValueOnce(new Error('Request timed out after 15000ms'));

    act(() => {
      root.render(
        React.createElement(TokenSelector, {
          onTokenSelected: vi.fn(),
          validationSource: VALID_SOURCE,
          initialToken: VALID_CONTRACT,
        }),
      );
    });

    await clickSelect();

    const alert = errorSpan();
    expect(alert).not.toBeNull();
    expect(alert!.textContent).toContain('timed out');
    expect(alert!.textContent).toContain('RPC provider');
  });

  it('displays a timeout error message when the RPC source is flagged as rpc by a network-level error', async () => {
    mockSimulateReadOnly.mockRejectedValueOnce(new Error('timeout: soroban rpc did not respond'));

    act(() => {
      root.render(
        React.createElement(TokenSelector, {
          onTokenSelected: vi.fn(),
          validationSource: VALID_SOURCE,
          initialToken: VALID_CONTRACT,
        }),
      );
    });

    await clickSelect();

    expect(errorSpan()!.textContent).toContain('timed out');
  });

  // ── Generic RPC / network failure ─────────────────────────────────────────

  it('displays a generic error message for non-timeout RPC failures', async () => {
    mockSimulateReadOnly.mockRejectedValueOnce(new Error('Simulation failed: HostError'));

    act(() => {
      root.render(
        React.createElement(TokenSelector, {
          onTokenSelected: vi.fn(),
          validationSource: VALID_SOURCE,
          initialToken: VALID_CONTRACT,
        }),
      );
    });

    await clickSelect();

    const alert = errorSpan();
    expect(alert).not.toBeNull();
    expect(alert!.textContent).toContain('not a valid token contract');
  });

  // ── Invalid validationSource ───────────────────────────────────────────────

  it('shows an error and skips RPC when the supplied validationSource is not a valid public key', async () => {
    act(() => {
      root.render(
        React.createElement(TokenSelector, {
          onTokenSelected: vi.fn(),
          validationSource: 'not-a-public-key',
          initialToken: VALID_CONTRACT,
        }),
      );
    });

    await clickSelect();

    expect(container.textContent).toContain('source account must be a valid Stellar public key');
    expect(mockSimulateReadOnly).not.toHaveBeenCalled();
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it('disables the button and shows "Validating…" while an RPC call is in flight', async () => {
    let resolveRpc!: () => void;
    mockSimulateReadOnly.mockImplementationOnce(
      () =>
        new Promise<Awaited<ReturnType<typeof simulateReadOnly>>>((resolve) => {
          resolveRpc = () => resolve({} as Awaited<ReturnType<typeof simulateReadOnly>>);
        }),
    );

    act(() => {
      root.render(
        React.createElement(TokenSelector, {
          onTokenSelected: vi.fn(),
          validationSource: VALID_SOURCE,
          initialToken: VALID_CONTRACT,
        }),
      );
    });

    // Start the call but don't await it yet
    act(() => {
      button().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Mid-flight: button should be disabled and show "Validating…"
    expect(button().disabled).toBe(true);
    expect(button().textContent).toContain('Validating');

    // Resolve the call
    await act(async () => {
      resolveRpc();
    });

    // After resolution: button re-enabled
    expect(button().disabled).toBe(false);
    expect(button().textContent).toContain('Select Token');
  });

  // ── Error cleared on new input ────────────────────────────────────────────

  it('clears a displayed error when the user starts typing a new address', async () => {
    act(() => {
      root.render(React.createElement(TokenSelector, { initialToken: 'bad-address' }));
    });

    // Trigger validation error
    await clickSelect();
    expect(errorSpan()).not.toBeNull();

    // User starts typing — error should clear
    await typeAddress('C');
    expect(errorSpan()).toBeNull();
  });
});
