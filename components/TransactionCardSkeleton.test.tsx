import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TransactionCardSkeleton } from './TransactionCardSkeleton';

describe('TransactionCardSkeleton', () => {
  it('renders without throwing', () => {
    expect(() => render(<TransactionCardSkeleton />)).not.toThrow();
  });

  it('marks the placeholder as decorative for assistive technology', () => {
    const { container } = render(<TransactionCardSkeleton />);
    const root = container.firstElementChild;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root).toHaveAttribute('role', 'presentation');
  });

  it('applies the pulse animation to signal a pending state', () => {
    const { container } = render(<TransactionCardSkeleton />);
    expect(container.firstElementChild).toHaveClass('animate-pulse');
  });

  it('mirrors the real transaction table with six desktop columns', () => {
    const { container } = render(<TransactionCardSkeleton />);
    expect(container.querySelectorAll('thead th')).toHaveLength(6);
  });

  it('renders five placeholder rows matching the real table page size', () => {
    const { container } = render(<TransactionCardSkeleton />);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(5);
  });
});
