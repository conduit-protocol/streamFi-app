/**
 * NetworkBadge — unit tests (#559)
 *
 * Coverage:
 *   1. Renders the network label for every non-mainnet network.
 *   2. Renders nothing on mainnet.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, afterEach } from 'vitest';
import { NetworkBadge } from '../NetworkBadge';
import { NETWORKS } from '@/lib/network-config';

function render(network: (typeof NETWORKS)[keyof typeof NETWORKS]) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<NetworkBadge network={network} />);
  });
  const cleanup = () => {
    act(() => root.unmount());
    container.remove();
  };
  return { container, cleanup };
}

describe('NetworkBadge', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows the testnet label when connected to testnet', () => {
    const { container, cleanup } = render(NETWORKS.testnet);
    expect(container.textContent).toBe('Testnet');
    expect(container.querySelector('span')).toBeTruthy();
    cleanup();
  });

  it('shows the local-standalone label when connected to local', () => {
    const { container, cleanup } = render(NETWORKS.local);
    expect(container.textContent).toBe('Local standalone');
    cleanup();
  });

  it('renders nothing when connected to mainnet', () => {
    const { container, cleanup } = render(NETWORKS.mainnet);
    expect(container.textContent).toBe('');
    expect(container.querySelector('span')).toBeNull();
    cleanup();
  });
});
