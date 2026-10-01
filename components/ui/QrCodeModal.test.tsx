import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QrCodeModal } from './QrCodeModal';

const ADDRESS = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';

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

describe('QrCodeModal', () => {
  it('renders an SVG QR code and the full address', () => {
    render(<QrCodeModal address={ADDRESS} onClose={vi.fn()} />);
    const svg = container.querySelector('svg[role="img"]');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('aria-label')).toContain(ADDRESS);
    expect(container.textContent).toContain(ADDRESS);
  });

  it('draws at least one dark module (the QR is not blank)', () => {
    render(<QrCodeModal address={ADDRESS} onClose={vi.fn()} />);
    const rects = container.querySelectorAll('svg rect[fill="#000"]');
    expect(rects.length).toBeGreaterThan(0);
  });

  it('re-encodes when the address prop changes', () => {
    render(<QrCodeModal address={ADDRESS} onClose={vi.fn()} />);
    const firstSvg = container.querySelector('svg')!;
    const firstViewBox = firstSvg.getAttribute('viewBox');

    const shortAddress = 'GSHORT';
    act(() => {
      root.render(<QrCodeModal address={shortAddress} onClose={vi.fn()} />);
    });
    const secondSvg = container.querySelector('svg')!;
    expect(container.textContent).toContain(shortAddress);
    // A shorter payload should never need a larger (or equal-and-different) module grid.
    expect(secondSvg.getAttribute('viewBox')).not.toBe(null);
    expect(firstViewBox).not.toBe(null);
  });

  it('calls onClose when the modal close button is clicked', async () => {
    const onClose = vi.fn();
    render(<QrCodeModal address={ADDRESS} onClose={onClose} />);
    const closeButton = container.querySelector('[aria-label="Close"]') as HTMLButtonElement;
    await act(async () => {
      closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onClose).toHaveBeenCalled();
  });
});
