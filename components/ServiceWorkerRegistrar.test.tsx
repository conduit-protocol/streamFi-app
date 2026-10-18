import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { waitFor } from '@testing-library/react';

const originalNavigator = global.navigator;

function setNavigator(value: unknown) {
  Object.defineProperty(global, 'navigator', {
    value,
    configurable: true,
  });
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.resetModules();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  setNavigator(originalNavigator);
  vi.restoreAllMocks();
});

describe('ServiceWorkerRegistrar', () => {
  it('renders nothing to the DOM', async () => {
    setNavigator({});
    const { ServiceWorkerRegistrar } = await import('./ServiceWorkerRegistrar');

    act(() => {
      root.render(<ServiceWorkerRegistrar />);
    });

    expect(container.innerHTML).toBe('');
  });

  it('does not attempt registration when the Service Worker API is unsupported', async () => {
    const registerMock = vi.fn();
    // No `serviceWorker` property at all — matches a real unsupported
    // browser, unlike `{ serviceWorker: undefined }` which still satisfies
    // the hook's `'serviceWorker' in navigator` guard.
    setNavigator({});
    const { ServiceWorkerRegistrar } = await import('./ServiceWorkerRegistrar');

    expect(() => {
      act(() => {
        root.render(<ServiceWorkerRegistrar />);
      });
    }).not.toThrow();
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('registers /sw.js on mount when the Service Worker API is supported', async () => {
    const registerMock = vi.fn().mockResolvedValue({
      installing: null,
      waiting: null,
      addEventListener: vi.fn(),
    });
    setNavigator({
      serviceWorker: {
        register: registerMock,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        controller: null,
      },
    });

    const { ServiceWorkerRegistrar } = await import('./ServiceWorkerRegistrar');
    await act(async () => {
      root.render(<ServiceWorkerRegistrar />);
    });

    expect(registerMock).toHaveBeenCalledWith('/sw.js');
  });

  it('logs and swallows the error when registration fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const registrationError = new Error('registration boom');
    const registerMock = vi.fn().mockRejectedValue(registrationError);
    setNavigator({
      serviceWorker: {
        register: registerMock,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        controller: null,
      },
    });

    const { ServiceWorkerRegistrar } = await import('./ServiceWorkerRegistrar');

    act(() => {
      root.render(<ServiceWorkerRegistrar />);
    });

    // The registration promise rejects asynchronously; wait for its .catch
    // handler to run rather than assuming a fixed number of microtask ticks.
    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        'Service Worker registration failed:',
        registrationError,
      );
    });
  });
});
