/**
 * Input — unit tests
 *
 * Coverage targets:
 *   1. Renders a plain input with no label/hint/error.
 *   2. Renders a label wired to the input via htmlFor/id when provided.
 *   3. Renders a hint paragraph when hint is set and there is no error.
 *   4. Renders an error paragraph (role="alert") when error is set, and
 *      suppresses the hint while an error is present.
 *   5. Sets aria-invalid="true" only when error is set.
 *   6. aria-describedby points at the error id when there's an error, the
 *      hint id when there's only a hint, and is unset otherwise.
 *   7. Uses a generated id (via useId) when no id prop is passed, and
 *      respects an explicit id when one is passed.
 *   8. Applies the error border classes only when error is set.
 *   9. className passthrough — extra classes are appended.
 *  10. ref forwarding — ref points at the underlying <input> element.
 *  11. Other InputHTMLAttributes (value, placeholder, onChange, disabled) pass through.
 *  12. displayName is set for DevTools.
 */

import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi } from 'vitest';
import { Input } from './Input';

// ── Helpers ────────────────────────────────────────────────────────────────────

function render(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  const input = () => container.querySelector('input') as HTMLInputElement;
  const label = () => container.querySelector('label') as HTMLLabelElement | null;
  const cleanup = () => {
    act(() => { root.unmount(); });
    document.body.removeChild(container);
  };
  return { container, input, label, cleanup };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Input — basic rendering', () => {
  it('renders a bare input with no label, hint, or error', () => {
    const { container, input, cleanup } = render(<Input />);
    expect(input()).not.toBeNull();
    expect(container.querySelector('label')).toBeNull();
    expect(container.querySelector('p')).toBeNull();
    cleanup();
  });
});

describe('Input — label', () => {
  it('renders a label wired to the input via htmlFor/id', () => {
    const { input, label, cleanup } = render(<Input label="Amount" id="amount" />);
    expect(label()?.textContent).toBe('Amount');
    expect(label()?.getAttribute('for')).toBe('amount');
    expect(input().id).toBe('amount');
    cleanup();
  });

  it('does not render a label element when label is omitted', () => {
    const { label, cleanup } = render(<Input />);
    expect(label()).toBeNull();
    cleanup();
  });
});

describe('Input — hint', () => {
  it('renders the hint text when hint is set and there is no error', () => {
    const { container, cleanup } = render(<Input hint="Must be positive" />);
    const hint = container.querySelector('p');
    expect(hint?.textContent).toBe('Must be positive');
    cleanup();
  });

  it('suppresses the hint when both hint and error are set', () => {
    const { container, cleanup } = render(<Input hint="a hint" error="an error" />);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBe(1);
    expect(paragraphs[0]?.textContent).toBe('an error');
    cleanup();
  });
});

describe('Input — error', () => {
  it('renders the error text with role="alert"', () => {
    const { container, cleanup } = render(<Input error="Required field" />);
    const error = container.querySelector('p[role="alert"]');
    expect(error?.textContent).toBe('Required field');
    cleanup();
  });

  it('sets aria-invalid="true" when error is set', () => {
    const { input, cleanup } = render(<Input error="Required field" />);
    expect(input().getAttribute('aria-invalid')).toBe('true');
    cleanup();
  });

  it('does not set aria-invalid when there is no error', () => {
    const { input, cleanup } = render(<Input />);
    expect(input().hasAttribute('aria-invalid')).toBe(false);
    cleanup();
  });

  it('applies the error border classes when error is set', () => {
    const { input, cleanup } = render(<Input error="bad" />);
    expect(input().className).toContain('border-black');
    expect(input().className).toContain('border-2');
    cleanup();
  });

  it('does not apply error border classes when there is no error', () => {
    const { input, cleanup } = render(<Input />);
    expect(input().className).not.toContain('border-2');
    cleanup();
  });
});

describe('Input — aria-describedby', () => {
  it('points at the error id when an error is present', () => {
    const { input, cleanup } = render(<Input id="field" error="oops" hint="a hint" />);
    expect(input().getAttribute('aria-describedby')).toBe('field-error');
    cleanup();
  });

  it('points at the hint id when only a hint is present', () => {
    const { input, cleanup } = render(<Input id="field" hint="a hint" />);
    expect(input().getAttribute('aria-describedby')).toBe('field-hint');
    cleanup();
  });

  it('is unset when there is neither hint nor error', () => {
    const { input, cleanup } = render(<Input id="field" />);
    expect(input().hasAttribute('aria-describedby')).toBe(false);
    cleanup();
  });
});

describe('Input — id generation', () => {
  it('generates an id via useId when none is provided', () => {
    const { input, cleanup } = render(<Input label="Auto" />);
    expect(input().id).toBeTruthy();
    cleanup();
  });

  it('uses the explicit id prop over the generated one', () => {
    const { input, cleanup } = render(<Input id="explicit-id" label="X" />);
    expect(input().id).toBe('explicit-id');
    cleanup();
  });
});

describe('Input — className passthrough', () => {
  it('appends extra className to the input', () => {
    const { input, cleanup } = render(<Input className="mt-2 w-full" />);
    expect(input().className).toContain('input');
    expect(input().className).toContain('mt-2');
    expect(input().className).toContain('w-full');
    cleanup();
  });
});

describe('Input — ref forwarding', () => {
  it('forwards ref to the underlying <input> element', () => {
    const ref = createRef<HTMLInputElement>();
    const { input, cleanup } = render(<Input ref={ref} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current).toBe(input());
    cleanup();
  });
});

describe('Input — attribute passthrough', () => {
  it('passes through standard input attributes and events', () => {
    const handler = vi.fn();
    const { input, cleanup } = render(
      <Input value="hello" placeholder="type here" disabled onChange={handler} readOnly />,
    );
    expect(input().value).toBe('hello');
    expect(input().placeholder).toBe('type here');
    expect(input().disabled).toBe(true);
    cleanup();
  });
});

describe('Input — displayName', () => {
  it('has displayName set to "Input"', () => {
    expect(Input.displayName).toBe('Input');
  });
});
