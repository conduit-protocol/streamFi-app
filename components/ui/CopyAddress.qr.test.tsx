import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CopyAddress } from './CopyAddress';

vi.mock('@/lib/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

const ADDRESS = 'GDJJ5BHD3UQCAZWKNLYRXKZWTDONPUOWQYXJCFDWQYZTQSW7ACSG6HM3';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

function render(ui: React.ReactElement) {
  act(() => { root.render(ui); });
}

describe('CopyAddress — QR code option (#550)', () => {
  it('does not render a QR trigger by default', () => {
    render(<CopyAddress address={ADDRESS} />);
    expect(container.querySelector('[aria-label="Show QR code"]')).toBeNull();
  });

  it('renders a QR trigger next to the copy button when showQrCode is set', () => {
    render(<CopyAddress address={ADDRESS} showQrCode />);
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(2);
    expect(container.querySelector('[aria-label="Show QR code"]')).not.toBeNull();
  });

  it('opens a modal with a scannable QR code on click', async () => {
    render(<CopyAddress address={ADDRESS} showQrCode />);
    const qrButton = container.querySelector('[aria-label="Show QR code"]') as HTMLButtonElement;

    await act(async () => {
      qrButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.querySelector('svg[role="img"]')).not.toBeNull();
    expect(dialog!.textContent).toContain(ADDRESS);
  });

  it('does not trigger the copy handler when the QR icon is clicked', async () => {
    const { copyToClipboard } = await import('@/lib/clipboard');
    render(<CopyAddress address={ADDRESS} showQrCode />);
    const qrButton = container.querySelector('[aria-label="Show QR code"]') as HTMLButtonElement;

    await act(async () => {
      qrButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(copyToClipboard).not.toHaveBeenCalled();
  });

  it('closes the modal when its close button is clicked', async () => {
    render(<CopyAddress address={ADDRESS} showQrCode />);
    const qrButton = container.querySelector('[aria-label="Show QR code"]') as HTMLButtonElement;
    await act(async () => {
      qrButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    const closeButton = container.querySelector('[aria-label="Close"]') as HTMLButtonElement;
    await act(async () => {
      closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('does not propagate the QR click to a parent card/link', async () => {
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <CopyAddress address={ADDRESS} showQrCode />
      </div>,
    );
    const qrButton = container.querySelector('[aria-label="Show QR code"]') as HTMLButtonElement;
    await act(async () => {
      qrButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(parentClick).not.toHaveBeenCalled();
  });
});
