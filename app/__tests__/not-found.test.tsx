/**
 * not-found.tsx — render tests
 *
 * Coverage targets:
 *   1. Renders a "404" label.
 *   2. Renders a "Page not found" heading.
 *   3. Contains a link pointing to /dashboard.
 *   4. The dashboard link is visible and contains recognisable label text.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...rest }, children),
}));

import NotFound from '../not-found';

function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(React.createElement(NotFound)); });
  const cleanup = () => {
    act(() => { root.unmount(); });
    document.body.removeChild(container);
  };
  return { container, cleanup };
}

describe('NotFound page', () => {
  it('renders a 404 label', () => {
    const { container, cleanup } = render();
    expect(container.textContent).toContain('404');
    cleanup();
  });

  it('renders the "Page not found" heading', () => {
    const { container, cleanup } = render();
    expect(container.textContent).toContain('Page not found');
    cleanup();
  });

  it('renders a link back to /dashboard', () => {
    const { container, cleanup } = render();
    const link = container.querySelector('a[href="/dashboard"]');
    expect(link).not.toBeNull();
    cleanup();
  });

  it('dashboard link contains readable label text', () => {
    const { container, cleanup } = render();
    const link = container.querySelector('a[href="/dashboard"]') as HTMLAnchorElement;
    expect(link.textContent?.toLowerCase()).toContain('dashboard');
    cleanup();
  });
});
