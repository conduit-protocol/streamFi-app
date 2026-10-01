import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { CircuitBreakerOverlay } from './CircuitBreakerOverlay';

const mockGetCircuitBreakerStates = vi.fn();

vi.mock('@/lib/soroban', () => ({
  getCircuitBreakerStates: (...args: unknown[]) => mockGetCircuitBreakerStates(...args),
}));

// Scope keys follow the `${rpcUrl}::${scope}` format from ADR-008: reads and
// writes are isolated so a failing read-only simulation can't block a write.
const READ_SCOPE = 'https://soroban-testnet.stellar.org::reads';
const WRITE_SCOPE = 'https://soroban-testnet.stellar.org::writes';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.useFakeTimers();
  mockGetCircuitBreakerStates.mockReturnValue([]);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    try {
      root.unmount();
    } catch {
      // already unmounted by the test itself
    }
  });
  container.remove();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('CircuitBreakerOverlay', () => {
  it('renders nothing when no breaker scope has recorded any state', () => {
    act(() => {
      root.render(<CircuitBreakerOverlay />);
    });
    expect(container.innerHTML).toBe('');
  });

  it('shows an open scope as OPEN with the remaining seconds', () => {
    mockGetCircuitBreakerStates.mockReturnValue([
      {
        scope: WRITE_SCOPE,
        consecutiveFailures: 3,
        circuitOpenUntil: Date.now() + 13_000,
        isOpen: true,
        remainingMs: 13_000,
      },
    ]);

    act(() => {
      root.render(<CircuitBreakerOverlay />);
    });

    expect(container.textContent).toContain(WRITE_SCOPE);
    expect(container.textContent).toContain('OPEN (13s)');
  });

  it('shows a closed scope with its consecutive failure count', () => {
    mockGetCircuitBreakerStates.mockReturnValue([
      {
        scope: READ_SCOPE,
        consecutiveFailures: 1,
        circuitOpenUntil: 0,
        isOpen: false,
        remainingMs: 0,
      },
    ]);

    act(() => {
      root.render(<CircuitBreakerOverlay />);
    });

    expect(container.textContent).toContain('closed (1)');
  });

  it('renders read and write scopes independently, matching ADR-008 scoping', () => {
    mockGetCircuitBreakerStates.mockReturnValue([
      {
        scope: READ_SCOPE,
        consecutiveFailures: 3,
        circuitOpenUntil: Date.now() + 10_000,
        isOpen: true,
        remainingMs: 10_000,
      },
      {
        scope: WRITE_SCOPE,
        consecutiveFailures: 0,
        circuitOpenUntil: 0,
        isOpen: false,
        remainingMs: 0,
      },
    ]);

    act(() => {
      root.render(<CircuitBreakerOverlay />);
    });

    expect(container.textContent).toContain(READ_SCOPE);
    expect(container.textContent).toContain(WRITE_SCOPE);
  });

  it('polls for updated breaker state every second and re-renders on change', () => {
    act(() => {
      root.render(<CircuitBreakerOverlay />);
    });
    expect(mockGetCircuitBreakerStates).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).toBe('');

    mockGetCircuitBreakerStates.mockReturnValue([
      {
        scope: READ_SCOPE,
        consecutiveFailures: 3,
        circuitOpenUntil: Date.now() + 10_000,
        isOpen: true,
        remainingMs: 10_000,
      },
    ]);
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(mockGetCircuitBreakerStates).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain(READ_SCOPE);
  });

  it('clears the polling interval on unmount', () => {
    act(() => {
      root.render(<CircuitBreakerOverlay />);
    });
    const callsBeforeUnmount = mockGetCircuitBreakerStates.mock.calls.length;

    act(() => {
      root.unmount();
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(mockGetCircuitBreakerStates.mock.calls.length).toBe(callsBeforeUnmount);
  });
});
