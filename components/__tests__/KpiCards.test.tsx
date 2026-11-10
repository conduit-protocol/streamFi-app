import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { KpiCards } from '../dashboard/KpiCards';

describe('KpiCards (#685) — summary KPI cards', () => {
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
        React.createElement(KpiCards, {
          totalValueStreamed: 1_250_0000000n, // 1250.00
          activeRunRate: 1_0000000n, // 0.10/s → 3600.00 per hour
          activeStreamCount: 3,
          totalStreamCount: 5,
          ...overrides,
        }),
      );
    });
  }

  it('renders Total Value Streamed and an hourly Active Run Rate', () => {
    render();

    const total = container.querySelector(
      '[data-testid="kpi-total-value-streamed"]',
    );
    const rate = container.querySelector('[data-testid="kpi-active-run-rate"]');

    expect(container.querySelector('[data-testid="kpi-cards"]')).not.toBeNull();

    expect(total?.textContent).toContain('Total value streamed');
    expect(total?.textContent).toContain('1250.00');
    expect(total?.textContent).toContain('Across 5 streams');

    // The burn rate is expressed per hour, not per second (#685).
    expect(rate?.textContent).toContain('Active run rate');
    expect(rate?.textContent).toContain('3600.00');
    expect(rate?.textContent).toContain('/ hour');
    expect(rate?.textContent).toContain('Across 3 active streams');
  });

  it('shows em dashes while the wallet is disconnected', () => {
    render({ connected: false });

    const total = container.querySelector(
      '[data-testid="kpi-total-value-streamed"]',
    );
    expect(total?.textContent).toContain('—');
    expect(total?.textContent).not.toContain('1250.00');
  });

  it('shows an ellipsis while streams are loading', () => {
    render({ loading: true });

    const rate = container.querySelector('[data-testid="kpi-active-run-rate"]');
    expect(rate?.textContent).toContain('…');
    expect(rate?.textContent).not.toContain('/ hour');
  });

  it('notes when there are no active streams backing the run rate', () => {
    render({ activeStreamCount: 0, activeRunRate: 0n });

    const rate = container.querySelector('[data-testid="kpi-active-run-rate"]');
    expect(rate?.textContent).toContain('No active streams');
    expect(rate?.textContent).toContain('0.00');
  });
});