/**
 * error.tsx — render tests
 *
 * Coverage targets:
 *   1. Renders an "Error" label and a heading.
 *   2. Contains a link pointing to /dashboard.
 *   3. The dashboard link has readable label text.
 *   4. Renders a "Try again" button that calls the reset callback.
 *   5. Optionally renders an error digest when provided.
 *   6. Does not crash when digest is absent.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...rest }, children),
}));

import GlobalError from '../error';

function render(props: { error: Error & { digest?: string }; reset: () => void }) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(React.createElement(GlobalError, props)); });
  const cleanup = () => {
    act(() => { root.unmount(); });
    document.body.removeChild(container);
  };
  return { container, cleanup };
}

describe('GlobalError page', () => {
  it('renders an "Error" label', () => {
    const { container, cleanup } = render({ error: new Error('boom'), reset: vi.fn() });
    expect(container.textContent?.toLowerCase()).toContain('error');
    cleanup();
  });

  it('renders a "Something went wrong" heading', () => {
    const { container, cleanup } = render({ error: new Error('boom'), reset: vi.fn() });
    expect(container.textContent).toContain('Something went wrong');
    cleanup();
  });

  it('renders a link back to /dashboard', () => {
    const { container, cleanup } = render({ error: new Error('boom'), reset: vi.fn() });
    const link = container.querySelector('a[href="/dashboard"]');
    expect(link).not.toBeNull();
    cleanup();
  });

  it('dashboard link contains readable label text', () => {
    const { container, cleanup } = render({ error: new Error('boom'), reset: vi.fn() });
    const link = container.querySelector('a[href="/dashboard"]') as HTMLAnchorElement;
    expect(link.textContent?.toLowerCase()).toContain('dashboard');
    cleanup();
  });

  it('renders a "Try again" button', () => {
    const { container, cleanup } = render({ error: new Error('boom'), reset: vi.fn() });
    const buttons = Array.from(container.querySelectorAll('button'));
    const tryAgain = buttons.find((b) => /try again/i.test(b.textContent ?? ''));
    expect(tryAgain).not.toBeUndefined();
    cleanup();
  });

  it('calls reset when the "Try again" button is clicked', () => {
    const reset = vi.fn();
    const { container, cleanup } = render({ error: new Error('boom'), reset });
    const buttons = Array.from(container.querySelectorAll('button'));
    const tryAgain = buttons.find((b) => /try again/i.test(b.textContent ?? ''))!;
    act(() => { tryAgain.click(); });
    expect(reset).toHaveBeenCalledOnce();
    cleanup();
  });

  it('renders the error digest when provided', () => {
    const err = Object.assign(new Error('boom'), { digest: 'abc123' });
    const { container, cleanup } = render({ error: err, reset: vi.fn() });
    expect(container.textContent).toContain('abc123');
    cleanup();
  });

  it('does not crash when no digest is provided', () => {
    const { container, cleanup } = render({ error: new Error('boom'), reset: vi.fn() });
    // Should not throw and should still render heading
    expect(container.textContent).toContain('Something went wrong');
    cleanup();
  });
});
