import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { StreamFlowChart } from '../StreamFlowChart';

describe('StreamFlowChart empty state (#595)', () => {
  const baseProps = {
    startTime: 1700000000,
    endTime: 1700604000,
    ratePerSecond: 1000000n,
    withdrawn: 50000000n,
    withdrawable: 20000000n,
    paused: false,
    tokenSymbol: 'USDC',
  };

  it('shows a "no flow data yet" message for a stream that has not started', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const future = Math.floor(Date.now() / 1000) + 86_400;

    act(() => {
      root.render(
        <StreamFlowChart {...baseProps} startTime={future} endTime={future + 604_800} withdrawn={0n} withdrawable={0n} />,
      );
    });

    const empty = container.querySelector('[data-testid="stream-flow-empty"]');
    expect(empty).not.toBeNull();
    expect(empty?.getAttribute('role')).toBe('status');
    expect(container.textContent).toContain('No flow data yet');
    expect(container.querySelector('svg')).toBeNull();

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('shows the empty state when nothing has flowed (zero rate)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamFlowChart {...baseProps} ratePerSecond={0n} withdrawn={0n} withdrawable={0n} />);
    });

    expect(container.textContent).toContain('No flow data yet');
    expect(container.querySelector('svg')).toBeNull();

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('renders the chart, not the empty state, once tokens have flowed', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamFlowChart {...baseProps} />);
    });

    expect(container.querySelector('[data-testid="stream-flow-empty"]')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });
});
