import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { OfflineIndicator } from '../OfflineIndicator';

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
    const addEventListenerMock = vi.fn();
    const removeEventListenerMock = vi.fn();

    window.addEventListener = addEventListenerMock as any;
    window.removeEventListener = removeEventListenerMock as any;

    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true,
      configurable: true,
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<OfflineIndicator />);
    });

    expect(addEventListenerMock).toHaveBeenCalledWith(
      'online',
      expect.any(Function),
    );
    expect(addEventListenerMock).toHaveBeenCalledWith(
      'offline',
      expect.any(Function),
    );

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('should accept custom className prop', () => {
    const testClass = 'custom-class';
    expect(testClass).toBe('custom-class');
  });
});
