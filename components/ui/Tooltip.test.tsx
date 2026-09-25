/**
 * Tooltip — unit tests
 *
 * Coverage targets:
 *   1. Children are always rendered.
 *   2. Tooltip content is hidden by default.
 *   3. Tooltip content appears on mouseenter, disappears on mouseleave.
 *   4. Tooltip content appears on focus, disappears on blur.
 *   5. The tooltip element carries role="tooltip".
 *   6. aria-describedby is set on the wrapper while the tooltip is visible.
 *   7. Default side is 'top' — tooltip container gets the mb-2 class.
 *   8. side="bottom" — tooltip container gets the mt-2 class instead.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Tooltip } from './Tooltip';

// ── Helpers ────────────────────────────────────────────────────────────────────

function render(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });

  const wrapper = () => container.querySelector('span.relative') as HTMLSpanElement;
  const tooltip = () => container.querySelector('[role="tooltip"]') as HTMLSpanElement | null;

  const cleanup = () => {
    act(() => { root.unmount(); });
    document.body.removeChild(container);
  };

  return { container, wrapper, tooltip, cleanup };
}

function dispatch(el: Element, eventName: string) {
  act(() => { el.dispatchEvent(new Event(eventName, { bubbles: true })); });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Tooltip — children', () => {
  it('always renders its children', () => {
    const { container, cleanup } = render(
      <Tooltip content="tip text"><button>click me</button></Tooltip>,
    );
    expect(container.querySelector('button')).not.toBeNull();
    expect(container.querySelector('button')?.textContent).toBe('click me');
    cleanup();
  });
});

describe('Tooltip — default hidden state', () => {
  it('does not render the tooltip element before interaction', () => {
    const { tooltip, cleanup } = render(
      <Tooltip content="hidden tip"><span>child</span></Tooltip>,
    );
    expect(tooltip()).toBeNull();
    cleanup();
  });
});

describe('Tooltip — mouseenter / mouseleave', () => {
  it('shows the tooltip on mouseenter', () => {
    const { wrapper, tooltip, cleanup } = render(
      <Tooltip content="hover tip"><span>child</span></Tooltip>,
    );
    dispatch(wrapper(), 'mouseenter');
    expect(tooltip()).not.toBeNull();
    expect(tooltip()?.textContent).toContain('hover tip');
    cleanup();
  });

  it('hides the tooltip on mouseleave', () => {
    const { wrapper, tooltip, cleanup } = render(
      <Tooltip content="hover tip"><span>child</span></Tooltip>,
    );
    dispatch(wrapper(), 'mouseenter');
    expect(tooltip()).not.toBeNull();
    dispatch(wrapper(), 'mouseleave');
    expect(tooltip()).toBeNull();
    cleanup();
  });
});

describe('Tooltip — focus / blur', () => {
  it('shows the tooltip on focus', () => {
    const { wrapper, tooltip, cleanup } = render(
      <Tooltip content="focus tip"><button>trigger</button></Tooltip>,
    );
    dispatch(wrapper(), 'focus');
    expect(tooltip()).not.toBeNull();
    expect(tooltip()?.textContent).toContain('focus tip');
    cleanup();
  });

  it('hides the tooltip on blur', () => {
    const { wrapper, tooltip, cleanup } = render(
      <Tooltip content="focus tip"><button>trigger</button></Tooltip>,
    );
    dispatch(wrapper(), 'focus');
    expect(tooltip()).not.toBeNull();
    dispatch(wrapper(), 'blur');
    expect(tooltip()).toBeNull();
    cleanup();
  });
});

describe('Tooltip — accessibility', () => {
  it('tooltip element has role="tooltip"', () => {
    const { wrapper, tooltip, cleanup } = render(
      <Tooltip content="a11y tip"><span>child</span></Tooltip>,
    );
    dispatch(wrapper(), 'mouseenter');
    expect(tooltip()?.getAttribute('role')).toBe('tooltip');
    cleanup();
  });

  it('wrapper sets aria-describedby while tooltip is visible', () => {
    const { wrapper, tooltip, cleanup } = render(
      <Tooltip content="a11y tip"><span>child</span></Tooltip>,
    );
    expect(wrapper().getAttribute('aria-describedby')).toBeNull();
    dispatch(wrapper(), 'mouseenter');
    const id = tooltip()?.getAttribute('id');
    expect(id).toBeTruthy();
    expect(wrapper().getAttribute('aria-describedby')).toBe(id);
    cleanup();
  });

  it('wrapper removes aria-describedby after tooltip hides', () => {
    const { wrapper, cleanup } = render(
      <Tooltip content="a11y tip"><span>child</span></Tooltip>,
    );
    dispatch(wrapper(), 'mouseenter');
    dispatch(wrapper(), 'mouseleave');
    expect(wrapper().getAttribute('aria-describedby')).toBeNull();
    cleanup();
  });
});

describe('Tooltip — side prop', () => {
  it('default side is top — tooltip carries the mb-2 class', () => {
    const { wrapper, tooltip, cleanup } = render(
      <Tooltip content="top tip"><span>child</span></Tooltip>,
    );
    dispatch(wrapper(), 'mouseenter');
    expect(tooltip()?.className).toContain('mb-2');
    expect(tooltip()?.className).not.toContain('mt-2');
    cleanup();
  });

  it('side="bottom" — tooltip carries the mt-2 class', () => {
    const { wrapper, tooltip, cleanup } = render(
      <Tooltip content="bottom tip" side="bottom"><span>child</span></Tooltip>,
    );
    dispatch(wrapper(), 'mouseenter');
    expect(tooltip()?.className).toContain('mt-2');
    expect(tooltip()?.className).not.toContain('mb-2');
    cleanup();
  });
});
