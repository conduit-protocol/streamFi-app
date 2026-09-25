import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressBar } from './ProgressBar';

describe('ProgressBar — value clamping', () => {
  it('renders 0% for value 0', () => {
    render(<ProgressBar value={0} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
  });

  it('renders 100% for value 1', () => {
    render(<ProgressBar value={1} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '100');
  });

  it('renders an intermediate percentage correctly', () => {
    render(<ProgressBar value={0.42} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '42');
  });

  it('clamps negative values to 0%', () => {
    render(<ProgressBar value={-0.5} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
  });

  it('clamps out-of-range values above 1 to 100%', () => {
    render(<ProgressBar value={1.5} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '100');
  });

  it('clamps a large out-of-range value to 100%', () => {
    render(<ProgressBar value={100} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '100');
  });

  it('sets the fill width style proportional to the clamped percentage', () => {
    const { container } = render(<ProgressBar value={0.75} />);
    const fill = container.querySelector('[style*="width"]') as HTMLElement;
    expect(fill.style.width).toBe('75%');
  });

  it('clamps the fill width to 100% for out-of-range input', () => {
    const { container } = render(<ProgressBar value={5} />);
    const fill = container.querySelector('[style*="width"]') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });
});

describe('ProgressBar — ARIA attributes', () => {
  it('has role="progressbar"', () => {
    render(<ProgressBar value={0.5} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('always sets aria-valuemin to 0 and aria-valuemax to 100', () => {
    render(<ProgressBar value={0.5} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('generates a default aria-label with the rounded percentage when no label is given', () => {
    render(<ProgressBar value={0.33} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-label', '33% complete');
  });

  it('uses a custom aria-label when provided', () => {
    render(<ProgressBar value={0.5} label="Withdrawal progress" />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-label', 'Withdrawal progress');
  });

  it('rounds aria-valuenow to the nearest integer', () => {
    render(<ProgressBar value={0.666} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '67');
  });
});
