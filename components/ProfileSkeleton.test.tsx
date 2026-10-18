import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ProfileSkeleton } from './ProfileSkeleton';

describe('ProfileSkeleton', () => {
  it('renders without throwing', () => {
    expect(() => render(<ProfileSkeleton />)).not.toThrow();
  });

  it('marks the placeholder as decorative for assistive technology', () => {
    const { container } = render(<ProfileSkeleton />);
    const root = container.firstElementChild;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root).toHaveAttribute('role', 'presentation');
  });

  it('applies the pulse animation to signal a pending state', () => {
    const { container } = render(<ProfileSkeleton />);
    expect(container.firstElementChild).toHaveClass('animate-pulse');
  });

  it('mirrors the real profile page with a wallet card and a quick-links card', () => {
    const { container } = render(<ProfileSkeleton />);
    expect(container.querySelectorAll('.card')).toHaveLength(2);
  });
});
