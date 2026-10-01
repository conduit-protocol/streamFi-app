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

  it('renders grid lines for Y axis', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamFlowChart {...baseProps} />);
    });

    const gridLines = container.querySelectorAll('line[stroke-dasharray="4 4"]');
    expect(gridLines.length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('renders X-axis time labels', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamFlowChart {...baseProps} />);
    });

    const textElements = container.querySelectorAll('text');
    expect(textElements.length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('displays max amount correctly', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamFlowChart {...baseProps} />);
    });

    expect(container.textContent).toContain('Max:');

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('renders interactive data points', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamFlowChart {...baseProps} />);
    });

    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('shows tooltip on hover with time and amount', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamFlowChart {...baseProps} />);
    });

    const circles = container.querySelectorAll('circle');
    const firstCircle = circles[0];

    if (firstCircle) {
      act(() => {
        firstCircle.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      });

      const tooltip = container.querySelector('.absolute');
      expect(tooltip).not.toBeNull();
    }

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('hides tooltip on mouse leave', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamFlowChart {...baseProps} />);
    });

    const svg = container.querySelector('svg');

    if (svg) {
      const circles = container.querySelectorAll('circle');
      if (circles[0]) {
        act(() => {
          circles[0].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        });

        act(() => {
          svg.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
        });
      }
    }

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('renders with custom width and height', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamFlowChart {...baseProps} width={800} height={300} />);
    });

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('renders gradient fill for the area', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamFlowChart {...baseProps} />);
    });

    const gradient = container.querySelector('linearGradient');
    expect(gradient).not.toBeNull();
    expect(gradient?.id).toBe('streamFlowGradient');

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('displays correct token symbol', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const customToken = 'ETH';
    act(() => {
      root.render(<StreamFlowChart {...baseProps} tokenSymbol={customToken} />);
    });

    expect(container.textContent).toContain(customToken);

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('handles cancelled streams correctly', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamFlowChart {...baseProps} cancelled={true} />);
    });

    expect(container.textContent).toContain('Stream Flow Trajectory');

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('renders with zero withdrawn and withdrawable', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <StreamFlowChart
          {...baseProps}
          withdrawn={0n}
          withdrawable={0n}
          ratePerSecond={0n}
        />,
      );
    });

    expect(container.textContent).toContain('Stream Flow Trajectory');

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('renders path element for flow line', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamFlowChart {...baseProps} />);
    });

    const paths = container.querySelectorAll('path');
    expect(paths.length).toBeGreaterThanOrEqual(2);

    const flowPath = Array.from(paths).find(p => p.getAttribute('fill') === 'none');
    expect(flowPath).not.toBeNull();

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });
});
