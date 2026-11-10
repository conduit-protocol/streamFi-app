import React, { act } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { StreamQuickSearch } from '../StreamQuickSearch';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe('StreamQuickSearch (Issue #790)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockPush.mockClear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it('renders search form and input with accessible roles and attributes', () => {
    act(() => {
      root.render(React.createElement(StreamQuickSearch));
    });

    const form = container.querySelector('form[role="search"]');
    expect(form).toBeTruthy();
    expect(form?.getAttribute('data-testid')).toBe('stream-quick-search-form');

    const input = container.querySelector('input[data-testid="stream-quick-search-input"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.placeholder).toBe('Search stream ID or address...');
  });

  it('does not navigate when submitting empty or whitespace query', () => {
    act(() => {
      root.render(React.createElement(StreamQuickSearch));
    });

    const form = container.querySelector('form[role="search"]') as HTMLFormElement;
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(mockPush).not.toHaveBeenCalled();

    const input = container.querySelector('input[data-testid="stream-quick-search-input"]') as HTMLInputElement;
    act(() => {
      input.value = '   ';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('redirects to /stream/[id] when submitting a valid stream ID', () => {
    const onNavigate = vi.fn();
    act(() => {
      root.render(React.createElement(StreamQuickSearch, { onNavigate }));
    });

    const input = container.querySelector('input[data-testid="stream-quick-search-input"]') as HTMLInputElement;
    const form = container.querySelector('form[role="search"]') as HTMLFormElement;

    act(() => {
      // Simulate user typing stream ID
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      nativeSetter?.call(input, 'stream-42');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(mockPush).toHaveBeenCalledWith('/stream/stream-42');
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('');
  });

  it('safely URL-encodes stream ID or contract address on navigation', () => {
    act(() => {
      root.render(React.createElement(StreamQuickSearch));
    });

    const input = container.querySelector('input[data-testid="stream-quick-search-input"]') as HTMLInputElement;
    const form = container.querySelector('form[role="search"]') as HTMLFormElement;

    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      nativeSetter?.call(input, 'CA3D/special?key=val');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(mockPush).toHaveBeenCalledWith('/stream/CA3D%2Fspecial%3Fkey%3Dval');
  });

  it('shows clear button when query is entered and clears input on click', () => {
    act(() => {
      root.render(React.createElement(StreamQuickSearch));
    });

    const input = container.querySelector('input[data-testid="stream-quick-search-input"]') as HTMLInputElement;
    expect(container.querySelector('[data-testid="stream-quick-search-clear"]')).toBeNull();

    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      nativeSetter?.call(input, 'test-query');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const clearButton = container.querySelector('[data-testid="stream-quick-search-clear"]') as HTMLButtonElement;
    expect(clearButton).toBeTruthy();

    act(() => {
      clearButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(input.value).toBe('');
    expect(container.querySelector('[data-testid="stream-quick-search-clear"]')).toBeNull();
  });

  it('focuses search input when global "/" hotkey is pressed', () => {
    act(() => {
      root.render(React.createElement(StreamQuickSearch));
    });

    const input = container.querySelector('input[data-testid="stream-quick-search-input"]') as HTMLInputElement;
    const focusSpy = vi.spyOn(input, 'focus');

    act(() => {
      const slashEvent = new KeyboardEvent('keydown', {
        key: '/',
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(slashEvent);
    });

    expect(focusSpy).toHaveBeenCalled();
  });

  it('does not focus search input when "/" is typed inside another text input', () => {
    const otherInput = document.createElement('input');
    document.body.appendChild(otherInput);
    otherInput.focus();

    act(() => {
      root.render(React.createElement(StreamQuickSearch));
    });

    const input = container.querySelector('input[data-testid="stream-quick-search-input"]') as HTMLInputElement;
    const focusSpy = vi.spyOn(input, 'focus');

    act(() => {
      const slashEvent = new KeyboardEvent('keydown', {
        key: '/',
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(slashEvent);
    });

    expect(focusSpy).not.toHaveBeenCalled();
    otherInput.remove();
  });

  it('clears query and blurs input on Escape key', () => {
    act(() => {
      root.render(React.createElement(StreamQuickSearch));
    });

    const input = container.querySelector('input[data-testid="stream-quick-search-input"]') as HTMLInputElement;
    const blurSpy = vi.spyOn(input, 'blur');

    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      nativeSetter?.call(input, 'temporary');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    });

    act(() => {
      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      });
      window.dispatchEvent(escapeEvent);
    });

    expect(input.value).toBe('');
    expect(blurSpy).toHaveBeenCalled();
  });
});
