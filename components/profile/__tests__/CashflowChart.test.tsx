import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { CashflowChart } from '../CashflowChart';
import type { DailyFlow } from '@/lib/profile-analytics';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

const mockDaily: DailyFlow[] = [
  {
    dayStart: 1700000000000,
    label: 'Oct 1',
    incoming: 10000000n, // 1 token
    outgoing: 5000000n,  // 0.5 token
  },
  {
    dayStart: 1700086400000,
    label: 'Oct 2',
    incoming: 20000000n, // 2 tokens
    outgoing: 0n,
  },
  {
    dayStart: 1700172800000,
    label: 'Oct 3',
    incoming: 0n,
    outgoing: 15000000n, // 1.5 tokens
  },
];

describe('CashflowChart (#820)', () => {
  it('renders empty status when no streaming activity exists', () => {
    const emptyDaily: DailyFlow[] = [
      { dayStart: 1700000000000, label: 'Oct 1', incoming: 0n, outgoing: 0n },
    ];

    act(() => {
      root.render(<CashflowChart daily={emptyDaily} />);
    });

    expect(container.querySelector('[data-testid="cashflow-empty"]')).not.toBeNull();
    expect(container.textContent).toContain('No streaming activity yet');
  });

  it('renders Daily Bars view by default with toggle buttons', () => {
    act(() => {
      root.render(<CashflowChart daily={mockDaily} />);
    });

    expect(container.querySelector('[data-testid="cashflow-chart"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="cashflow-bars-view"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="cashflow-area-view"]')).toBeNull();

    const areaBtn = container.querySelector('[data-testid="toggle-view-area"]');
    const barsBtn = container.querySelector('[data-testid="toggle-view-bars"]');
    expect(areaBtn).not.toBeNull();
    expect(barsBtn).not.toBeNull();
    expect(areaBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(barsBtn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('toggles between Daily Bars and Area chart when clicking view buttons', () => {
    act(() => {
      root.render(<CashflowChart daily={mockDaily} />);
    });

    const areaBtn = container.querySelector('[data-testid="toggle-view-area"]') as HTMLButtonElement;
    const barsBtn = container.querySelector('[data-testid="toggle-view-bars"]') as HTMLButtonElement;

    // Switch to Area view
    act(() => {
      areaBtn.click();
    });

    expect(container.querySelector('[data-testid="cashflow-area-view"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="cashflow-bars-view"]')).toBeNull();
    expect(areaBtn.getAttribute('aria-pressed')).toBe('true');
    expect(barsBtn.getAttribute('aria-pressed')).toBe('false');

    // Verify SVG paths in Area view
    const svgPaths = container.querySelectorAll('[data-testid="cashflow-area-view"] svg path');
    expect(svgPaths.length).toBeGreaterThanOrEqual(2);

    // Switch back to Daily Bars view
    act(() => {
      barsBtn.click();
    });

    expect(container.querySelector('[data-testid="cashflow-bars-view"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="cashflow-area-view"]')).toBeNull();
    expect(barsBtn.getAttribute('aria-pressed')).toBe('true');
    expect(areaBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('supports initialView="area" prop', () => {
    act(() => {
      root.render(<CashflowChart daily={mockDaily} initialView="area" />);
    });

    expect(container.querySelector('[data-testid="cashflow-area-view"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="cashflow-bars-view"]')).toBeNull();
  });
});
