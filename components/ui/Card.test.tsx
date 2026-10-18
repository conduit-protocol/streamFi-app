import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Card } from './Card';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

function render(ui: React.ReactElement) {
  act(() => { root.render(ui); });
}

describe('Card', () => {
  it('renders children', () => {
    render(<Card><p>Hello world</p></Card>);
    expect(container.textContent).toBe('Hello world');
  });

  it('renders a div element with the base "card" class', () => {
    render(<Card>content</Card>);
    const div = container.querySelector('div');
    expect(div).not.toBeNull();
    expect(div!.className).toContain('card');
  });

  it('is padded by default (no !p-0 override)', () => {
    render(<Card>content</Card>);
    const div = container.querySelector('div')!;
    expect(div.className).not.toContain('!p-0');
  });

  it('applies !p-0 when padded=false', () => {
    render(<Card padded={false}>content</Card>);
    const div = container.querySelector('div')!;
    expect(div.className).toContain('!p-0');
  });

  it('merges a custom className with the base card class', () => {
    render(<Card className="my-extra-class">content</Card>);
    const div = container.querySelector('div')!;
    expect(div.className).toContain('card');
    expect(div.className).toContain('my-extra-class');
  });

  it('passes through arbitrary HTML attributes', () => {
    render(<Card data-testid="my-card" id="card-1">content</Card>);
    const div = container.querySelector('div')!;
    expect(div.getAttribute('data-testid')).toBe('my-card');
    expect(div.id).toBe('card-1');
  });

  it('renders nested children pass-through (multiple nodes)', () => {
    render(
      <Card>
        <span>first</span>
        <span>second</span>
      </Card>,
    );
    const spans = container.querySelectorAll('span');
    expect(spans.length).toBe(2);
    expect(spans[0]!.textContent).toBe('first');
    expect(spans[1]!.textContent).toBe('second');
  });

  it('renders nothing extra when children are omitted', () => {
    render(<Card />);
    const div = container.querySelector('div')!;
    expect(div.textContent).toBe('');
  });
});
