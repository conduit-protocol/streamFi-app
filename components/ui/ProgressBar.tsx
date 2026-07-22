'use client';

interface ProgressBarProps {
  /** 0–1 */
  value: number;
  /** aria-label for screen readers */
  label?: string;
}

export function ProgressBar({ value, label }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, value * 100));

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? `${Math.round(pct)}% complete`}
      className="relative h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden"
    >
      <div
        className="absolute inset-y-0 left-0 bg-black dark:bg-white rounded-full transition-[width] duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
