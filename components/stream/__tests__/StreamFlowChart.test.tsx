import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { StreamFlowChart } from '../StreamFlowChart';

describe('StreamFlowChart', () => {
  const baseProps = {
    startTime: 1700000000,
    endTime: 1700604000,
    ratePerSecond: 1000000n,
    withdrawn: 50000000n,
    withdrawable: 20000000n,
    paused: false,
    tokenSymbol: 'USDC',
  };

  it('renders SVG chart element and text elements', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamFlowChart {...baseProps} />);
    });

    expect(container.textContent).toContain('Stream Flow Trajectory');
    expect(container.textContent).toContain('USDC');

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();

    const paths = container.querySelectorAll('path');
    expect(paths.length).toBeGreaterThanOrEqual(2);

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('renders the flow line without a hardcoded hue when the stream is paused', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamFlowChart {...baseProps} paused={true} pausedAt={1700200000} />);
    });

    // #313 — paused/active no longer differ by hardcoded hue (hex or rgb());
    // the flow line always uses currentColor (black/white via design-system
    // classes), and the "Paused" tooltip label is the only signal of state.
    expect(container.querySelector('path[stroke="currentColor"]')).not.toBeNull();
    expect(container.querySelector('path[stroke="#f59e0b"]')).toBeNull();
    expect(container.querySelector('path[stroke="#3b82f6"]')).toBeNull();
    expect(container.querySelector('path[stroke="rgb(245 158 11)"]')).toBeNull();
    expect(container.querySelector('path[stroke="rgb(59 130 246)"]')).toBeNull();

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });
});
