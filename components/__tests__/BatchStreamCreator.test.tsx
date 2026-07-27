import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { BatchStreamCreator } from '../stream/BatchStreamCreator';

vi.mock('@/lib/format', () => ({
  truncateAddress: (a: string) => a,
}));

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
    /Create/.test(b.textContent || ''),
  ) as HTMLButtonElement;
}

describe('BatchStreamCreator', () => {
  it('shows an inline error for invalid Stellar address instead of alert', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<BatchStreamCreator />);
    });

    const inputs = container.querySelectorAll('input');
    const addressInput = inputs[0] as HTMLInputElement;
    const rateInput = inputs[1] as HTMLInputElement;
    const addButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Add',
    )!;

    await act(async () => {
      setInputValue(addressInput, 'INVALID');
      setInputValue(rateInput, '100');
    });
    await act(async () => {
      addButton.click();
    });

    expect(container.textContent).toContain('Invalid Stellar address');
    expect(container.querySelector('[role="alert"]')).toBeTruthy();

    act(() => { root.unmount(); });
    document.body.removeChild(container);
  });

  it('shows an inline error for rate of zero instead of alert', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<BatchStreamCreator />);
    });

    const inputs = container.querySelectorAll('input');
    const addressInput = inputs[0] as HTMLInputElement;
    const rateInput = inputs[1] as HTMLInputElement;
    const addButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Add',
    )!;

    await act(async () => {
      setInputValue(addressInput, 'GABC123ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVW');
      setInputValue(rateInput, '0');
    });
    await act(async () => {
      addButton.click();
    });

    expect(container.textContent).toContain('Rate must be greater than zero');
    expect(container.querySelector('[role="alert"]')).toBeTruthy();

    act(() => { root.unmount(); });
    document.body.removeChild(container);
  });

  it('shows a deprecation message when clicking create (SDK not yet available)', async () => {
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

    expect(container.textContent).toContain('not yet available');

    act(() => { root.unmount(); });
    document.body.removeChild(container);
  });

  it('disables the create button when no recipients are added', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<BatchStreamCreator />);
    });

    const createButton = getCreateButton(container);
    expect(createButton.disabled).toBe(true);

    act(() => { root.unmount(); });
    document.body.removeChild(container);
  });

  it('enables the create button after adding recipients', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<BatchStreamCreator />);
    });

    await addRecipient(container);

    const createButton = getCreateButton(container);
    expect(createButton.disabled).toBe(false);

    act(() => { root.unmount(); });
    document.body.removeChild(container);
  });

  it('adds and removes recipients correctly', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<BatchStreamCreator />);
    });

    await addRecipient(container);
    expect(container.textContent).toContain('GABC123');
    expect(container.textContent).toContain('100/s');

    const removeButtons = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.textContent === 'Remove',
    );
    expect(removeButtons).toHaveLength(1);

    await act(async () => {
      removeButtons[0]!.click();
    });

    expect(container.textContent).toContain('No recipients added yet');

    act(() => { root.unmount(); });
    document.body.removeChild(container);
  });

  it('clears the error when adding a valid recipient after an error', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<BatchStreamCreator />);
    });

    const inputs = container.querySelectorAll('input');
    const addressInput = inputs[0] as HTMLInputElement;
    const rateInput = inputs[1] as HTMLInputElement;
    const addButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Add',
    )!;

    await act(async () => {
      setInputValue(addressInput, 'INVALID');
      setInputValue(rateInput, '100');
    });
    await act(async () => {
      addButton.click();
    });

    expect(container.textContent).toContain('Invalid Stellar address');

    await act(async () => {
      setInputValue(addressInput, 'GABC123ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVW');
      setInputValue(rateInput, '100');
    });
    await act(async () => {
      addButton.click();
    });

    expect(container.textContent).not.toContain('Invalid Stellar address');

    act(() => { root.unmount(); });
    document.body.removeChild(container);
  });
});
