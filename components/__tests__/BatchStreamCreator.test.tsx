import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { BatchStreamCreator } from '../stream/BatchStreamCreator';

vi.mock('@/lib/format', () => ({
  truncateAddress: (a: string) => a,
}));

vi.mock('@/components/ui/Badge', () => ({ Badge: () => null }));
vi.mock('@/components/ui/ProgressBar', () => ({ ProgressBar: () => null }));

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function addRecipient(container: HTMLElement) {
  const inputs = container.querySelectorAll('input');
  const addressInput = inputs[0] as HTMLInputElement;
  const rateInput = inputs[1] as HTMLInputElement;
  const addButton = Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent === 'Add',
  )!;
  await act(async () => {
    setInputValue(addressInput, 'GABC123ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVW');
    setInputValue(rateInput, '100');
  });
  await act(async () => {
    addButton.click();
  });
}

function getCreateButton(container: HTMLElement) {
  return Array.from(container.querySelectorAll('button')).find((b) =>
    /Create|Submitting/.test(b.textContent || ''),
  ) as HTMLButtonElement;
}

describe('BatchStreamCreator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('completes the normal successful flow and shows success state', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<BatchStreamCreator />);
    });

    await addRecipient(container);

    const createButton = getCreateButton(container);
    await act(async () => {
      createButton.click();
    });

    // Advance past the mocked 2s SDK call.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(container.textContent).toContain('Batch Stream Created!');

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('does not throw or update state after unmount while submission is in flight', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const alertSpy = vi
      .spyOn(window, 'alert')
      .mockImplementation(() => {});

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<BatchStreamCreator />);
    });

    await addRecipient(container);

    const createButton = getCreateButton(container);
    await act(async () => {
      createButton.click();
    });

    // Unmount while the 2s async operation is still pending.
    act(() => {
      root.unmount();
    });

    // Flush the pending timer/abort after unmount — must not warn or throw.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    // No state-update-after-unmount error, and no user-facing alert.
    expect(errorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('unmounted'),
    );
    expect(alertSpy).not.toHaveBeenCalled();

    document.body.removeChild(container);
  });

  it('ignores a second submit while one is already in flight (double-submit guard)', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<BatchStreamCreator />);
    });

    await addRecipient(container);

    const createButton = getCreateButton(container);

    // Fire two clicks before the first submission resolves.
    await act(async () => {
      createButton.click();
      createButton.click();
    });

    const submitTimers = setTimeoutSpy.mock.calls.filter(
      ([, delay]) => delay === 2000,
    );
    expect(submitTimers).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(container.textContent).toContain('Batch Stream Created!');

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });
});
