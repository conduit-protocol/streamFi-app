/**
 * CopyHashButton — unit tests
 *
 * Coverage targets:
 *   1. Renders a button with the default (unclicked) label/aria-label.
 *   2. Clicking calls copyToClipboard with the given hash.
 *   3. On successful copy, switches to the "Copied!" state (icon + label).
 *   4. Reverts to the default state after the 2s timeout elapses.
 *   5. On failed copy, stays in the default state.
 *   6. className passthrough — extra classes are appended to the wrapper button.
 *   7. Does not update state after unmount (no act warnings / errors).
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CopyHashButton } from './CopyHashButton';

vi.mock('@/lib/clipboard', () => ({
  copyToClipboard: vi.fn(),
}));

import { copyToClipboard } from '@/lib/clipboard';

// ── Helpers ────────────────────────────────────────────────────────────────────

function render(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  const button = () => container.querySelector('button') as HTMLButtonElement;
  const cleanup = () => {
    act(() => { root.unmount(); });
    document.body.removeChild(container);
  };
  return { container, button, cleanup, root };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(copyToClipboard).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('CopyHashButton — default state', () => {
  it('renders a button with the default aria-label and title', () => {
    const { button, cleanup } = render(<CopyHashButton hash="0xabc123" />);
    expect(button().getAttribute('aria-label')).toBe('Copy transaction hash');
    expect(button().getAttribute('title')).toBe('Copy transaction hash');
    cleanup();
  });

  it('renders the copy icon svg', () => {
    const { button, cleanup } = render(<CopyHashButton hash="0xabc123" />);
    expect(button().querySelector('svg')).not.toBeNull();
    cleanup();
  });
});

describe('CopyHashButton — copy interaction', () => {
  it('calls copyToClipboard with the hash on click', async () => {
    vi.mocked(copyToClipboard).mockResolvedValue(true);
    const { button, cleanup } = render(<CopyHashButton hash="0xdeadbeef" />);

    await act(async () => { button().click(); });

    expect(copyToClipboard).toHaveBeenCalledWith('0xdeadbeef');
    cleanup();
  });

  it('switches to the "Copied!" state after a successful copy', async () => {
    vi.mocked(copyToClipboard).mockResolvedValue(true);
    const { button, cleanup } = render(<CopyHashButton hash="0xdeadbeef" />);

    await act(async () => { button().click(); });

    expect(button().getAttribute('aria-label')).toBe('Copied!');
    expect(button().getAttribute('title')).toBe('Copied!');
    cleanup();
  });

  it('reverts to the default state after the 2s timeout', async () => {
    vi.mocked(copyToClipboard).mockResolvedValue(true);
    const { button, cleanup } = render(<CopyHashButton hash="0xdeadbeef" />);

    await act(async () => { button().click(); });
    expect(button().getAttribute('aria-label')).toBe('Copied!');

    await act(async () => { vi.advanceTimersByTime(2000); });

    expect(button().getAttribute('aria-label')).toBe('Copy transaction hash');
    cleanup();
  });

  it('stays in the default state when copy fails', async () => {
    vi.mocked(copyToClipboard).mockResolvedValue(false);
    const { button, cleanup } = render(<CopyHashButton hash="0xdeadbeef" />);

    await act(async () => { button().click(); });

    expect(button().getAttribute('aria-label')).toBe('Copy transaction hash');
    cleanup();
  });

  it('clears a pending timeout when clicked again before it fires', async () => {
    vi.mocked(copyToClipboard).mockResolvedValue(true);
    const { button, cleanup } = render(<CopyHashButton hash="0xdeadbeef" />);

    await act(async () => { button().click(); });
    await act(async () => { vi.advanceTimersByTime(1000); });
    await act(async () => { button().click(); }); // reset the 2s window
    await act(async () => { vi.advanceTimersByTime(1500); });

    // Still copied — the second click's timer hasn't elapsed yet.
    expect(button().getAttribute('aria-label')).toBe('Copied!');
    cleanup();
  });
});

describe('CopyHashButton — className passthrough', () => {
  it('appends extra className to the button', () => {
    const { button, cleanup } = render(
      <CopyHashButton hash="0xabc" className="ml-2 custom-class" />,
    );
    expect(button().className).toContain('ml-2');
    expect(button().className).toContain('custom-class');
    cleanup();
  });
});

describe('CopyHashButton — unmount safety', () => {
  it('does not throw when the copy resolves after unmount', async () => {
    let resolveCopy: (value: boolean) => void = () => {};
    vi.mocked(copyToClipboard).mockReturnValue(
      new Promise<boolean>(resolve => { resolveCopy = resolve; }),
    );
    const { button, cleanup } = render(<CopyHashButton hash="0xdeadbeef" />);

    act(() => { button().click(); });
    cleanup();

    await act(async () => { resolveCopy(true); });
    // No assertion needed — the test fails only if React logs a state
    // update on an unmounted component or the resolution throws.
  });
});
