import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { ConnectButton } from '../ConnectButton';

/**
 * Test coverage for ConnectButton.tsx (issue #326).
 *
 * Tests the real logic worth regression-testing:
 * - 20s connect timeout safety net that force-clears "Connecting…" state
 * - Error message rendering from a thrown connect() rejection
 */

// Mock the wallet context
const mockWalletContext = {
  connected: false,
  connecting: false,
  publicKey: null,
  walletName: null,
  connect: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock('@/contexts/WalletContext', () => ({
  useWallet: () => mockWalletContext,
}));

// Mock format utilities
vi.mock('@/lib/format', () => ({
  truncateAddress: (addr: string) => `${addr.slice(0, 4)}…${addr.slice(-4)}`,
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  LogOut: ({ className }: any) => React.createElement('span', { className, 'data-testid': 'logout-icon' }, 'X'),
}));

describe('ConnectButton', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    
    // Reset mock state
    mockWalletContext.connected = false;
    mockWalletContext.connecting = false;
    mockWalletContext.publicKey = null;
    mockWalletContext.walletName = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders "Connect wallet" button when disconnected', () => {
    act(() => {
      root.render(React.createElement(ConnectButton));
    });

    const button = container.querySelector('button');
    expect(button?.textContent).toBe('Connect wallet');
  });

  it('shows "Connecting…" state while connecting', () => {
    mockWalletContext.connecting = true;

    act(() => {
      root.render(React.createElement(ConnectButton));
    });

    const button = container.querySelector('button');
    expect(button?.textContent).toBe('Connecting…');
    expect(button?.disabled).toBe(true);
    expect(button?.getAttribute('aria-busy')).toBe('true');
  });

  it('shows disconnect button and address when connected', () => {
    mockWalletContext.connected = true;
    mockWalletContext.publicKey = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOP';
    mockWalletContext.walletName = 'Freighter';

    act(() => {
      root.render(React.createElement(ConnectButton));
    });

    expect(container.textContent).toContain('GABC…MNOP');
    expect(container.textContent).toContain('Disconnect');
    
    const button = container.querySelector('button');
    expect(button?.getAttribute('title')).toBe('Disconnect Freighter');
  });

  it('calls connect() when connect button is clicked', async () => {
    mockWalletContext.connect.mockResolvedValue(undefined);

    act(() => {
      root.render(React.createElement(ConnectButton));
    });

    const button = container.querySelector('button');
    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockWalletContext.connect).toHaveBeenCalledTimes(1);
  });

  it('calls disconnect() when disconnect button is clicked', async () => {
    mockWalletContext.connected = true;
    mockWalletContext.publicKey = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOP';

    act(() => {
      root.render(React.createElement(ConnectButton));
    });

    const button = container.querySelector('button');
    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockWalletContext.disconnect).toHaveBeenCalledTimes(1);
  });

  it('displays error message when connect() throws an Error', async () => {
    mockWalletContext.connect.mockRejectedValue(new Error('User rejected the connection'));

    act(() => {
      root.render(React.createElement(ConnectButton));
    });

    const button = container.querySelector('button');
    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const errorText = container.querySelector('[role="alert"]');
    expect(errorText?.textContent).toBe('User rejected the connection');
    expect(errorText?.getAttribute('aria-live')).toBe('polite');
  });

  it('displays generic error message when connect() throws a non-Error', async () => {
    mockWalletContext.connect.mockRejectedValue('some string error');

    act(() => {
      root.render(React.createElement(ConnectButton));
    });

    const button = container.querySelector('button');
    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const errorText = container.querySelector('[role="alert"]');
    expect(errorText?.textContent).toBe('Failed to connect wallet.');
  });

  it('clears error message when connect button is clicked again', async () => {
    mockWalletContext.connect
      .mockRejectedValueOnce(new Error('First error'))
      .mockResolvedValueOnce(undefined);

    act(() => {
      root.render(React.createElement(ConnectButton));
    });

    const button = container.querySelector('button');

    // First attempt fails
    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe('First error');

    // Second attempt should clear error
    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows timeout error if connecting state persists for 20s', async () => {
    vi.useFakeTimers();
    mockWalletContext.connecting = true;

    act(() => {
      root.render(React.createElement(ConnectButton));
    });

    expect(container.textContent).toBe('Connecting…');

    // Fast-forward 20 seconds
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });

    const errorText = container.querySelector('[role="alert"]');
    expect(errorText?.textContent).toBe('Connection timed out. Please try again.');

    vi.useRealTimers();
  });

  it('clears timeout timer when connecting becomes false', async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

    mockWalletContext.connecting = true;

    act(() => {
      root.render(React.createElement(ConnectButton));
    });

    // Change connecting to false
    mockWalletContext.connecting = false;
    mockWalletContext.connected = true;
    mockWalletContext.publicKey = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOP';

    act(() => {
      root.render(React.createElement(ConnectButton));
    });

    expect(clearTimeoutSpy).toHaveBeenCalled();

    vi.useRealTimers();
    clearTimeoutSpy.mockRestore();
  });

  it('does not show timeout error if connecting completes before 20s', async () => {
    vi.useFakeTimers();
    mockWalletContext.connecting = true;

    act(() => {
      root.render(React.createElement(ConnectButton));
    });

    // Fast-forward 10 seconds (halfway)
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });

    // Connection completes
    mockWalletContext.connecting = false;
    mockWalletContext.connected = true;
    mockWalletContext.publicKey = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOP';

    act(() => {
      root.render(React.createElement(ConnectButton));
    });

    // Fast-forward another 15 seconds (total 25s, past the timeout)
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });

    // Should not show timeout error since connection completed
    expect(container.querySelector('[role="alert"]')).toBeNull();

    vi.useRealTimers();
  });

  it('calculates remaining timeout correctly if connecting is toggled rapidly', async () => {
    vi.useFakeTimers();

    // Start connecting
    mockWalletContext.connecting = true;
    act(() => {
      root.render(React.createElement(ConnectButton));
    });

    // Wait 5 seconds
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });

    // Toggle off then on again (simulating a retry)
    mockWalletContext.connecting = false;
    act(() => {
      root.render(React.createElement(ConnectButton));
    });

    mockWalletContext.connecting = true;
    act(() => {
      root.render(React.createElement(ConnectButton));
    });

    // The timeout should restart from the new connectStartRef
    await act(async () => {
      vi.advanceTimersByTime(19_000);
    });

    // Should not timeout yet (only 19s since second connect start)
    expect(container.querySelector('[role="alert"]')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });

    // Now it should timeout (21s total since second start)
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Connection timed out. Please try again.');

    vi.useRealTimers();
  });
});
