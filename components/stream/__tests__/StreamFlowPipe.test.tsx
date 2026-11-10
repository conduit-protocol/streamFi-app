import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { StreamFlowPipe } from '../StreamFlowPipe';

// jsdom doesn't implement canvas 2d context — stub a minimal one so the
// component's animation loop can run without throwing.
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    scale: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

function render(props: Partial<React.ComponentProps<typeof StreamFlowPipe>> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(<StreamFlowPipe active={true} progress={0.5} {...props} />);
  });
  return { container, root };
}

function cleanup(root: Root, container: HTMLElement) {
  act(() => {
    root.unmount();
  });
  document.body.removeChild(container);
}

describe('StreamFlowPipe (#778)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the canvas flow visualisation', () => {
    const { container, root } = render();
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();
    cleanup(root, container);
  });

  it('shows sender and recipient labels', () => {
    const { container, root } = render({
      senderLabel: 'GSEND…ER',
      recipientLabel: 'GREC…IP',
    });
    expect(container.textContent).toContain('GSEND…ER');
    expect(container.textContent).toContain('GREC…IP');
    cleanup(root, container);
  });

  it('shows Live status when active', () => {
    const { container, root } = render({ active: true });
    expect(container.textContent).toContain('Live');
    cleanup(root, container);
  });

  it('shows Idle status when not active', () => {
    const { container, root } = render({ active: false, progress: 0 });
    expect(container.textContent).toContain('Idle');
    cleanup(root, container);
  });

  it('exposes an accessible role and label', () => {
    const { container, root } = render({ active: true });
    const img = container.querySelector('[role="img"]');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('aria-label')).toMatch(/flow visualisation/i);
    cleanup(root, container);
  });
});
