import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect } from 'vitest';
import { StreamCardSkeleton } from '../StreamCardSkeleton';

describe('StreamCardSkeleton', () => {
  it('renders with correct accessibility attributes', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamCardSkeleton />);
    });

    const skeleton = container.querySelector('[role="presentation"]');
    expect(skeleton).not.toBeNull();
    expect(skeleton).toHaveAttribute('aria-hidden', 'true');

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('renders with card class for styling', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamCardSkeleton />);
    });

    const skeleton = container.querySelector('.card');
    expect(skeleton).not.toBeNull();
    expect(skeleton).toHaveClass('animate-pulse');

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('renders all placeholder skeleton elements', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamCardSkeleton />);
    });

    const skeletons = container.querySelectorAll('[class*="bg-gray-200"], [class*="dark:bg-gray-700"]');
    expect(skeletons.length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('renders top row with counterparty, rate, and badge placeholders', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamCardSkeleton />);
    });

    const topRow = container.querySelector('.flex.items-center.justify-between.gap-2.mb-3');
    expect(topRow).not.toBeNull();

    const placeholders = topRow!.querySelectorAll('div[class*="bg-gray-"]');
    expect(placeholders.length).toBeGreaterThanOrEqual(4);

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('renders progress bar placeholder', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamCardSkeleton />);
    });

    const progressBar = container.querySelector('.h-1\\.5.w-full.rounded-full');
    expect(progressBar).not.toBeNull();
    expect(progressBar).toHaveClass('animate-pulse');

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('renders footer row with token address and percentage placeholders', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamCardSkeleton />);
    });

    const footerRow = container.querySelector('.flex.items-center.justify-between.mt-3');
    expect(footerRow).not.toBeNull();

    const placeholders = footerRow!.querySelectorAll('div[class*="bg-gray-"]');
    expect(placeholders.length).toBe(2);

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('matches layout of the loading skeleton with proper spacing', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamCardSkeleton />);
    });

    const skeleton = container.querySelector('.card');
    expect(skeleton).toHaveClass('animate-pulse');

    const children = skeleton!.children;
    expect(children.length).toBeGreaterThanOrEqual(3);

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('renders consistent dark mode placeholders', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamCardSkeleton />);
    });

    const placeholders = container.querySelectorAll('.dark\\:bg-gray-700');
    expect(placeholders.length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });
});
