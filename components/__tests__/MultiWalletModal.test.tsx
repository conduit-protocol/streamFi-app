import React, { act } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { MultiWalletModal } from '../MultiWalletModal';

/**
 * MultiWalletModal — Ledger (WebHID) option (#792).
 */

function setWebHID(available: boolean) {
  if (available) {
    Object.defineProperty(navigator, 'hid', { value: {}, configurable: true });
  } else {
    delete (navigator as any).hid;
  }
}

describe('MultiWalletModal — Ledger option', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    setWebHID(false);
  });

  function render(onConnect = vi.fn()) {
    act(() => {
      root.render(<MultiWalletModal open onClose={vi.fn()} onConnect={onConnect} />);
    });
    return onConnect;
  }

  function ledgerButton() {
    return [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Ledger'));
  }

  it('lists Ledger and connects with the "ledger" provider id when WebHID is available', () => {
    setWebHID(true);
    const onConnect = render();

    const button = ledgerButton();
    expect(button).toBeDefined();
    expect(button).not.toBeDisabled();

    act(() => button!.click());
    expect(onConnect).toHaveBeenCalledWith('ledger');
  });

  it('disables Ledger and explains why when the browser has no WebHID', () => {
    setWebHID(false);
    const onConnect = render();

    const button = ledgerButton()!;
    expect(button).toBeDisabled();
    const noteId = button.getAttribute('aria-describedby');
    expect(noteId).toBeTruthy();
    expect(container.querySelector(`#${noteId}`)?.textContent).toMatch(/WebHID/);

    act(() => button.click());
    expect(onConnect).not.toHaveBeenCalled();
  });

  it('keeps the extension wallets enabled regardless of WebHID support', () => {
    setWebHID(false);
    render();
    const freighter = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Freighter'));
    expect(freighter).not.toBeDisabled();
  });
});
