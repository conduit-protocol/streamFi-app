/**
 * Button — unit tests
 *
 * Coverage targets (per acceptance criteria):
 *   1. Variant rendering — each variant applies the correct CSS class.
 *   2. Default variant — renders as 'primary' when no variant is specified.
 *   3. Disabled state — button is disabled and click handler does not fire.
 *   4. Loading state — spinner is shown, button is disabled, click does not fire.
 *   5. Loading + explicit disabled — both conditions coexist without conflict.
 *   6. Click handler — fires when button is enabled.
 *   7. Children — rendered in all states.
 *   8. className passthrough — extra classes are appended.
 *   9. ref forwarding — ref points at the underlying <button> element.
 *  10. displayName — set correctly for DevTools.
 */

import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Button } from './Button';

// ── Helpers ────────────────────────────────────────────────────────────────────

function render(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  const button = () => container.querySelector('button') as HTMLButtonElement;
  const cleanup = () => {
    act(() => { root.unmount(); });
    document.body.removeChild(container);
  };
  return { container, button, cleanup };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Button — variant rendering', () => {
  it('applies btn-primary class for variant="primary"', () => {
    const { button, cleanup } = render(<Button variant="primary">Pay</Button>);
    expect(button().className).toContain('btn-primary');
    cleanup();
  });

  it('applies btn-secondary class for variant="secondary"', () => {
    const { button, cleanup } = render(<Button variant="secondary">Cancel</Button>);
    expect(button().className).toContain('btn-secondary');
    cleanup();
  });

  it('applies btn-ghost class for variant="ghost"', () => {
    const { button, cleanup } = render(<Button variant="ghost">Skip</Button>);
    expect(button().className).toContain('btn-ghost');
    cleanup();
  });

  it('defaults to btn-primary when no variant is provided', () => {
    const { button, cleanup } = render(<Button>Default</Button>);
    expect(button().className).toContain('btn-primary');
    cleanup();
  });

  it('does not apply other variant classes when a variant is set', () => {
    const { button, cleanup } = render(<Button variant="secondary">X</Button>);
    expect(button().className).not.toContain('btn-primary');
    expect(button().className).not.toContain('btn-ghost');
    cleanup();
  });
});

describe('Button — children rendering', () => {
  it('renders text children', () => {
    const { container, cleanup } = render(<Button>Withdraw</Button>);
    expect(container.textContent).toContain('Withdraw');
    cleanup();
  });

  it('renders element children', () => {
    const { container, cleanup } = render(
      <Button><span data-testid="icon">★</span> Send</Button>,
    );
    expect(container.querySelector('[data-testid="icon"]')).not.toBeNull();
    expect(container.textContent).toContain('Send');
    cleanup();
  });
});

describe('Button — disabled state', () => {
  it('disables the button when disabled=true', () => {
    const { button, cleanup } = render(<Button disabled>Submit</Button>);
    expect(button().disabled).toBe(true);
    cleanup();
  });

  it('does not fire onClick when disabled', () => {
    const handler = vi.fn();
    const { button, cleanup } = render(
      <Button disabled onClick={handler}>Submit</Button>,
    );
    act(() => { button().click(); });
    expect(handler).not.toHaveBeenCalled();
    cleanup();
  });

  it('is not disabled by default', () => {
    const { button, cleanup } = render(<Button>Submit</Button>);
    expect(button().disabled).toBe(false);
    cleanup();
  });
});

describe('Button — loading state', () => {
  it('disables the button when loading=true', () => {
    const { button, cleanup } = render(<Button loading>Loading</Button>);
    expect(button().disabled).toBe(true);
    cleanup();
  });

  it('does not fire onClick when loading', () => {
    const handler = vi.fn();
    const { button, cleanup } = render(
      <Button loading onClick={handler}>Submit</Button>,
    );
    act(() => { button().click(); });
    expect(handler).not.toHaveBeenCalled();
    cleanup();
  });

  it('renders the spinner SVG when loading=true', () => {
    const { button, cleanup } = render(<Button loading>Submit</Button>);
    const svg = button().querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.classList.contains('animate-spin')).toBe(true);
    cleanup();
  });

  it('does not render a spinner SVG when loading=false', () => {
    const { button, cleanup } = render(<Button>Submit</Button>);
    expect(button().querySelector('svg')).toBeNull();
    cleanup();
  });

  it('still renders children alongside the spinner when loading', () => {
    const { container, cleanup } = render(<Button loading>Processing</Button>);
    expect(container.textContent).toContain('Processing');
    cleanup();
  });

  it('disables the button when both loading and disabled are true', () => {
    const { button, cleanup } = render(<Button loading disabled>Submit</Button>);
    expect(button().disabled).toBe(true);
    cleanup();
  });
});

describe('Button — click handler', () => {
  it('fires onClick when the button is enabled', () => {
    const handler = vi.fn();
    const { button, cleanup } = render(<Button onClick={handler}>Go</Button>);
    act(() => { button().click(); });
    expect(handler).toHaveBeenCalledOnce();
    cleanup();
  });

  it('fires onClick multiple times on repeated clicks', () => {
    const handler = vi.fn();
    const { button, cleanup } = render(<Button onClick={handler}>Go</Button>);
    act(() => { button().click(); button().click(); button().click(); });
    expect(handler).toHaveBeenCalledTimes(3);
    cleanup();
  });
});

describe('Button — className passthrough', () => {
  it('appends extra className to the variant class', () => {
    const { button, cleanup } = render(
      <Button className="mt-4 w-full">Wide</Button>,
    );
    expect(button().className).toContain('btn-primary');
    expect(button().className).toContain('mt-4');
    expect(button().className).toContain('w-full');
    cleanup();
  });
});

describe('Button — ref forwarding', () => {
  it('forwards ref to the underlying <button> element', () => {
    const ref = createRef<HTMLButtonElement>();
    const { button, cleanup } = render(<Button ref={ref}>Ref</Button>);
    expect(ref.current).not.toBeNull();
    expect(ref.current).toBe(button());
    cleanup();
  });
});

describe('Button — displayName', () => {
  it('has displayName set to "Button"', () => {
    expect(Button.displayName).toBe('Button');
  });
});
