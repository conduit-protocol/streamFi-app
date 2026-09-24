/**
 * Badge — unit tests
 *
 * Coverage targets (per acceptance criteria):
 *   1. Each status variant renders with its correct CSS class.
 *   2. Label mapping — each status is displayed with its first letter uppercased.
 *   3. Renders a <span> element (not a div or button).
 *   4. No extra class leakage — each variant carries exactly its own badge class.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Badge } from './Badge';

// ── Helpers ────────────────────────────────────────────────────────────────────

type Status = 'active' | 'paused' | 'ended' | 'cancelled';

function render(status: Status) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<Badge status={status} />); });
  const span = () => container.querySelector('span') as HTMLSpanElement;
  const cleanup = () => {
    act(() => { root.unmount(); });
    document.body.removeChild(container);
  };
  return { container, span, cleanup };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Badge — element type', () => {
  it('renders a <span> element', () => {
    const { span, cleanup } = render('active');
    expect(span().tagName.toLowerCase()).toBe('span');
    cleanup();
  });
});

describe('Badge — variant: active', () => {
  it('applies the badge-active CSS class', () => {
    const { span, cleanup } = render('active');
    expect(span().className).toContain('badge-active');
    cleanup();
  });

  it('displays the label "Active"', () => {
    const { container, cleanup } = render('active');
    expect(container.textContent).toBe('Active');
    cleanup();
  });

  it('does not apply other badge variant classes', () => {
    const { span, cleanup } = render('active');
    expect(span().className).not.toContain('badge-paused');
    expect(span().className).not.toContain('badge-ended');
    expect(span().className).not.toContain('badge-cancelled');
    cleanup();
  });
});

describe('Badge — variant: paused', () => {
  it('applies the badge-paused CSS class', () => {
    const { span, cleanup } = render('paused');
    expect(span().className).toContain('badge-paused');
    cleanup();
  });

  it('displays the label "Paused"', () => {
    const { container, cleanup } = render('paused');
    expect(container.textContent).toBe('Paused');
    cleanup();
  });

  it('does not apply other badge variant classes', () => {
    const { span, cleanup } = render('paused');
    expect(span().className).not.toContain('badge-active');
    expect(span().className).not.toContain('badge-ended');
    expect(span().className).not.toContain('badge-cancelled');
    cleanup();
  });
});

describe('Badge — variant: ended', () => {
  it('applies the badge-ended CSS class', () => {
    const { span, cleanup } = render('ended');
    expect(span().className).toContain('badge-ended');
    cleanup();
  });

  it('displays the label "Ended"', () => {
    const { container, cleanup } = render('ended');
    expect(container.textContent).toBe('Ended');
    cleanup();
  });

  it('does not apply other badge variant classes', () => {
    const { span, cleanup } = render('ended');
    expect(span().className).not.toContain('badge-active');
    expect(span().className).not.toContain('badge-paused');
    expect(span().className).not.toContain('badge-cancelled');
    cleanup();
  });
});

describe('Badge — variant: cancelled', () => {
  it('applies the badge-cancelled CSS class', () => {
    const { span, cleanup } = render('cancelled');
    expect(span().className).toContain('badge-cancelled');
    cleanup();
  });

  it('displays the label "Cancelled"', () => {
    const { container, cleanup } = render('cancelled');
    expect(container.textContent).toBe('Cancelled');
    cleanup();
  });

  it('does not apply other badge variant classes', () => {
    const { span, cleanup } = render('cancelled');
    expect(span().className).not.toContain('badge-active');
    expect(span().className).not.toContain('badge-paused');
    expect(span().className).not.toContain('badge-ended');
    cleanup();
  });
});

describe('Badge — label capitalisation', () => {
  const cases: { status: Status; label: string }[] = [
    { status: 'active',    label: 'Active' },
    { status: 'paused',    label: 'Paused' },
    { status: 'ended',     label: 'Ended' },
    { status: 'cancelled', label: 'Cancelled' },
  ];

  for (const { status, label } of cases) {
    it(`capitalises "${status}" → "${label}"`, () => {
      const { container, cleanup } = render(status);
      expect(container.textContent).toBe(label);
      cleanup();
    });
  }
});
