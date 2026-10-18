import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CopyAddress } from './CopyAddress';

vi.mock('@/lib/clipboard', () => ({
  copyToClipboard: vi.fn(),
}));

import { copyToClipboard } from '@/lib/clipboard';

const mockCopyToClipboard = vi.mocked(copyToClipboard);

const ADDRESS = 'GDJJ5BHD3UQCAZWKNLYRXKZWTDONPUOWQYXJCFDWQYZTQSW7ACSG6HM3';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockCopyToClipboard.mockResolvedValue(true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
  vi.useRealTimers();
});

function render(ui: React.ReactElement) {
  act(() => { root.render(ui); });
}

async function click(button: HTMLButtonElement) {
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('CopyAddress', () => {
  it('renders the truncated address', () => {
    render(<CopyAddress address={ADDRESS} />);
    const button = container.querySelector('button')!;
    expect(button.textContent).toContain('GDJJ');
    expect(button.textContent).not.toBe(ADDRESS);
  });

  it('has an initial "Copy address" aria-label', () => {
    render(<CopyAddress address={ADDRESS} />);
    const button = container.querySelector('button')!;
    expect(button.getAttribute('aria-label')).toBe('Copy address');
  });

  it('calls copyToClipboard with the full address on click', async () => {
    render(<CopyAddress address={ADDRESS} />);
    const button = container.querySelector('button') as HTMLButtonElement;
    await click(button);
    expect(mockCopyToClipboard).toHaveBeenCalledWith(ADDRESS);
  });

  it('switches to the copied state after a successful copy', async () => {
    render(<CopyAddress address={ADDRESS} />);
    const button = container.querySelector('button') as HTMLButtonElement;
    await click(button);
    expect(button.getAttribute('aria-label')).toBe('Copied address');
  });

  it('resets back to the un-copied state after the timeout elapses', async () => {
    render(<CopyAddress address={ADDRESS} />);
    const button = container.querySelector('button') as HTMLButtonElement;
    await click(button);
    expect(button.getAttribute('aria-label')).toBe('Copied address');

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(button.getAttribute('aria-label')).toBe('Copy address');
  });

  it('does not enter the copied state when copyToClipboard fails', async () => {
    mockCopyToClipboard.mockResolvedValue(false);
    render(<CopyAddress address={ADDRESS} />);
    const button = container.querySelector('button') as HTMLButtonElement;
    await click(button);
    expect(button.getAttribute('aria-label')).toBe('Copy address');
  });

  it('prevents default and stops propagation on click (safe inside a clickable card)', async () => {
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <CopyAddress address={ADDRESS} />
      </div>,
    );
    const button = container.querySelector('button') as HTMLButtonElement;
    await click(button);
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('does not throw or update state when unmounted before the reset timeout fires', async () => {
    render(<CopyAddress address={ADDRESS} />);
    const button = container.querySelector('button') as HTMLButtonElement;
    await click(button);
    expect(button.getAttribute('aria-label')).toBe('Copied address');

    expect(() => {
      act(() => { root.unmount(); });
    }).not.toThrow();

    expect(() => {
      act(() => { vi.advanceTimersByTime(5000); });
    }).not.toThrow();
  });

  it('clears a pending timeout on unmount so it never fires', async () => {
    const clearSpy = vi.spyOn(global, 'clearTimeout');
    render(<CopyAddress address={ADDRESS} />);
    const button = container.querySelector('button') as HTMLButtonElement;
    await click(button);

    clearSpy.mockClear();
    act(() => { root.unmount(); });

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('applies a custom className alongside the default classes', () => {
    render(<CopyAddress address={ADDRESS} className="extra-class" />);
    const button = container.querySelector('button')!;
    expect(button.className).toContain('extra-class');
  });
});
