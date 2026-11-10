import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { StreamPreviewChart } from '../stream/StreamPreviewChart';

const DURATION_30D = 30 * 86400;

/** datetime-local value `days` from now (cliff input format). */
function cliffIn(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 16);
}

describe('StreamPreviewChart (#684) — projected accrual preview', () => {
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
  });

  function render(overrides: Record<string, unknown> = {}) {
    act(() => {
      root.render(
        React.createElement(StreamPreviewChart, {
          depositAmount: '1000',
          durationSeconds: DURATION_30D,
          cliffDate: null,
          tokenSymbol: 'XLM',
          decimals: 7,
          ...overrides,
        }),
      );
    });
  }

  it('renders the accrual curve with rate/total footer and a summary label', () => {
    render();

    const chart = container.querySelector('[data-testid="stream-preview-chart"]');
    expect(chart).not.toBeNull();
    expect(chart?.getAttribute('role')).toBe('img');

    // aria-label carries the full projection for screen readers.
    const label = chart?.getAttribute('aria-label') ?? '';
    expect(label).toContain('Projected balance accrual');
    expect(label).toContain('1000.00 XLM');
    expect(label).toContain('per day');

    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.textContent).toContain('Rate:');
    expect(container.textContent).toContain('33.33312 XLM/day'); // floor(1000e7 / 30d) * 86400
    expect(container.textContent).toContain('Total:');
    expect(container.textContent).toContain('No cliff');
    expect(container.textContent).not.toContain('Cliff unlock:');
  });

  it('draws the cliff marker and unlock jump when a cliff is set', () => {
    render({ cliffDate: cliffIn(15) });

    const label =
      container
        .querySelector('[data-testid="stream-preview-chart"]')
        ?.getAttribute('aria-label') ?? '';
    expect(label).toContain('cliff first unlocks');

    expect(container.textContent).toContain('Cliff unlock:');
    expect(container.textContent).toContain('+');
    expect(container.textContent).not.toContain('No cliff');
  });

  it('renders nothing for an invalid deposit', () => {
    render({ depositAmount: 'abc' });
    expect(
      container.querySelector('[data-testid="stream-preview-chart"]'),
    ).toBeNull();
  });

  it('renders nothing for a zero-rate deposit (blocked at submit anyway)', () => {
    render({ depositAmount: '0' });
    expect(
      container.querySelector('[data-testid="stream-preview-chart"]'),
    ).toBeNull();
  });

  it('shows a hover tooltip with the projected balance at the cursor', () => {
    render();

    const svg = container.querySelector('svg')!;
    // jsdom reports a zero-size box; pretend the 640×220 viewBox maps 1:1.
    svg.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 640,
        bottom: 220,
        width: 640,
        height: 220,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    act(() => {
      svg.dispatchEvent(
        new MouseEvent('mousemove', { clientX: 400, clientY: 100, bubbles: true }),
      );
    });

    const tip = container.querySelector('[data-testid="preview-tooltip"]');
    expect(tip).not.toBeNull();
    expect(tip?.textContent).toContain('XLM');
  });
});