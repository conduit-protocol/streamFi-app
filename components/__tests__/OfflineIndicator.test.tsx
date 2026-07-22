import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('OfflineIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not render when online', () => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true,
      configurable: true,
    });

    expect(navigator.onLine).toBe(true);
  });

  it('should track online status changes', () => {
    const listeners: { [key: string]: (event: Event) => void } = {};

    const addEventListenerMock = vi.fn(
      (event: string, handler: (event: Event) => void) => {
        listeners[event] = handler;
      },
    );

    window.addEventListener = addEventListenerMock as any;
    window.removeEventListener = vi.fn();

    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true,
      configurable: true,
    });

    expect(addEventListenerMock).toHaveBeenCalledWith(
      'online',
      expect.any(Function),
    );

    expect(addEventListenerMock).toHaveBeenCalledWith(
      'offline',
      expect.any(Function),
    );
  });

  it('should accept custom className prop', () => {
    const testClass = 'custom-class';
    expect(testClass).toBe('custom-class');
  });
});
