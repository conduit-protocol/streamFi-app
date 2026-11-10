/**
 * TokenSelector — custom token import flow (#789)
 *
 * Covers:
 *   1. A pasted contract address that is not in the verified list offers "Import token".
 *   2. SEP-41 metadata is read with the connected wallet as simulation source.
 *   3. The "Unverified Asset" modal requires explicit acknowledgement before adding.
 *   4. Confirming persists the token, selects it, and marks it unverified in the list.
 *   5. Cancel / Escape close the modal without importing.
 *   6. Metadata failures surface an inline error and allow retry.
 *   7. Import is unavailable without a wallet (no simulation source).
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrKey, Keypair } from '@stellar/stellar-sdk';
import { TokenSelector } from './TokenSelector';
import * as tokens from '@/lib/tokens';
import {
  loadImportedTokens,
  __clearImportedTokensMemory,
} from '@/lib/imported-tokens-storage';

vi.mock('@/lib/tokens', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tokens')>('@/lib/tokens');
  return { ...actual, fetchSep41Metadata: vi.fn() };
});

const NEW_CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 9));
const SOURCE = Keypair.random().publicKey();
const KNOWN_CONTRACT = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA'; // USDC testnet

const METADATA: tokens.TokenMeta = {
  name: 'Day One Token',
  symbol: 'DAY1',
  decimals: 7,
  address: NEW_CONTRACT,
  verified: false,
};

function fireChange(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('TokenSelector — custom token import (#789)', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let value: string;
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    __clearImportedTokensMemory();
    vi.mocked(tokens.fetchSep41Metadata).mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    value = '';
    onChange = vi.fn((v: string) => { value = v; });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  function render(props: Partial<React.ComponentProps<typeof TokenSelector>> = {}) {
    act(() => {
      root.render(
        <TokenSelector value={value} onChange={onChange} sourceAddress={SOURCE} {...props} />,
      );
    });
  }

  function search(query: string) {
    const input = container.querySelector('#token-selector-search') as HTMLInputElement;
    act(() => fireChange(input, query));
    act(() => { vi.advanceTimersByTime(250); });
  }

  async function flush() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  function findButton(scope: ParentNode, text: string): HTMLButtonElement | undefined {
    return Array.from(scope.querySelectorAll('button')).find(
      b => b.textContent?.trim() === text,
    );
  }

  function dialog(): HTMLElement | null {
    return document.querySelector('[role="dialog"]');
  }

  async function openDisclaimer() {
    vi.mocked(tokens.fetchSep41Metadata).mockResolvedValue(METADATA);
    render();
    search(NEW_CONTRACT);
    act(() => findButton(container, 'Import token')!.click());
    await flush();
  }

  it('offers "Import token" for a valid contract address not in the verified list', () => {
    render();
    search(NEW_CONTRACT);
    expect(container.textContent).toContain('not in the verified token list');
    expect(findButton(container, 'Import token')).toBeDefined();
  });

  it('does not offer import for a contract already in the verified list', () => {
    render();
    search(KNOWN_CONTRACT);
    expect(findButton(container, 'Import token')).toBeUndefined();
    expect(container.textContent).toContain('USDC');
  });

  it('does not offer import for free-text queries or invalid addresses', () => {
    render();
    search('C' + 'A'.repeat(55)); // right shape, bad checksum
    expect(findButton(container, 'Import token')).toBeUndefined();
    search('doge');
    expect(container.textContent).toContain('No tokens match');
  });

  it('reads SEP-41 metadata with the wallet as simulation source and opens the disclaimer', async () => {
    await openDisclaimer();
    expect(tokens.fetchSep41Metadata).toHaveBeenCalledWith(
      NEW_CONTRACT,
      SOURCE,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    const modal = dialog()!;
    expect(modal).not.toBeNull();
    expect(modal.getAttribute('aria-modal')).toBe('true');
    expect(modal.textContent).toContain('Unverified Asset');
    expect(modal.textContent).toContain('Day One Token');
    expect(modal.textContent).toContain('DAY1');
    expect(modal.textContent).toContain(NEW_CONTRACT);
  });

  it('requires explicit acknowledgement before the token can be added', async () => {
    await openDisclaimer();
    const modal = dialog()!;
    const confirm = findButton(modal, 'Import token')!;
    expect(confirm.disabled).toBe(true);

    const checkbox = modal.querySelector('#token-import-acknowledge') as HTMLInputElement;
    expect(modal.querySelector('label[for="token-import-acknowledge"]')).not.toBeNull();
    expect(checkbox.getAttribute('aria-describedby')).toBe('token-import-warning');

    act(() => checkbox.click());
    expect(findButton(dialog()!, 'Import token')!.disabled).toBe(false);
  });

  it('persists, selects and flags the token as unverified on confirm', async () => {
    await openDisclaimer();
    act(() => (dialog()!.querySelector('#token-import-acknowledge') as HTMLInputElement).click());
    act(() => findButton(dialog()!, 'Import token')!.click());

    expect(dialog()).toBeNull();
    expect(onChange).toHaveBeenCalledWith(NEW_CONTRACT);
    expect(loadImportedTokens('testnet')).toEqual([METADATA]);

    // Parent re-renders with the new value — the token resolves as unverified.
    render();
    await flush();
    expect(container.textContent).toContain('DAY1 — Day One Token');
    expect(container.textContent).toContain('unverified, imported by you');

    // And it appears in search results with an "Unverified" badge.
    search('DAY1');
    const option = container.querySelector('[role="option"]')!;
    expect(option.textContent).toContain('DAY1');
    expect(option.textContent).toContain('Unverified');
    expect(option.querySelector('[aria-label="Verified token"]')).toBeNull();
  });

  it('loads previously imported tokens on mount', async () => {
    await openDisclaimer();
    act(() => (dialog()!.querySelector('#token-import-acknowledge') as HTMLInputElement).click());
    act(() => findButton(dialog()!, 'Import token')!.click());
    act(() => root.unmount());

    root = createRoot(container);
    value = '';
    render();
    search(NEW_CONTRACT);
    expect(findButton(container, 'Import token')).toBeUndefined();
    expect(container.querySelector('[role="option"]')!.textContent).toContain('Unverified');
  });

  it('closes without importing on Cancel', async () => {
    await openDisclaimer();
    act(() => findButton(dialog()!, 'Cancel')!.click());
    expect(dialog()).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(loadImportedTokens('testnet')).toEqual([]);
  });

  it('closes without importing on Escape', async () => {
    await openDisclaimer();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(dialog()).toBeNull();
    expect(loadImportedTokens('testnet')).toEqual([]);
  });

  it('moves focus into the disclaimer modal when it opens', async () => {
    await openDisclaimer();
    expect(dialog()!.contains(document.activeElement)).toBe(true);
  });

  it('shows an inline error when metadata cannot be read and allows retry', async () => {
    vi.mocked(tokens.fetchSep41Metadata)
      .mockRejectedValueOnce(new Error('Could not read token metadata. The contract may not be a SEP-41 token (boom).'))
      .mockResolvedValueOnce(METADATA);
    render();
    search(NEW_CONTRACT);
    act(() => findButton(container, 'Import token')!.click());
    await flush();

    const alert = container.querySelector('#token-selector-import-error')!;
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toContain('may not be a SEP-41 token');
    expect(dialog()).toBeNull();

    act(() => findButton(container, 'Import token')!.click());
    await flush();
    expect(dialog()).not.toBeNull();
    expect(container.querySelector('#token-selector-import-error')).toBeNull();
  });

  it('shows a loading label while metadata is being read', () => {
    vi.mocked(tokens.fetchSep41Metadata).mockReturnValue(new Promise(() => {}));
    render();
    search(NEW_CONTRACT);
    act(() => findButton(container, 'Import token')!.click());
    const btn = findButton(container, 'Reading token metadata…')!;
    expect(btn.disabled).toBe(true);
  });

  it('disables import and explains why when no wallet is connected', () => {
    render({ sourceAddress: null });
    search(NEW_CONTRACT);
    const btn = findButton(container, 'Import token')!;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-describedby')).toBe('token-selector-import-hint');
    expect(container.textContent).toContain('Connect a wallet to look up token metadata.');
  });
});
