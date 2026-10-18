import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { NetworkLatencyIndicator } from '../NetworkLatencyIndicator';

vi.mock('@/lib/env', () => ({
  getRpcUrl: vi.fn(() => 'https://soroban-testnet.stellar.org'),
}));

describe('NetworkLatencyIndicator', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('renders latency pill and ledger height with green styling when latency < 500ms', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, result: { sequence: 123456 } }),
      } as Response),
    );

    await act(async () => {
      root.render(React.createElement(NetworkLatencyIndicator));
    });

    const pill = container.querySelector('.latency-pill');
    expect(pill).not.toBeNull();
    expect(container.textContent).toContain('ms');
    expect(container.textContent).toContain('#123456');
    expect(pill?.className).toContain('text-green-700');
    mockFetch.mockRestore();
  });

  it('renders amber styling when latency > 2000ms', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      // Simulate delay > 2000ms using performance.now mock or setTimeout
      return {
        ok: true,
        json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, result: { sequence: 654321 } }),
      } as Response;
    });

    const perfSpy = vi.spyOn(performance, 'now');
    perfSpy.mockReturnValueOnce(1000).mockReturnValueOnce(3500);

    await act(async () => {
      root.render(React.createElement(NetworkLatencyIndicator));
    });

    const pill = container.querySelector('.latency-pill');
    expect(pill).not.toBeNull();
    expect(pill?.className).toContain('text-amber-700');
    expect(container.textContent).toContain('2500ms');

    perfSpy.mockRestore();
    mockFetch.mockRestore();
  });

  it('renders offline indicator when RPC fetch fails', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    await act(async () => {
      root.render(React.createElement(NetworkLatencyIndicator));
    });

    const pill = container.querySelector('.latency-pill');
    expect(pill).not.toBeNull();
    expect(container.textContent).toContain('offline');
    expect(pill?.className).toContain('text-red-700');
    mockFetch.mockRestore();
  });
});
