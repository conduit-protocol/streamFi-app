import React, { act } from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { NetworkTroubleBanner } from '../NetworkTroubleBanner';
import {
  reportRpcFailure,
  reportRpcSuccess,
  resetNetworkStatus,
} from '@/lib/network-status';

function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root };
}

describe('NetworkTroubleBanner', () => {
  beforeEach(() => {
    resetNetworkStatus();
  });

  it('renders nothing while the network is healthy', () => {
    const { container, root } = render();
    act(() => root.render(<NetworkTroubleBanner />));
    expect(container.textContent).toBe('');
    act(() => root.unmount());
    container.remove();
  });

  it('appears once an RPC failure is reported', () => {
    const { container, root } = render();
    act(() => root.render(<NetworkTroubleBanner />));

    act(() => reportRpcFailure());
    expect(container.textContent).toContain('trouble reaching the network');

    act(() => root.unmount());
    container.remove();
  });

  it('can be dismissed and stays hidden for the same outage', () => {
    const { container, root } = render();
    act(() => root.render(<NetworkTroubleBanner />));
    act(() => reportRpcFailure());

    const button = container.querySelector('button')!;
    act(() => button.click());
    expect(container.textContent).toBe('');

    // Still the same outage — a repeated failure report must not resurrect it.
    act(() => reportRpcFailure());
    expect(container.textContent).toBe('');

    act(() => root.unmount());
    container.remove();
  });

  it('reappears for a fresh outage after recovery', () => {
    const { container, root } = render();
    act(() => root.render(<NetworkTroubleBanner />));

    act(() => reportRpcFailure());
    const button = container.querySelector('button')!;
    act(() => button.click());
    expect(container.textContent).toBe('');

    act(() => reportRpcSuccess());
    act(() => reportRpcFailure());
    expect(container.textContent).toContain('trouble reaching the network');

    act(() => root.unmount());
    container.remove();
  });
});
