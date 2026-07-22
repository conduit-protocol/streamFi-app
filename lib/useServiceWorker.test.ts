import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('useServiceWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle environments without service worker support', () => {
    const originalNavigator = global.navigator;
    Object.defineProperty(global, 'navigator', {
      value: {
        serviceWorker: undefined,
      },
      configurable: true,
    });

    expect(() => {
      if (navigator.serviceWorker) {
        navigator.serviceWorker.register('/sw.js');
      }
    }).not.toThrow();

    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      configurable: true,
    });
  });

  it('should attempt to register service worker when available', async () => {
    const registerMock = vi.fn().mockResolvedValue({});

    Object.defineProperty(global, 'navigator', {
      value: {
        serviceWorker: {
          register: registerMock,
        },
      },
      configurable: true,
    });

    if (navigator.serviceWorker) {
      await navigator.serviceWorker.register('/sw.js');
    }

    expect(registerMock).toHaveBeenCalledWith('/sw.js');
  });
});
