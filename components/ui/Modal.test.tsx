import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Modal } from './Modal';

describe('Modal', () => {
  let container: HTMLDivElement | undefined;
  let root: ReturnType<typeof createRoot> | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    container?.remove();
    container = undefined;
    root = undefined;
  });

  function render(ui: React.ReactElement) {
    root = createRoot(container!);
    act(() => root!.render(ui));
  }

  it('focuses the first focusable element (Close button) inside the modal on open', () => {
    render(
      <Modal title="Test" onClose={vi.fn()}>
        <button>Submit</button>
      </Modal>,
    );

    const closeButton = container!.querySelector('button[aria-label="Close"]');
    expect(document.activeElement).toBe(closeButton);
  });

  it('restores focus to the previously active element on unmount', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    render(
      <Modal title="Test" onClose={vi.fn()}>
        <button>Inside</button>
      </Modal>,
    );

    act(() => root?.unmount());
    root = undefined;

    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });

  it('traps forward Tab cycling within modal focusable elements', () => {
    const onClose = vi.fn();
    render(
      <Modal title="Test" onClose={onClose}>
        <button data-testid="btn-1">First</button>
        <button data-testid="btn-2">Second</button>
      </Modal>,
    );

    // DOM order: Close button (X), then "First", then "Second"
    const allButtons = container!.querySelectorAll('button');
    const closeBtn = allButtons[0]!;
    const firstBtn = allButtons[1]!;
    const secondBtn = allButtons[2]!;

    // Initial focus on Close button
    expect(document.activeElement).toBe(closeBtn);

    // Tab to First
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' })); });
    expect(document.activeElement).toBe(firstBtn);

    // Tab to Second
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' })); });
    expect(document.activeElement).toBe(secondBtn);

    // Tab wraps back to Close
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' })); });
    expect(document.activeElement).toBe(closeBtn);
  });

  it('traps reverse Shift+Tab cycling within modal focusable elements', () => {
    render(
      <Modal title="Test" onClose={vi.fn()}>
        <button data-testid="btn-1">First</button>
        <button data-testid="btn-2">Second</button>
      </Modal>,
    );

    const allButtons = container!.querySelectorAll('button');
    const closeBtn = allButtons[0]!;
    const firstBtn = allButtons[1]!;
    const lastBtn = allButtons[2]!;

    // Shift+Tab from Close wraps to last
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true })); });
    expect(document.activeElement).toBe(lastBtn);

    // Shift+Tab from last goes to previous (First button)
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true })); });
    expect(document.activeElement).toBe(firstBtn);

    // Shift+Tab from First wraps to Close
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true })); });
    expect(document.activeElement).toBe(closeBtn);
  });

  it('closes on Escape key', () => {
    const onClose = vi.fn();
    render(
      <Modal title="Test" onClose={onClose}>
        <button>Inside</button>
      </Modal>,
    );

    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when clicking the overlay background', () => {
    const onClose = vi.fn();
    render(
      <Modal title="Test" onClose={onClose}>
        <button>Inside</button>
      </Modal>,
    );

    const overlay = container!.querySelector('[role="dialog"]')!;
    act(() => { overlay.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when clicking inside the modal content', () => {
    const onClose = vi.fn();
    render(
      <Modal title="Test" onClose={onClose}>
        <button data-testid="inside-btn">Inside</button>
      </Modal>,
    );

    const innerButton = container!.querySelector('[data-testid="inside-btn"]')!;
    act(() => { innerButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onClose).not.toHaveBeenCalled();
  });
});
